const $ = (id) => document.getElementById(id);

const meBox = $("meBox");
const authCard = $("authCard");
const mainApp = $("mainApp");
const authMsg = $("authMsg");
const btnLogin = $("btnLogin");
const btnRegister = $("btnRegister");
const btnRanking = $("btnRanking");
const btnCloseRanking = $("btnCloseRanking");
const drawer = $("rankingDrawer");
const lbTableBody = $("lbTable").querySelector("tbody");

const btnLogout = document.createElement("button");
btnLogout.textContent = "Logout";
btnLogout.className = "ghost";
btnLogout.style.marginLeft = "6px";

document.querySelector(".top-actions").appendChild(btnLogout);

const btnNewPvP = $("btnNewPvP");
const btnNewAI = $("btnNewAI");
const btnJoin = $("btnJoin");
const joinCode = $("joinCode");
const roomName = $("roomName");
const roomCode = $("roomCode");
const turnTxt = $("turnTxt");
const forcedTxt = $("forcedTxt");
const pendingTxt = $("pendingTxt");
const status = $("status");
const boardEl = $("board");
const chatLog = $("chatLog");
const chatInput = $("chatInput");
const chatSend = $("chatSend");
const globalChatLog = $("globalChatLog");
const globalChatInput = $("globalChatInput");
const globalChatSend = $("globalChatSend");
const lobbyStatus = $("lobbyStatus");
const roomsTableBody = $("roomsTable").querySelector("tbody");
const rolePill = $("rolePill");
const playerRed = $("playerRed");
const playerBlack = $("playerBlack");
const btnRequestDraw = $("btnRequestDraw");
const btnResign = $("btnResign");
const resumeModal = $("resumeModal");
const resumeInfo = $("resumeInfo");
const btnResume = $("btnResume");
const btnSkipResume = $("btnSkipResume");

let me = null;
let socket = null;
let socketReady = false;
let currentRoom = null;
let currentRole = null;
let state = null;
let selected = null;
let lobbyRooms = [];
let globalMessages = [];
let resumeCode = null;

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

function setAuthUI(logged) {
  const canPlay = logged && socketReady;
  authCard.classList.toggle("hidden", logged);
  mainApp.classList.toggle("hidden", !logged);
  btnNewPvP.disabled = !canPlay;
  btnNewAI.disabled = !canPlay;
  btnJoin.disabled = !canPlay;
  btnRequestDraw.disabled = !canPlay || !state || state.over || currentRole !== "player";
  btnResign.disabled = !canPlay || !state || state.over || currentRole !== "player";
  globalChatInput.disabled = !logged || !socketReady;
  globalChatSend.disabled = !logged || !socketReady;
  updateChatControls();
}

function updateChatControls() {
  const canChat = !!(me && currentRoom && currentRole === "player" && state && !state.over);
  chatInput.disabled = !canChat;
  chatSend.disabled = !canChat;
  chatInput.placeholder = canChat ? "Escribe a tu rival" : "Chat interno solo para jugadores";
}

async function refreshMe() {
  const data = await api("/api/me");
  me = data.user;
  if (me) {
    meBox.textContent = `👤 ${me.username} • Elo ${me.rating}`;
    btnLogout.style.display = "inline-flex";
    authMsg.textContent = "";
    if (!socket) initSocket();
  } else {
    meBox.textContent = "No logueado";
    btnLogout.style.display = "none";
  }
  setAuthUI(!!me);
}

function initSocket() {
  socket = io();

  socket.on("connect", () => {
    socketReady = true;
    if (me) socket.emit("setUser", { userId: me.id, username: me.username });
    setAuthUI(!!me);
  });

  socket.on("disconnect", () => {
    socketReady = false;
    setAuthUI(!!me);
  });

  socket.on("userOk", () => {
    socketReady = true;
    setAuthUI(!!me);
    refreshLobby();
  });

  socket.on("lobbyRooms", (rooms) => {
    lobbyRooms = rooms;
    renderLobby();
  });

  socket.on("globalChatHistory", (msgs) => {
    globalMessages = msgs || [];
    renderGlobalChat();
  });

  socket.on("globalChat", (msg) => {
    globalMessages.push(msg);
    globalMessages = globalMessages.slice(-200);
    renderGlobalChat();
  });

  socket.on("resumePrompt", ({ code, name }) => {
    resumeCode = code;
    resumeInfo.textContent = `${name} (${code})`;
    resumeModal.classList.remove("hidden");
  });

  socket.on("roomCreated", ({ code }) => {
    status.textContent = `Sala creada (${code}). Esperando rival u observadores.`;
  });

  socket.on("state", (st) => {
    state = { ...st, messages: st.messages || [] };
    currentRoom = st.code;
    const myColor = getMyColor();
    currentRole = myColor ? "player" : "observer";
    roomCode.textContent = st.code;
    turnTxt.textContent = `Turno: ${st.turn}`;
    forcedTxt.textContent = st.forced ? "Captura obligatoria activa" : "Sin capturas obligatorias";
    pendingTxt.textContent = st.pendingDraw ? `Solicitud de tablas por ${st.pendingDraw.by}` : (st.pendingBlow ? "Puedes soplar ficha rival" : "");
    rolePill.textContent = currentRole === "player" ? `Jugando (${myColor || ""})` : "Observando";
    playerRed.textContent = `🔴 Rojo: ${st.players.red ? st.players.red.username : "—"}`;
    playerBlack.textContent = `⚫ Negro: ${st.players.black ? st.players.black.username : "—"}`;
    status.textContent = st.over ? "Partida finalizada" : `${st.players.red?.username || "Rojo"} vs ${st.players.black?.username || "Negro"} • Turno ${st.turn}`;
    selected = null;
    renderBoard();
    renderChat();
    updateChatControls();
    setAuthUI(!!me);
  });

  socket.on("gameOver", (g) => {
    status.textContent = `🏁 Fin: ${g.reason || "fin"}. Ganador: ${g.winner || "empate"}`;
    if (currentRole === "player") {
      chatInput.disabled = true;
      chatSend.disabled = true;
    }
    refreshLeaderboard();
  });

  socket.on("err", (e) => {
    status.textContent = `Error: ${e.error}`;
  });

  socket.on("chatMessage", (msg) => {
    if (!state) return;
    if (!state.messages) state.messages = [];
    state.messages.push(msg);
    state.messages = state.messages.slice(-100);
    renderChat();
  });

  socket.on("drawOffer", ({ code }) => {
    if (code !== currentRoom) return;
    const accept = window.confirm("Tu rival solicita tablas. ¿Aceptar?");
    socket.emit("respondDraw", { code, accept });
  });

  socket.on("blowOffered", ({ code }) => {
    if (code !== currentRoom) return;
    const accept = window.confirm("El rival omitió una captura obligatoria. ¿Soplar ficha?");
    if (accept) socket.emit("blowPiece", { code });
  });
}

function renderLobby() {
  roomsTableBody.innerHTML = "";
  lobbyRooms.forEach((room) => {
    const tr = document.createElement("tr");
    const players = room.players.filter(Boolean).join(" vs ") || "—";
    tr.innerHTML = `
      <td>${room.name} (${room.code})</td>
      <td>${room.status}</td>
      <td>${players}</td>
      <td>${room.observers}</td>
      <td class="actions"></td>
    `;
    const act = tr.querySelector(".actions");
    const joinBtn = document.createElement("button");
    joinBtn.textContent = "Unirse";
    joinBtn.disabled = !socketReady || room.status === "in_game" || room.status === "finished" || !me;
    joinBtn.onclick = () => socket.emit("joinRoom", { code: room.code });

    const watchBtn = document.createElement("button");
    watchBtn.textContent = "Observar";
    watchBtn.className = "ghost";
    watchBtn.disabled = !socketReady;
    watchBtn.onclick = () => socket.emit("observeRoom", { code: room.code });

    act.appendChild(joinBtn);
    act.appendChild(watchBtn);
    roomsTableBody.appendChild(tr);
  });
  lobbyStatus.textContent = `Salas: ${lobbyRooms.length}`;
}

function renderGlobalChat() {
  globalChatLog.innerHTML = "";
  const msgs = globalMessages || [];
  msgs.forEach((msg) => {
    const line = document.createElement("div");
    line.className = "chatLine";
    const user = document.createElement("span");
    user.className = "user";
    user.textContent = msg.username || "Usuario";
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = msg.text;
    const time = document.createElement("span");
    time.className = "time";
    const date = new Date(msg.ts || Date.now());
    time.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    line.appendChild(user);
    line.appendChild(text);
    line.appendChild(time);
    globalChatLog.appendChild(line);
  });
  globalChatLog.scrollTop = globalChatLog.scrollHeight;
}

function renderBoard() {
  boardEl.innerHTML = "";
  if (!state) {
    status.textContent = "Crea o únete a una sala para jugar";
    return;
  }

  const moveMap = state.moveMap || {};
  const captureMap = state.captureMap || {};
  const myColor = getMyColor();
  const myTurn = myColor && state.turn === myColor && !state.over;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement("div");
      cell.className = "cell " + (((r + c) % 2 === 1) ? "dark" : "light");
      cell.dataset.r = r;
      cell.dataset.c = c;

      const v = state.board[r][c];
      if (v !== 0) {
        const p = document.createElement("div");
        p.className = "piece " + (v > 0 ? "red" : "black");
        if (Math.abs(v) === 2) p.classList.add("king");
        cell.appendChild(p);
      }

      const key = `${r},${c}`;
      const hasMovesFrom = !!moveMap[key];
      const hasCaptureFrom = !!captureMap[key];

      if ((r + c) % 2 === 1 && myTurn && hasMovesFrom && currentRole === "player") {
        cell.classList.add("clickable");
        if (hasCaptureFrom) cell.classList.add("forced");
        cell.addEventListener("click", () => {
          selected = { fromKey: key, paths: moveMap[key] };
          highlightTargets(selected.paths);
        });
      }

      boardEl.appendChild(cell);
    }
  }
}

function renderChat() {
  if (!state || !Array.isArray(state.messages)) {
    chatLog.innerHTML = "<div class=\"hint\">Sin mensajes</div>";
    return;
  }
  chatLog.innerHTML = "";
  const messages = state.messages;
  for (const msg of messages) {
    const line = document.createElement("div");
    line.className = "chatLine";
    const user = document.createElement("span");
    user.className = "user";
    user.textContent = msg.user || "Jugador";
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = msg.text;
    const time = document.createElement("span");
    time.className = "time";
    const date = new Date(msg.ts || Date.now());
    time.textContent = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    line.appendChild(user);
    line.appendChild(text);
    line.appendChild(time);
    chatLog.appendChild(line);
  }
  chatLog.scrollTop = chatLog.scrollHeight;
}

function clearTargetHighlights() {
  [...boardEl.querySelectorAll(".cell")].forEach(x => {
    x.classList.remove("target");
    x.onclick = null;
  });
}

function highlightTargets(paths) {
  clearTargetHighlights();
  const targets = new Map(); // "r,c" -> path
  for (const p of paths) {
    const last = p[p.length - 1];
    targets.set(`${last[0]},${last[1]}`, p);
  }
  for (const [k, path] of targets.entries()) {
    const [r, c] = k.split(",").map(Number);
    const idx = r * 8 + c;
    const cell = boardEl.children[idx];
    cell.classList.add("target");
    cell.onclick = () => submitMove(path);
  }
}

function submitMove(path) {
  if (!socket || !currentRoom || !socketReady) return;
  socket.emit("move", { code: currentRoom, path });
  clearTargetHighlights();
}

function sendChatMessage() {
  if (!socket || !currentRoom || !socketReady) return;
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chatMessage", { code: currentRoom, text });
  chatInput.value = "";
}

function sendGlobalMessage() {
  if (!socket || !socketReady) return;
  const text = globalChatInput.value.trim();
  if (!text) return;
  socket.emit("globalMessage", { text });
  globalChatInput.value = "";
}

function getMyColor() {
  if (!me || !state) return null;
  if (state.players.red?.username === me.username) return "red";
  if (state.players.black?.username === me.username) return "black";
  return null;
}

btnLogin.onclick = async () => {
  try {
    const username = $("username").value.trim();
    const password = $("password").value;
    await api("/api/auth/login", "POST", { username, password });
    await refreshMe();
  } catch (e) {
    authMsg.textContent = e?.error || "Error";
  }
};

btnRegister.onclick = async () => {
  try {
    const username = $("username").value.trim();
    const password = $("password").value;
    await api("/api/auth/register", "POST", { username, password });
    await refreshMe();
  } catch (e) {
    authMsg.textContent = e?.error || "Error";
  }
};

btnLogout.onclick = async () => {
  await api("/api/auth/logout", "POST");
  location.reload();
};

btnNewPvP.onclick = () => {
  if (!socketReady) return;
  socket?.emit("newRoom", { mode: "pvp", name: roomName.value.trim() });
};
btnNewAI.onclick = () => {
  if (!socketReady) return;
  socket?.emit("newRoom", { mode: "ai", name: roomName.value.trim() });
};

btnJoin.onclick = () => {
  const code = joinCode.value.trim().toUpperCase();
  if (!code || !socketReady) return;
  socket?.emit("joinRoom", { code });
};

globalChatSend.onclick = () => sendGlobalMessage();
globalChatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendGlobalMessage();
  }
});

chatSend.onclick = () => sendChatMessage();
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendChatMessage();
  }
});

btnRequestDraw.onclick = () => {
  if (!state || !currentRoom) return;
  socket.emit("requestDraw", { code: currentRoom });
  pendingTxt.textContent = "Solicitud enviada";
};

btnResign.onclick = () => {
  if (!state || !currentRoom) return;
  const ok = window.confirm("¿Seguro que deseas rendirte?");
  if (ok) socket.emit("resign", { code: currentRoom });
};

btnRanking.onclick = async () => {
  await refreshLeaderboard();
  drawer.classList.remove("hidden");
};
btnCloseRanking.onclick = () => drawer.classList.add("hidden");

btnResume.onclick = () => {
  if (resumeCode) socket.emit("rejoinRoom", { code: resumeCode });
  resumeModal.classList.add("hidden");
};
btnSkipResume.onclick = () => {
  if (resumeCode) socket.emit("declineResume", { code: resumeCode });
  resumeModal.classList.add("hidden");
};

async function refreshLeaderboard() {
  const data = await api("/api/leaderboard");
  const lb = data.leaderboard || [];
  lbTableBody.innerHTML = "";
  lb.forEach((u, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${u.username}</td>
      <td>${u.rating}</td>
      <td>${u.wins}</td>
      <td>${u.losses}</td>
      <td>${u.draws}</td>
      <td>${u.games}</td>
    `;
    lbTableBody.appendChild(tr);
  });
}

function refreshLobby() {
  socket?.emit("listRooms");
}

(async function init() {
  await refreshMe();
  if (me) {
    await refreshLeaderboard();
    refreshLobby();
  }
})();
