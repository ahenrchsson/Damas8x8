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

  app.use(session({
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
  }));

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

  // ---------- Game Rooms (in-memory state) ----------
  const rooms = new Map(); // roomCode -> roomState

  function makeRoomState({ code, mode, redUser, blackUser, ai = false }) {
    const board = initialBoard();
    const turn = "red"; // rojo parte
    const moves = computeMoves(board, turn);
    return {
      code,
      mode, // 'pvp' | 'ai'
      createdAt: Date.now(),
      board,
      turn,
      forced: moves.forced,
      moveMap: serializeMoveMap(moves.moves),
      players: {
        red: redUser,   // { id, username, sid }
        black: blackUser // idem o null si no llegó / IA
      },
      ai,
      lastMove: null,
      over: false
    };
  }

  function publicStateFor(room) {
    return {
      code: room.code,
      mode: room.mode,
      board: room.board,
      turn: room.turn,
      forced: room.forced,
      moveMap: room.moveMap,
      players: {
        red: room.players.red ? { username: room.players.red.username } : null,
        black: room.players.black ? { username: room.players.black.username } : (room.ai ? { username: "AI" } : null)
      },
      lastMove: room.lastMove,
      over: room.over
    };
  }

  function recompute(room) {
    const m = computeMoves(room.board, room.turn);
    room.forced = m.forced;
    room.moveMap = serializeMoveMap(m.moves);
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

  function pickRandomMove(room) {
    const keys = Object.keys(room.moveMap);
    if (keys.length === 0) return null;
    const k = keys[Math.floor(Math.random() * keys.length)];
    const paths = room.moveMap[k];
    const path = paths[Math.floor(Math.random() * paths.length)];
    return { from: k.split(",").map(Number), path };
  }

  async function maybePlayAI(room) {
    if (!room.ai || room.over) return;
    if (room.turn !== "black") return;

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

  io.use((socket, next) => {
    // reutilizar sesión de Express (cookie). Para demo simple, validamos con /api/me desde el cliente.
    next();
  });

  io.on("connection", (socket) => {
    socket.on("createRoom", async ({ mode }) => {
      const sid = socket.request?.headers?.cookie || "";
      // validación real: el cliente envía me() antes. Aquí lo hacemos simple: exige auth via evento setUser.
      socket.emit("needUser");
    });

    socket.on("setUser", async ({ userId, username }) => {
      socket.data.userId = userId;
      socket.data.username = username;
      socket.emit("userOk");
    });

    socket.on("newRoom", async ({ mode }) => {
      if (!socket.data.userId) return socket.emit("err", { error: "no_auth" });

      const code = nanoid(6).toUpperCase();
      const redUser = { id: socket.data.userId, username: socket.data.username, sid: socket.id };

      let room;
      if (mode === "ai") {
        room = makeRoomState({ code, mode: "ai", redUser, blackUser: null, ai: true });
      } else {
        room = makeRoomState({ code, mode: "pvp", redUser, blackUser: null, ai: false });
      }

      rooms.set(code, room);
      socket.join(code);
      socket.emit("roomCreated", { code });
      io.to(code).emit("state", publicStateFor(room));
      if (room.ai) maybePlayAI(room);
    });

    socket.on("joinRoom", async ({ code }) => {
      if (!socket.data.userId) return socket.emit("err", { error: "no_auth" });
      const room = rooms.get(code);
      if (!room) return socket.emit("err", { error: "room_not_found" });

      if (room.mode !== "pvp" || room.ai) return socket.emit("err", { error: "room_not_joinable" });
      if (room.players.black) return socket.emit("err", { error: "room_full" });
      if (room.players.red?.id === socket.data.userId) return socket.emit("err", { error: "same_user" });

      room.players.black = { id: socket.data.userId, username: socket.data.username, sid: socket.id };

      socket.join(code);
      io.to(code).emit("state", publicStateFor(room));
    });

    socket.on("move", async ({ code, path }) => {
      const room = rooms.get(code);
      if (!room) return;
      if (room.over) return;

      const userId = socket.data.userId;
      if (!userId) return socket.emit("err", { error: "no_auth" });
      if (!isUsersTurn(room, userId)) return socket.emit("err", { error: "not_your_turn" });

      if (!Array.isArray(path) || path.length < 2) return socket.emit("err", { error: "bad_move" });

      const [sr, sc] = path[0];
      const key = `${sr},${sc}`;
      const legal = room.moveMap[key] || [];
      const ok = legal.some(p => JSON.stringify(p) === JSON.stringify(path));
      if (!ok) return socket.emit("err", { error: "illegal_move" });

      room.board = applyMove(room.board, { from: [sr, sc], path });
      room.lastMove = { color: room.turn, path };

      const prevTurn = room.turn;
      room.turn = (room.turn === "red") ? "black" : "red";

      const chk = recompute(room);
      io.to(code).emit("state", publicStateFor(room));

      if (chk.over) {
        const winnerColor = chk.winner === "red" || chk.winner === "black" ? chk.winner : null;
        io.to(code).emit("gameOver", chk);
        await finalizeRatedGame(room, winnerColor);
      } else {
        // si es IA, juega
        if (room.ai) {
          await maybePlayAI(room);
        }
      }
    });

    socket.on("disconnect", () => {
      // No borramos sala inmediatamente; demo simple.
    });
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Damas web listo en :${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
