const $ = (id) => document.getElementById(id);

const meBox = $("meBox");
const authMsg = $("authMsg");
const btnLogin = $("btnLogin");
const btnRegister = $("btnRegister");
const btnLogout = $("btnLogout");

const btnNewPvP = $("btnNewPvP");
const btnNewAI = $("btnNewAI");
const btnJoin = $("btnJoin");
const joinCode = $("joinCode");
const roomCode = $("roomCode");
const turnTxt = $("turnTxt");
const forcedTxt = $("forcedTxt");
const status = $("status");
const boardEl = $("board");
const chatLog = $("chatLog");
const chatInput = $("chatInput");
const chatSend = $("chatSend");

const btnRefreshLb = $("btnRefreshLb");
const lbTableBody = $("lbTable").querySelector("tbody");

let me = null;
let socket = null;

let currentRoom = null;
let state = null;
let selected = null; // { fromKey, paths }

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
  btnNewPvP.disabled = !logged;
  btnNewAI.disabled = !logged;
  btnJoin.disabled = !logged;
  btnRefreshLb.disabled = !logged;
  btnLogout.style.display = logged ? "inline-block" : "none";
  updateChatControls();
}

function updateChatControls() {
  const canChat = !!(me && currentRoom);
  chatInput.disabled = !canChat;
  chatSend.disabled = !canChat;
  chatInput.placeholder = canChat ? "Escribe un mensaje..." : "Entra a una sala para chatear";
}

async function refreshMe() {
  const data = await api("/api/me");
  me = data.user;
  if (me) {
    meBox.textContent = `👤 ${me.username} • Elo ${me.rating}`;
    authMsg.textContent = "";
    setAuthUI(true);
    if (!socket) initSocket();
  } else {
    meBox.textContent = "No logueado";
    setAuthUI(false);
  }
  updateChatControls();
}

function initSocket() {
  socket = io();

  socket.on("connect", () => {
    if (me) socket.emit("setUser", { userId: me.id, username: me.username });
  });

  socket.on("needUser", () => {
    if (me) socket.emit("setUser", { userId: me.id, username: me.username });
  });

  socket.on("userOk", () => {});

  socket.on("roomCreated", ({ code }) => {
    currentRoom = code;
    roomCode.textContent = code;
    status.textContent = "Sala creada. Comparte el código o juega vs IA.";
    updateChatControls();
  });

  socket.on("state", (st) => {
    state = { ...st, messages: st.messages || [] };
    currentRoom = st.code;
    roomCode.textContent = st.code;
    turnTxt.textContent = st.turn;
    forcedTxt.textContent = st.forced ? "Captura obligatoria" : "";
    status.textContent = `${st.players.red?.username || "—"} (rojo) vs ${st.players.black?.username || "—"} (negro)`;
    selected = null;
    renderBoard();
    renderChat();
    updateChatControls();
  });

  socket.on("gameOver", (g) => {
    status.textContent = `🏁 Fin: gana ${g.winner} (${g.reason})`;
    refreshLeaderboard();
  });

  socket.on("err", (e) => {
    status.textContent = `Error: ${e.error}`;
  });

  socket.on("chatMessage", (msg) => {
    if (!state) return;
    if (!state.messages) state.messages = [];
    state.messages.push(msg);
    state.messages = state.messages.slice(-50);
    renderChat();
  });

  // registra el usuario
  socket.emit("setUser", { userId: me.id, username: me.username });
}

function renderBoard() {
  boardEl.innerHTML = "";
  if (!state) return;

  const moveMap = state.moveMap || {};
  const myColor = getMyColor();

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
      const isMyTurn = (myColor && state.turn === myColor);
      const hasMovesFrom = !!moveMap[key];

      if ((r + c) % 2 === 1 && isMyTurn && hasMovesFrom) {
        cell.classList.add("clickable");
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
  if (!socket || !currentRoom) return;
  socket.emit("move", { code: currentRoom, path });
  clearTargetHighlights();
}

function sendChatMessage() {
  if (!socket || !currentRoom) return;
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chatMessage", { code: currentRoom, text });
  chatInput.value = "";
}

function getMyColor() {
  if (!me || !state) return null;
  // el creador es rojo; el que se une es negro; IA es negro
  if (state.players.red?.username === me.username) return "red";
  if (state.players.black?.username === me.username) return "black";
  return null;
}

// ---------- auth buttons ----------
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

// ---------- game buttons ----------
btnNewPvP.onclick = () => socket?.emit("newRoom", { mode: "pvp" });
btnNewAI.onclick = () => socket?.emit("newRoom", { mode: "ai" });

btnJoin.onclick = () => {
  const code = joinCode.value.trim().toUpperCase();
  if (!code) return;
  socket?.emit("joinRoom", { code });
};

btnRefreshLb.onclick = () => refreshLeaderboard();

chatSend.onclick = () => sendChatMessage();
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendChatMessage();
  }
});

async function refreshLeaderboard() {
  if (!me) return;
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

(async function init() {
  await refreshMe();
  if (me) await refreshLeaderboard();
})();
