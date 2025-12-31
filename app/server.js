require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { nanoid } = require("nanoid");
const { Server } = require("socket.io");

const { makePool, migrate, ensureUserRating, getRating, upsertRating } = require("./db");
const {
  initialBoard, computeMoves, applyMove, serializeMoveMap, hasAnyPieces, colorOf
} = require("./game");

const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev";
const TRUST_PROXY = (process.env.TRUST_PROXY || "false").toLowerCase() === "true";

if (!DATABASE_URL) throw new Error("DATABASE_URL faltante");

const pool = makePool(DATABASE_URL);

function eloUpdate(rA, rB, scoreA, k = 32) {
  const expA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const expB = 1 - expA;
  const scoreB = 1 - scoreA;
  return {
    newA: Math.round(rA + k * (scoreA - expA)),
    newB: Math.round(rB + k * (scoreB - expB))
  };
}

async function main() {
  await migrate(pool);

  const app = express();
  app.set("trust proxy", TRUST_PROXY);

  app.use(helmet({
    contentSecurityPolicy: false // simple para no pelear con inline scripts del demo
  }));
  app.use(express.json());

  app.use("/api", rateLimit({
    windowMs: 60_000,
    limit: 120
  }));

  const sessionMiddleware = session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  });

  app.use(sessionMiddleware);

  // ---------- Auth ----------
  const credsSchema = z.object({
    username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(6).max(200)
  });

  function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: "no_auth" });
    next();
  }

  app.post("/api/auth/register", async (req, res) => {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "bad_input" });

    const { username, password } = parsed.data;
    const hash = await bcrypt.hash(password, 10);

    try {
      const { rows } = await pool.query(
        `INSERT INTO app_users (username, password_hash)
         VALUES ($1,$2)
         RETURNING id, username`,
        [username, hash]
      );
      const user = rows[0];
      await ensureUserRating(pool, user.id);
      req.session.userId = user.id;
      req.session.username = user.username;
      return res.json({ ok: true, user: { id: user.id, username: user.username } });
    } catch (e) {
      return res.status(409).json({ error: "username_taken" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "bad_input" });

    const { username, password } = parsed.data;
    const { rows } = await pool.query(
      `SELECT id, username, password_hash FROM app_users WHERE username=$1`,
      [username]
    );
    if (!rows[0]) return res.status(401).json({ error: "bad_credentials" });
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "bad_credentials" });

    await ensureUserRating(pool, rows[0].id);
    req.session.userId = rows[0].id;
    req.session.username = rows[0].username;
    return res.json({ ok: true, user: { id: rows[0].id, username: rows[0].username } });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/me", async (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    const r = await getRating(pool, req.session.userId);
    return res.json({ user: { id: req.session.userId, username: req.session.username, rating: r?.rating ?? 1200 } });
  });

  // ---------- Leaderboard ----------
  app.get("/api/leaderboard", async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT u.username, r.rating, r.wins, r.losses, r.draws, r.games
      FROM ratings r
      JOIN app_users u ON u.id = r.user_id
      ORDER BY r.rating DESC, r.wins DESC
      LIMIT 50
    `);
    res.json({ leaderboard: rows });
  });

  // ---------- Static ----------
  app.use(express.static(path.join(__dirname, "public")));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: false } });

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, (err) => {
      if (err) return next(err);
      const sess = socket.request.session;
      if (sess?.userId) {
        socket.data.userId = sess.userId;
        socket.data.username = sess.username;
      }
      next();
    });
  });

  // ---------- Game Rooms (in-memory state) ----------
  const rooms = new Map(); // roomCode -> roomState
  const userRoomMap = new Map(); // userId -> { code, color }
  const globalMessages = [];
  const lobbyRoomName = "lobby";
  const MAX_ROOM_MSGS = 100;
  const MAX_GLOBAL_MSGS = 200;

  function computeRoomState(room) {
    const moves = computeMoves(room.board, room.turn);
    room.forced = moves.forced;
    room.moveMap = serializeMoveMap([...moves.captures, ...moves.normals]);
    room.captureMap = serializeMoveMap(moves.captures);
    room.availableCaptures = moves.captures;
    room.availableNormals = moves.normals;
  }

  function makeRoomState({ code, name, mode, redUser, blackUser, ai = false }) {
    const board = initialBoard();
    const turn = "red"; // rojo parte
    const room = {
      code,
      name: name || `Sala ${code}`,
      mode, // 'pvp' | 'ai'
      createdAt: Date.now(),
      board,
      turn,
      forced: false,
      moveMap: {},
      captureMap: {},
      availableCaptures: [],
      availableNormals: [],
      players: {
        red: redUser,   // { id, username, sid }
        black: blackUser // idem o null si no llegó / IA
      },
      observers: new Map(), // socketId -> { username }
      ai,
      lastMove: null,
      over: false,
      pendingDraw: null,
      pendingBlow: null,
      messages: []
    };
    computeRoomState(room);
    return room;
  }

  function roomStatus(room) {
    if (room.over) return "finished";
    if (room.players.red && room.players.black) return "in_game";
    return "waiting";
  }

  function publicStateFor(room) {
    return {
      code: room.code,
      name: room.name,
      mode: room.mode,
      board: room.board,
      turn: room.turn,
      forced: room.forced,
      moveMap: room.moveMap,
      captureMap: room.captureMap,
      players: {
        red: room.players.red ? { id: room.players.red.id, username: room.players.red.username } : null,
        black: room.players.black ? { id: room.players.black.id, username: room.players.black.username } : (room.ai ? { username: "AI" } : null)
      },
      lastMove: room.lastMove,
      over: room.over,
      pendingDraw: room.pendingDraw,
      pendingBlow: room.pendingBlow,
      observers: room.observers.size,
      status: roomStatus(room),
      messages: room.messages.slice(-MAX_ROOM_MSGS).map(m => ({
        id: m.id,
        user: m.username,
        text: m.text,
        ts: m.ts
      }))
    };
  }

  function recompute(room) {
    computeRoomState(room);
    // sin movimientos = pierde el jugador del turno
    if (Object.keys(room.moveMap).length === 0) {
      room.over = true;
      return { over: true, winner: room.turn === "red" ? "black" : "red", reason: "no_moves" };
    }
    // sin piezas
    if (!hasAnyPieces(room.board, "red")) {
      room.over = true;
      return { over: true, winner: "black", reason: "no_pieces" };
    }
    if (!hasAnyPieces(room.board, "black")) {
      room.over = true;
      return { over: true, winner: "red", reason: "no_pieces" };
    }
    return { over: false };
  }

  function isUsersTurn(room, userId) {
    const p = room.players[room.turn];
    return p && p.id === userId;
  }

  function pushChatMessage(room, { userId, username, text }) {
    if (!text) return;
    const msg = {
      id: nanoid(8),
      userId,
      username,
      text,
      ts: Date.now()
    };
    room.messages.push(msg);
    if (room.messages.length > MAX_ROOM_MSGS) {
      room.messages = room.messages.slice(-MAX_ROOM_MSGS);
    }
    return msg;
  }

  async function finalizeRatedGame(room, winnerColor) {
    // Solo rankeamos pvp humano vs humano
    if (room.mode !== "pvp") return;

    const red = room.players.red;
    const black = room.players.black;
    if (!red || !black) return;

    await ensureUserRating(pool, red.id);
    await ensureUserRating(pool, black.id);

    const redR = await getRating(pool, red.id);
    const blackR = await getRating(pool, black.id);

    let scoreRed = 0.5;
    let result = "draw";
    let winnerId = null;

    if (winnerColor === "red") { scoreRed = 1; result = "red"; winnerId = red.id; }
    else if (winnerColor === "black") { scoreRed = 0; result = "black"; winnerId = black.id; }

    const { newA, newB } = eloUpdate(redR.rating, blackR.rating, scoreRed);

    const redWins = redR.wins + (result === "red" ? 1 : 0);
    const redLoss = redR.losses + (result === "black" ? 1 : 0);
    const redDraw = redR.draws + (result === "draw" ? 1 : 0);

    const blkWins = blackR.wins + (result === "black" ? 1 : 0);
    const blkLoss = blackR.losses + (result === "red" ? 1 : 0);
    const blkDraw = blackR.draws + (result === "draw" ? 1 : 0);

    await upsertRating(pool, red.id, {
      rating: newA,
      wins: redWins,
      losses: redLoss,
      draws: redDraw,
      games: redR.games + 1,
      last_played: new Date()
    });

    await upsertRating(pool, black.id, {
      rating: newB,
      wins: blkWins,
      losses: blkLoss,
      draws: blkDraw,
      games: blackR.games + 1,
      last_played: new Date()
    });

    await pool.query(
      `INSERT INTO games (rated, room_code, player_red, player_black, winner, result, moves)
       VALUES (true, $1, $2, $3, $4, $5, $6)`,
      [room.code, red.id, black.id, winnerId, result, JSON.stringify({ lastMove: room.lastMove })]
    );
  }

  function lobbyList() {
    return Array.from(rooms.values()).map((room) => ({
      code: room.code,
      name: room.name,
      status: roomStatus(room),
      players: [
        room.players.red ? room.players.red.username : null,
        room.players.black ? room.players.black.username : (room.ai ? "AI" : null)
      ],
      observers: room.observers.size,
      over: room.over
    }));
  }

  function emitLobby() {
    io.to(lobbyRoomName).emit("lobbyRooms", lobbyList());
  }

  function pickRandomMove(room) {
    const pool = room.availableCaptures.length > 0 ? room.availableCaptures : room.availableNormals;
    if (!pool || pool.length === 0) return null;
    const mv = pool[Math.floor(Math.random() * pool.length)];
    return { from: mv.from, path: mv.path };
  }

  async function maybePlayAI(room) {
    if (!room.ai || room.over) return;
    if (room.turn !== "black") return;

    room.pendingBlow = null;
    room.pendingDraw = null;
    const m = pickRandomMove(room);
    if (!m) return;

    const move = { from: m.from, path: m.path, captures: [] };
    room.board = applyMove(room.board, move);
    room.lastMove = { color: "black", path: move.path };
    room.turn = "red";

    const chk = recompute(room);
    io.to(room.code).emit("state", publicStateFor(room));
    if (chk.over) {
      io.to(room.code).emit("gameOver", chk);
    }
  }

  io.on("connection", (socket) => {
    const sess = socket.request.session;
    if (sess?.userId) {
      socket.data.userId = sess.userId;
      socket.data.username = sess.username;
    }

    const announceResume = () => {
      if (socket.data.userId && userRoomMap.has(socket.data.userId)) {
        const ref = userRoomMap.get(socket.data.userId);
        const room = rooms.get(ref.code);
        if (room && !room.over) {
          socket.emit("resumePrompt", { code: room.code, name: room.name });
        } else {
          userRoomMap.delete(socket.data.userId);
        }
      }
    };

    socket.join(lobbyRoomName);
    socket.emit("lobbyRooms", lobbyList());
    socket.emit("globalChatHistory", globalMessages);
    announceResume();

    function ensureAuth() {
      if (!socket.data.userId) {
        socket.emit("err", { error: "no_auth" });
        return false;
      }
      return true;
    }

    function ensurePlayer(room) {
      const uid = socket.data.userId;
      if (!uid) return null;
      if (room.players.red?.id === uid) return "red";
      if (room.players.black?.id === uid) return "black";
      return null;
    }

    function sendState(room) {
      io.to(room.code).emit("state", publicStateFor(room));
    }

    socket.on("setUser", async ({ userId, username }) => {
      socket.data.userId = userId;
      socket.data.username = username;
      socket.emit("userOk");
      socket.join(lobbyRoomName);
      socket.emit("lobbyRooms", lobbyList());
      announceResume();
    });

    socket.on("listRooms", () => socket.emit("lobbyRooms", lobbyList()));

    socket.on("newRoom", async ({ mode, name }) => {
      if (!ensureAuth()) return;

      const code = nanoid(6).toUpperCase();
      const redUser = { id: socket.data.userId, username: socket.data.username, sid: socket.id };

      let room;
      if (mode === "ai") {
        room = makeRoomState({ code, name, mode: "ai", redUser, blackUser: null, ai: true });
      } else {
        room = makeRoomState({ code, name, mode: "pvp", redUser, blackUser: null, ai: false });
      }

      rooms.set(code, room);
      socket.join(code);
      userRoomMap.set(redUser.id, { code, color: "red" });
      emitLobby();
      socket.emit("roomCreated", { code });
      sendState(room);
      if (room.ai) maybePlayAI(room);
    });

    socket.on("joinRoom", async ({ code }) => {
      if (!ensureAuth()) return;
      const room = rooms.get(code);
      if (!room) return socket.emit("err", { error: "room_not_found" });

      if (room.mode !== "pvp" || room.ai) return socket.emit("err", { error: "room_not_joinable" });
      if (room.players.black) return socket.emit("err", { error: "room_full" });
      if (room.players.red?.id === socket.data.userId) return socket.emit("err", { error: "same_user" });

      room.players.black = { id: socket.data.userId, username: socket.data.username, sid: socket.id };

      socket.join(code);
      userRoomMap.set(socket.data.userId, { code, color: "black" });
      emitLobby();
      sendState(room);
    });

    socket.on("observeRoom", ({ code }) => {
      const room = rooms.get(code);
      if (!room) return socket.emit("err", { error: "room_not_found" });
      room.observers.set(socket.id, { username: socket.data.username || "Observador" });
      socket.join(code);
      emitLobby();
      sendState(room);
    });

    socket.on("leaveRoom", ({ code }) => {
      const room = rooms.get(code);
      if (!room) return;
      socket.leave(code);
      if (room.observers.has(socket.id)) {
        room.observers.delete(socket.id);
        emitLobby();
      }
      sendState(room);
    });

    socket.on("rejoinRoom", ({ code }) => {
      if (!ensureAuth()) return;
      const ref = userRoomMap.get(socket.data.userId);
      if (!ref || ref.code !== code) return socket.emit("err", { error: "no_active_room" });
      const room = rooms.get(code);
      if (!room) {
        userRoomMap.delete(socket.data.userId);
        return socket.emit("err", { error: "room_not_found" });
      }
      const color = ref.color;
      if (room.players[color]) room.players[color].sid = socket.id;
      socket.join(code);
      sendState(room);
    });

    socket.on("declineResume", ({ code }) => {
      if (!ensureAuth()) return;
      const ref = userRoomMap.get(socket.data.userId);
      if (ref?.code === code) userRoomMap.delete(socket.data.userId);
    });

    socket.on("move", async ({ code, path }) => {
      const room = rooms.get(code);
      if (!room) return;
      if (room.over) return;

      const userId = socket.data.userId;
      if (!userId) return socket.emit("err", { error: "no_auth" });
      if (!isUsersTurn(room, userId)) return socket.emit("err", { error: "not_your_turn" });

      if (!Array.isArray(path) || path.length < 2) return socket.emit("err", { error: "bad_move" });

      if (room.pendingBlow && room.turn === ensurePlayer(room)) {
        room.pendingBlow = null;
      }

      const moves = computeMoves(room.board, room.turn);
      const allMoves = [...moves.captures, ...moves.normals];
      const match = allMoves.find((m) => JSON.stringify(m.path) === JSON.stringify(path));
      if (!match) return socket.emit("err", { error: "illegal_move" });

      const isCapture = moves.captures.some((m) => JSON.stringify(m.path) === JSON.stringify(path));
      const skippedCapture = moves.captures.length > 0 && !isCapture;

      const [sr, sc] = path[0];
      room.board = applyMove(room.board, { from: [sr, sc], path });
      room.lastMove = { color: room.turn, path };

      const prevTurn = room.turn;
      room.turn = (room.turn === "red") ? "black" : "red";
      room.pendingBlow = skippedCapture ? {
        target: path[path.length - 1],
        pieceColor: prevTurn,
        offeredTo: room.turn,
        ts: Date.now()
      } : null;
      room.pendingDraw = null; // limpiar solicitudes viejas al mover

      const chk = recompute(room);
      sendState(room);

      if (room.pendingBlow && room.players[room.turn]?.sid) {
        io.to(room.players[room.turn].sid).emit("blowOffered", { code: room.code, target: room.pendingBlow.target });
      }

      if (chk.over) {
        const winnerColor = chk.winner === "red" || chk.winner === "black" ? chk.winner : null;
        io.to(code).emit("gameOver", chk);
        await finalizeRatedGame(room, winnerColor);
        if (room.players.red) userRoomMap.delete(room.players.red.id);
        if (room.players.black && !room.ai) userRoomMap.delete(room.players.black.id);
        emitLobby();
      } else {
        // si es IA, juega
        if (room.ai) {
          await maybePlayAI(room);
        }
      }
    });

    socket.on("blowPiece", async ({ code }) => {
      const room = rooms.get(code);
      if (!room || !room.pendingBlow) return;
      const color = ensurePlayer(room);
      if (!color) return socket.emit("err", { error: "not_player" });
      if (color !== room.turn) return socket.emit("err", { error: "not_your_turn" });
      if (room.pendingBlow.offeredTo && room.pendingBlow.offeredTo !== color) return socket.emit("err", { error: "not_allowed" });

      const [r, c] = room.pendingBlow.target;
      const piece = room.board[r]?.[c];
      if (piece && colorOf(piece) === room.pendingBlow.pieceColor) {
        room.board[r][c] = 0;
      }
      room.pendingBlow = null;
      const chk = recompute(room);
      sendState(room);
      if (chk.over) {
        const winnerColor = chk.winner === "red" || chk.winner === "black" ? chk.winner : null;
        io.to(code).emit("gameOver", { ...chk, reason: chk.reason || "blown" });
        await finalizeRatedGame(room, winnerColor);
        if (room.players.red) userRoomMap.delete(room.players.red.id);
        if (room.players.black && !room.ai) userRoomMap.delete(room.players.black.id);
        emitLobby();
      }
    });

    socket.on("chatMessage", ({ code, text }) => {
      const room = rooms.get(code);
      if (!room) return;

      const userId = socket.data.userId;
      const username = socket.data.username || "Jugador";
      if (!userId) return socket.emit("err", { error: "no_auth" });
      const color = ensurePlayer(room);
      if (!color || room.over) return socket.emit("err", { error: "not_allowed" });

      const msgText = (text || "").toString().trim().slice(0, 240);
      if (!msgText) return;

      const msg = pushChatMessage(room, { userId, username, text: msgText });
      if (msg) {
        io.to(code).emit("chatMessage", { id: msg.id, user: msg.username, text: msg.text, ts: msg.ts });
      }
    });

    socket.on("globalMessage", ({ text }) => {
      if (!ensureAuth()) return;
      const msgText = (text || "").toString().trim().slice(0, 240);
      if (!msgText) return;
      const msg = {
        id: nanoid(8),
        userId: socket.data.userId,
        username: socket.data.username || "Usuario",
        text: msgText,
        ts: Date.now()
      };
      globalMessages.push(msg);
      if (globalMessages.length > MAX_GLOBAL_MSGS) {
        globalMessages.splice(0, globalMessages.length - MAX_GLOBAL_MSGS);
      }
      io.to(lobbyRoomName).emit("globalChat", msg);
    });

    socket.on("requestDraw", ({ code }) => {
      const room = rooms.get(code);
      if (!room || room.over) return;
      const color = ensurePlayer(room);
      if (!color) return socket.emit("err", { error: "not_player" });
      if (room.pendingDraw) return socket.emit("err", { error: "draw_pending" });

      room.pendingDraw = { by: color, ts: Date.now() };
      sendState(room);
      const opp = color === "red" ? room.players.black : room.players.red;
      if (opp?.sid) io.to(opp.sid).emit("drawOffer", { code });
    });

    socket.on("respondDraw", async ({ code, accept }) => {
      const room = rooms.get(code);
      if (!room || room.over) return;
      const color = ensurePlayer(room);
      if (!color) return socket.emit("err", { error: "not_player" });
      if (!room.pendingDraw) return;
      if (room.pendingDraw.by === color) return socket.emit("err", { error: "cannot_answer_own" });

      if (accept) {
        room.over = true;
        sendState(room);
        const result = { over: true, winner: null, reason: "draw" };
        io.to(code).emit("gameOver", result);
        await finalizeRatedGame(room, null);
        if (room.players.red) userRoomMap.delete(room.players.red.id);
        if (room.players.black && !room.ai) userRoomMap.delete(room.players.black.id);
        emitLobby();
      } else {
        room.pendingDraw = null;
        sendState(room);
      }
    });

    socket.on("resign", async ({ code }) => {
      const room = rooms.get(code);
      if (!room || room.over) return;
      const color = ensurePlayer(room);
      if (!color) return socket.emit("err", { error: "not_player" });
      const winner = color === "red" ? "black" : "red";
      room.over = true;
      sendState(room);
      io.to(code).emit("gameOver", { over: true, winner, reason: "resign" });
      await finalizeRatedGame(room, winner);
      if (room.players.red) userRoomMap.delete(room.players.red.id);
      if (room.players.black && !room.ai) userRoomMap.delete(room.players.black.id);
      emitLobby();
    });

    socket.on("disconnect", () => {
      // Quitar de observadores
      for (const room of rooms.values()) {
        if (room.observers.has(socket.id)) {
          room.observers.delete(socket.id);
        }
      }
      emitLobby();
    });
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Damas web listo en :${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
