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
const aiDifficulty = $("aiDifficulty");
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
const btnLeaveRoom = $("btnLeaveRoom");
const btnFinishRoom = $("btnFinishRoom");
const resumeModal = $("resumeModal");
const resumeInfo = $("resumeInfo");
const btnResume = $("btnResume");
const btnSkipResume = $("btnSkipResume");
const movesCard = document.querySelector(".movesCard");
const movePanelMobileHint = $("movePanelMobileHint");
const btnModifyMove = $("btnModifyMove");
const movePanelSummary = $("movePanelSummary");
const routeOptions = $("routeOptions");
const capturePreview = $("capturePreview");
const btnConfirmMove = $("btnConfirmMove");
const btnCancelMove = $("btnCancelMove");
const versionBadge = $("versionBadge");
const versionFloating = $("versionFloating");
const matchMeta = $("matchMeta");
const focusPill = $("focusPill");
const lowerPanel = $("lowerPanel");
const lowerContent = $("lowerContent");
const toggleLowerPanel = $("toggleLowerPanel");
const tabButtons = document.querySelectorAll(".lowerTabBtn");
const tabPanels = document.querySelectorAll(".tabPanel");
const endgameModal = $("endgameModal");
const endgameTitle = $("endgameTitle");
const endgameReason = $("endgameReason");
const endgameTip = $("endgameTip");
const endgameCard = document.querySelector(".endgameCard");
const btnEndgameNew = $("btnEndgameNew");
const btnEndgameLobby = $("btnEndgameLobby");
const btnEndgameRanking = $("btnEndgameRanking");
let lastFocusMode = false;

let me = null;
let socket = null;
let socketReady = false;
let currentRoom = null;
let currentRole = null;
let state = null;
let selection = null;
let committedMove = null;
let hoverMove = null;
let boardCells = [];
let lobbyRooms = [];
let globalMessages = [];
let resumeCode = null;
let mobileMovesCollapsed = false;
let panelCollapsed = false;
let activeTab = "lobbyPanel";
let awaitingBlowSelection = false;

function hasActiveGame() {
  if (state && currentRoom) return true;
  if (state?.status === "playing") return true;
  if (resumeCode) return true;
  return false;
}

function switchTab(tabId, opts = {}) {
  const keepCollapsed = opts.keepCollapsed || false;
  activeTab = tabId;
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabId));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  if (lowerPanel && panelCollapsed && !keepCollapsed) {
    setPanelCollapsed(false);
  }
}

function setPanelCollapsed(collapsed) {
  panelCollapsed = collapsed;
  if (lowerPanel) lowerPanel.classList.toggle("collapsed", collapsed);
  if (toggleLowerPanel) toggleLowerPanel.textContent = collapsed ? "Expandir panel" : "Colapsar panel";
}

tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
if (toggleLowerPanel) toggleLowerPanel.onclick = () => setPanelCollapsed(!panelCollapsed);
switchTab(activeTab);
setPanelCollapsed(window.innerWidth < 760);
updateFocusMode(false);

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
  aiDifficulty.disabled = !canPlay;
  btnJoin.disabled = !canPlay;
  btnRequestDraw.disabled = !canPlay || !state || state.over || currentRole !== "player";
  btnResign.disabled = !canPlay || !state || state.over || currentRole !== "player";
  btnLeaveRoom.disabled = !canPlay || !currentRoom || currentRole !== "player";
  btnFinishRoom.disabled = !canPlay || !currentRoom || currentRole !== "player";
  globalChatInput.disabled = !logged || !socketReady;
  globalChatSend.disabled = !logged || !socketReady;
  updateChatControls();
}

function updateFocusMode(inRoom) {
  const active = !!inRoom || hasActiveGame();
  document.body.classList.toggle("inRoom", active);
  if (focusPill) {
    focusPill.textContent = active ? "Game Focus activo" : "Modo lobby";
    focusPill.classList.toggle("success", active);
    focusPill.classList.toggle("ghost", !active);
  }
  if (!active) {
    switchTab("lobbyPanel");
    setPanelCollapsed(window.innerWidth < 760);
  } else if (!lastFocusMode) {
    setPanelCollapsed(true);
  }
  lastFocusMode = active;
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
    updateFocusMode(false);
  });
  socket.on("resumeCancelled", () => {
    resumeModal.classList.add("hidden");
    resumeCode = null;
    updateFocusMode(false);
    refreshLobby();
  });

  socket.on("roomCreated", ({ code }) => {
    status.textContent = `Sala creada (${code}). Esperando rival u observadores.`;
  });

  socket.on("state", (st) => {
    const prevRoom = currentRoom;
    const wasInRoom = !!state;
    state = { ...st, messages: st.messages || [] };
    if (!state.over) hideEndgameModal();
    resumeCode = null;
    currentRoom = st.code;
    const myColor = getMyColor();
    currentRole = myColor ? "player" : "observer";
    updateFocusMode(true);
    if (!wasInRoom || prevRoom !== st.code || activeTab === "lobbyPanel") {
      switchTab("matchPanel", { keepCollapsed: true });
    }
    roomCode.textContent = st.code;
    turnTxt.textContent = `Turno: ${st.turn}`;
    forcedTxt.textContent = st.forced ? "Capturas recomendadas visibles (opcionales)" : "Movimiento libre";
    const blowTargets = normalizeBlowablePieces(st.pendingBlow?.blowablePieces);
    if (!st.pendingBlow) awaitingBlowSelection = false;
    let pendingMsg = "";
    if (st.pendingDraw) {
      pendingMsg = `Solicitud de tablas por ${st.pendingDraw.by}`;
    } else if (st.pendingBlow && blowTargets.length) {
      const blowLabel = blowTargets.length === 1 ? ` en ${squareName(blowTargets[0])}` : ` (${blowTargets.length} fichas disponibles)`;
      pendingMsg = `Puedes soplar ficha rival${blowLabel}`;
      if (awaitingBlowSelection && blowTargets.length > 1) {
        pendingMsg += " • Haz click en una ficha resaltada para soplar.";
      }
    } else if (st.missedCapture) {
      const offenderName = playerNameById(st.missedCapture.byPlayer) || st.missedCapture.byColor || "rival";
      pendingMsg = `Captura omitida por ${offenderName}`;
    }
    pendingTxt.textContent = pendingMsg;
    rolePill.textContent = currentRole === "player" ? `Jugando (${myColor || ""})` : "Observando";
    playerRed.textContent = `🔴 Rojo: ${st.players.red ? st.players.red.username : "—"}`;
    playerBlack.textContent = `⚫ Negro: ${st.players.black ? st.players.black.username : "—"}`;
    const aiInfo = st.mode === "ai" && st.difficulty ? ` • IA ${st.difficulty}` : "";
    status.textContent = st.over ? "Partida finalizada" : `${st.players.red?.username || "Rojo"} vs ${st.players.black?.username || "Negro"} • Turno ${st.turn}${aiInfo}`;
    if (matchMeta) {
      const modeTxt = st.mode === "ai" ? `Modo IA${st.difficulty ? ` ${st.difficulty}` : ""}` : "PvP";
      const spectators = st.observers || 0;
      matchMeta.textContent = `${modeTxt} • Observadores: ${spectators} • Turno #${st.turnCount || 1}`;
    }
    selection = null;
    committedMove = null;
    hoverMove = null;
    renderBoard();
    renderChat();
    updateChatControls();
    setAuthUI(!!me);
  });

  socket.on("gameOver", (g) => {
    status.textContent = `🏁 Fin: ${g.reason || "fin"}. Ganador: ${g.winner || "empate"}`;
    if (matchMeta) matchMeta.textContent = "La partida ha concluido. Usa Salas para iniciar otra.";
    if (currentRole === "player") {
      chatInput.disabled = true;
      chatSend.disabled = true;
    }
    if (state) {
      state.over = true;
      state.winner = g.winner;
      state.reason = g.reason;
    }
    showEndgameModal(g);
    refreshLeaderboard();
  });

  socket.on("err", (e) => {
    const msg = e?.message || e?.error || "Error";
    status.textContent = `Error: ${msg}`;
  });

  socket.on("roomClosed", (payload) => {
    const msg = payload?.message || "La sala ha sido cerrada.";
    const reasonTxt = payload?.reason ? ` (${payload.reason})` : "";
    status.textContent = `${msg}${reasonTxt}`;
    updateFocusMode(false);
    clearRoomState();
    renderBoard();
    renderChat();
    refreshLobby();
    setAuthUI(!!me);
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

  socket.on("blowOffered", ({ code, blowablePieces }) => {
    if (code !== currentRoom) return;
    const targets = normalizeBlowablePieces(blowablePieces);
    if (!targets.length) return;
    const coordTxt = targets.length === 1
      ? ` (${squareName(targets[0])})`
      : ` (${targets.length} opciones: ${targets.map(squareName).join(", ")})`;
    const accept = window.confirm(`El rival omitió una captura obligatoria${coordTxt}. ${targets.length > 1 ? "Elige cuál soplar haciendo click en una ficha resaltada." : "¿Soplar ficha?"}`);
    if (accept) {
      if (targets.length === 1) {
        socket.emit("blowPiece", { code, target: targets[0] });
      } else {
        awaitingBlowSelection = true;
        status.textContent = "Selecciona en el tablero la ficha a soplar.";
      }
    }
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

const files = "abcdefgh";
let currentTargets = [];
let currentPreviewBadges = [];

function coordKey(c) { return `${c.r},${c.c}`; }
function parseKey(key) { const [r, c] = key.split(",").map(Number); return { r, c }; }
function squareName({ r, c }) { return `${files[c]}${8 - r}`; }
function isSameCoord(a, b) { return a && b && a.r === b.r && a.c === b.c; }
function colorOfPiece(v) { return v > 0 ? "red" : (v < 0 ? "black" : null); }
function normalizeBlowablePieces(list) {
  return (list || []).map((p) => {
    const r = Number(p.r ?? p[0]);
    const c = Number(p.c ?? p[1]);
    if (Number.isNaN(r) || Number.isNaN(c)) return null;
    return { r, c };
  }).filter(Boolean);
}
function moveSig(mv) {
  if (!mv) return "";
  const pathSig = (mv.path || []).map((p) => `${p.r},${p.c}`).join("|");
  const capsSig = (mv.captures || []).map((c) => `${c.coord.r},${c.coord.c},${c.pieceType},${c.color}`).join("|");
  return `${pathSig}#${capsSig}`;
}
function pathMatchesPrefix(path, prefix) {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (path[i].r !== prefix[i].r || path[i].c !== prefix[i].c) return false;
  }
  return true;
}

function winnerVariant(result) {
  const myColor = getMyColor();
  if (!result) return "draw";
  if (!result.winner) return "draw";
  return result.winner === myColor ? "win" : "lose";
}

function reasonLabel(reason) {
  switch (reason) {
    case "no_moves": return "Bloqueo: sin movimientos disponibles.";
    case "no_pieces": return "Captura total: el rival perdió todas sus fichas.";
    case "draw": return "Tablas acordadas.";
    case "resign": return "Rendición.";
    case "blown": return "Soplido: captura omitida penalizada.";
    default: return "Fin de la partida.";
  }
}

function showEndgameModal(result) {
  if (!endgameModal || !endgameCard) return;
  const variant = winnerVariant(result);
  endgameCard.classList.remove("win", "lose", "draw");
  endgameCard.classList.add(variant);
  const myColor = getMyColor();
  let title = "Empate";
  if (result?.winner === myColor) title = "¡Ganaste!";
  else if (result?.winner && result.winner !== myColor) title = "Perdiste";
  endgameTitle.textContent = title;
  endgameReason.textContent = reasonLabel(result?.reason);
  const tip = window.getRandomTip ? window.getRandomTip() : null;
  endgameTip.textContent = tip || "";
  endgameTip.style.display = tip ? "block" : "none";
  endgameModal.classList.remove("hidden");
}

function hideEndgameModal() {
  if (endgameModal) endgameModal.classList.add("hidden");
}

function getCell({ r, c }) {
  return boardCells[r * 8 + c];
}

function clearTargetHighlights() {
  currentTargets.forEach((cell) => {
    cell.classList.remove("target", "forced");
    cell.onclick = null;
    cell.onmouseenter = null;
    cell.onmouseleave = null;
  });
  currentTargets = [];
}

function clearPreview() {
  boardEl.querySelectorAll(".preview, .preview-step, .selected").forEach((el) => {
    el.classList.remove("preview", "preview-step", "selected");
    el.dataset.step = "";
  });
  currentPreviewBadges.forEach((b) => b.remove());
  currentPreviewBadges = [];
}

function showPreview(move, opts = {}) {
  if (!move) return;
  clearPreview();
  const partialUntil = opts.partialUntil || move.path.length;
  move.path.forEach((p, idx) => {
    const cell = getCell(p);
    if (!cell) return;
    if (idx === 0) {
      cell.classList.add("selected");
    } else if (idx < partialUntil) {
      cell.classList.add("preview-step");
      cell.dataset.step = idx;
    } else if (idx === partialUntil) {
      cell.classList.add("target");
    }
  });

  move.captures.forEach((cap, idx) => {
    const cell = getCell(cap.coord);
    if (!cell) return;
    const badge = document.createElement("div");
    badge.className = "captureBadge";
    badge.textContent = idx + 1;
    cell.appendChild(badge);
    currentPreviewBadges.push(badge);
  });
}

function nextLandingOptions(sel) {
  if (!sel) return [];
  const index = sel.prefix.length;
  const seen = new Map();
  for (const mv of sel.candidates) {
    if (!pathMatchesPrefix(mv.path, sel.prefix)) continue;
    if (mv.path.length <= index) continue;
    const nxt = mv.path[index];
    const key = coordKey(nxt);
    if (!seen.has(key)) seen.set(key, nxt);
  }
  return Array.from(seen.values());
}

function renderRouteCards(baseMoves) {
  routeOptions.innerHTML = "";
  if (!state) {
    routeOptions.innerHTML = "<div class=\"hint\">Crea o únete a una sala para ver rutas</div>";
    return;
  }
  if (!selection || !Array.isArray(baseMoves) || baseMoves.length === 0) {
    routeOptions.innerHTML = "<div class=\"hint\">Selecciona una ficha para ver rutas</div>";
    return;
  }
  const recommendedMap = state.recommendedCaptureMap || {};
  baseMoves.forEach((mv, idx) => {
    const card = document.createElement("button");
    card.className = "routeCard";
    if (committedMove && coordKey(committedMove.pieceTo) === coordKey(mv.pieceTo) && pathMatchesPrefix(committedMove.path, mv.path) && pathMatchesPrefix(mv.path, committedMove.path)) {
      card.classList.add("active");
    }
    const captures = mv.captures.length;
    const kings = mv.captures.filter((c) => c.pieceType === "king").length;
    const pathTxt = mv.path.map(squareName).join(" → ");
    const captureLabel = captures ? `Capturas: ${captures}${kings ? ` • ${kings} dama(s)` : ""}` : "Movimiento simple";
    const isRecommended = captures && recommendedMap[coordKey(mv.pieceFrom)]?.some((m) => moveSig(m) === moveSig(mv));
    const badge = isRecommended ? `<span class="routeBadge capture">Recomendada</span>` : (captures ? `<span class="routeBadge optional">Omitible</span>` : "");
    card.innerHTML = `
      <div class="routeTitle">Ruta ${idx + 1}: ${squareName(mv.pieceFrom)} → ${squareName(mv.pieceTo)} ${badge}</div>
      <div class="routeMeta">${captureLabel}</div>
      <div class="routePath">${pathTxt}</div>
    `;
    card.onclick = () => selectRoute(mv);
    routeOptions.appendChild(card);
  });
}

function renderMovePanel() {
  const allMoves = selection ? (state.moveMap?.[selection.fromKey] || []) : [];
  const candidateCount = selection?.candidates?.length || 0;
  const recommendedCount = state?.recommendedCaptureMap ? Object.values(state.recommendedCaptureMap).flat().length : 0;
  const recommended = recommendedCount ? `Capturas recomendadas opcionales (${recommendedCount})` : "Movimiento libre";
  const currentPreviewMove = committedMove || selection?.candidates?.[0] || allMoves[0] || null;
  const captures = currentPreviewMove?.captures?.length || 0;
  const kings = currentPreviewMove?.captures?.filter((c) => c.pieceType === "king").length || 0;
  const summaryPath = currentPreviewMove ? currentPreviewMove.path.map(squareName).join(" → ") : "Sin selección";
  movePanelSummary.textContent = `${recommended} • ${selection ? (candidateCount || allMoves.length) : (state ? "elige una ficha" : "esperando sala")}${captures ? ` • Capturas: ${captures}${kings ? ` (${kings} damas)` : ""}` : ""}`;
  capturePreview.textContent = currentPreviewMove ? `Secuencia: ${summaryPath}` : (state?.forced ? "Hay capturas recomendadas, pero puedes mover sin capturar (tu rival podrá soplar)." : "Selecciona una ficha para ver rutas");

  renderRouteCards(allMoves);
  const canConfirm = !!(committedMove && currentRole === "player" && !state?.over && getMyColor() === state?.turn);
  btnConfirmMove.disabled = !canConfirm;
}

function startSelection(fromKey) {
  const moves = state.moveMap?.[fromKey] || [];
  const autoMove = moves.length === 1 ? moves[0] : null;
  const prefix = autoMove ? [...autoMove.path] : [parseKey(fromKey)];
  const candidates = autoMove ? [autoMove] : moves;
  selection = { fromKey, candidates, prefix, allMoves: moves };
  committedMove = autoMove;
  hoverMove = null;
  clearTargetHighlights();
  showPreview(committedMove || moves[0]);
  refreshSelectionUI();
}

function advanceSelection(coord) {
  if (!selection) return;
  const newPrefix = selection.prefix.concat([coord]);
  const filtered = selection.candidates.filter((mv) => pathMatchesPrefix(mv.path, newPrefix));
  selection.prefix = newPrefix;
  selection.candidates = filtered;
  committedMove = (filtered.length === 1 && filtered[0].path.length === newPrefix.length) ? filtered[0] : null;
  hoverMove = null;
  refreshSelectionUI();
}

function refreshSelectionUI() {
  clearTargetHighlights();
  clearPreview();
  if (!selection) {
    renderMovePanel();
    return;
  }
  const fromCell = getCell(parseKey(selection.fromKey));
  if (fromCell) fromCell.classList.add("selected");

  const options = nextLandingOptions(selection);
  const previewMove = committedMove || selection.candidates[0];
  if (previewMove) showPreview(previewMove, { partialUntil: selection.prefix.length });

  options.forEach((opt) => {
    const cell = getCell(opt);
    if (!cell) return;
    cell.classList.add("target");
    cell.onclick = () => advanceSelection(opt);
    cell.onmouseenter = () => showPreview(selection.candidates.find((mv) => mv.path[selection.prefix.length]?.r === opt.r && mv.path[selection.prefix.length]?.c === opt.c) || previewMove, { partialUntil: selection.prefix.length + 1 });
    cell.onmouseleave = () => showPreview(previewMove, { partialUntil: selection.prefix.length });
    currentTargets.push(cell);
  });

  renderMovePanel();
}

function selectRoute(move) {
  if (!move) return;
  const fromKey = coordKey(move.pieceFrom);
  selection = { fromKey, candidates: [move], prefix: [...move.path], allMoves: state.moveMap?.[fromKey] || [move] };
  committedMove = move;
  hoverMove = null;
  refreshSelectionUI();
}

function submitMove(move) {
  if (!socket || !currentRoom || !socketReady) return;
  if (!move) return;
  socket.emit("move", { code: currentRoom, move });
  selection = null;
  committedMove = null;
  hoverMove = null;
  clearTargetHighlights();
  clearPreview();
  renderMovePanel();
}

function blowPieceAt(coord) {
  if (!socket || !currentRoom || !socketReady) return;
  if (!coord) return;
  socket.emit("blowPiece", { code: currentRoom, target: coord });
  awaitingBlowSelection = false;
}

function renderBoard() {
  boardEl.innerHTML = "";
  currentTargets = [];
  currentPreviewBadges = [];
  boardCells = [];
  if (!state) {
    status.textContent = "Crea o únete a una sala desde el panel inferior";
    renderMovePanel();
    return;
  }

  const moveMap = state.moveMap || {};
  const captureMap = state.captureMap || {};
  const recommendedMap = state.recommendedCaptureMap || {};
  const myColor = getMyColor();
  const myTurn = myColor && state.turn === myColor && !state.over;
  const blowablePieces = normalizeBlowablePieces(state.pendingBlow?.blowablePieces);
  const canBlow = myTurn && currentRole === "player" && blowablePieces.length > 0;
  const lastMoves = state.lastMovedByColor || {};
  const opponent = myColor ? (myColor === "red" ? "black" : "red") : null;

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
      const blowTarget = blowablePieces.find((p) => p.r === r && p.c === c);
      const isBlowTarget = !!blowTarget;
      if (isBlowTarget) cell.classList.add("blowTarget");
      const hasMovesFrom = Array.isArray(moveMap[key]) && moveMap[key].length > 0;
      const hasCaptureFrom = Array.isArray(captureMap[key]) && captureMap[key].length > 0;
      const hasPreferredFrom = Array.isArray(recommendedMap[key]) && recommendedMap[key].length > 0;

      if (canBlow && blowTarget) {
        cell.classList.add("clickable");
        cell.addEventListener("click", () => blowPieceAt(blowTarget));
      } else if ((r + c) % 2 === 1 && myTurn && hasMovesFrom && currentRole === "player") {
        cell.classList.add("clickable");
        if (hasCaptureFrom) cell.classList.add("forced");
        if (hasPreferredFrom) cell.classList.add("preferredCapture");
        cell.addEventListener("click", () => startSelection(key));
      } else if (hasPreferredFrom) {
        cell.classList.add("preferredCapture");
      }

      const pieceColor = colorOfPiece(v);
      const lastByColor = pieceColor ? lastMoves[pieceColor] : null;
      const lastOpp = opponent ? lastMoves[opponent] : null;
      if (lastByColor && isSameCoord(lastByColor.to, { r, c })) {
        cell.classList.add("lastMovedPiece");
        if (opponent && pieceColor === opponent) cell.classList.add("lastMovedOpponent");
      } else if (lastOpp && isSameCoord(lastOpp.to, { r, c }) && !pieceColor) {
        // highlight landing even si la pieza fue eliminada
        cell.classList.add("lastMovedOpponent");
      }

      boardEl.appendChild(cell);
      boardCells.push(cell);
    }
  }
  refreshSelectionUI();
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

function playerNameById(id) {
  if (!state || !id) return null;
  if (state.players.red?.id === id) return state.players.red.username || "Rojo";
  if (state.players.black?.id === id) return state.players.black.username || "Negro";
  return null;
}

function getMyColor() {
  if (!me || !state) return null;
  if (state.players.red?.username === me.username) return "red";
  if (state.players.black?.username === me.username) return "black";
  return null;
}

function clearRoomState() {
  state = null;
  currentRoom = null;
  currentRole = null;
  selection = null;
  committedMove = null;
  hoverMove = null;
  boardCells = [];
  resumeCode = null;
  boardEl.innerHTML = "";
  roomCode.textContent = "—";
  turnTxt.textContent = "Turno: —";
  forcedTxt.textContent = "Capturas recomendadas: —";
  pendingTxt.textContent = "";
  playerRed.textContent = "🔴 Rojo: —";
  playerBlack.textContent = "⚫ Negro: —";
  rolePill.textContent = "Observando";
  status.textContent = "Usa la pestaña Salas para crear o unirte a una partida.";
  if (matchMeta) matchMeta.textContent = "El tablero permanece visible incluso en espera.";
  updateFocusMode(false);
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
  socket?.emit("newRoom", { mode: "ai", name: roomName.value.trim(), difficulty: aiDifficulty.value });
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

btnLeaveRoom.onclick = () => {
  if (!state || !currentRoom) return;
  const reason = state.mode === "ai" ? "ai_exit" : "leave";
  socket.emit("room:close", { code: currentRoom, reason });
};

btnFinishRoom.onclick = () => {
  if (!state || !currentRoom) return;
  const reason = "finished";
  socket.emit("room:close", { code: currentRoom, reason });
};
btnConfirmMove.onclick = () => submitMove(committedMove);
btnCancelMove.onclick = () => {
  selection = null;
  committedMove = null;
  hoverMove = null;
  clearTargetHighlights();
  clearPreview();
  renderMovePanel();
};
btnModifyMove.onclick = () => {
  if (!selection) return;
  committedMove = null;
  hoverMove = null;
  refreshSelectionUI();
};
function toggleMobileMoves() {
  if (!movesCard) return;
  mobileMovesCollapsed = !mobileMovesCollapsed;
  movesCard.classList.toggle("collapsed", mobileMovesCollapsed);
}
if (movePanelMobileHint) {
  movePanelMobileHint.addEventListener("click", () => {
    if (window.innerWidth <= 700) toggleMobileMoves();
  });
}

btnRanking.onclick = async () => {
  await refreshLeaderboard();
  drawer.classList.remove("hidden");
};
btnCloseRanking.onclick = () => drawer.classList.add("hidden");

btnResume.onclick = () => {
  if (resumeCode) socket.emit("rejoinRoom", { code: resumeCode });
  resumeModal.classList.add("hidden");
  updateFocusMode(true);
};
btnSkipResume.onclick = async () => {
  if (resumeCode) {
    try {
      await api("/api/resume/cancel", "POST", { code: resumeCode });
    } catch (_) {
      // ignore errors, fallback to socket event
    }
    socket?.emit("resume:cancel", { code: resumeCode });
  }
  clearRoomState();
  resumeCode = null;
  resumeModal.classList.add("hidden");
  refreshLobby();
  updateFocusMode(false);
};

btnEndgameLobby.onclick = () => {
  hideEndgameModal();
  switchTab("lobbyPanel");
  updateFocusMode(false);
};
btnEndgameNew.onclick = () => {
  hideEndgameModal();
  refreshLobby();
  switchTab("lobbyPanel");
};
btnEndgameRanking.onclick = async () => {
  hideEndgameModal();
  await refreshLeaderboard();
  drawer.classList.remove("hidden");
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

async function loadVersion() {
  if (!versionBadge && !versionFloating) return;
  try {
    const data = await api("/api/version");
    const txt = data.version || versionBadge?.textContent || versionFloating?.textContent;
    if (versionBadge) versionBadge.textContent = txt;
    if (versionFloating) versionFloating.textContent = txt;
  } catch {
    // fallback a la versión empacada
  }
}

window.addEventListener("resize", () => {
  if (window.innerWidth > 700 && mobileMovesCollapsed) {
    mobileMovesCollapsed = false;
    movesCard?.classList.remove("collapsed");
  }
  if (window.innerWidth < 760 && !hasActiveGame()) {
    setPanelCollapsed(true);
  }
  if (window.innerWidth > 840 && !hasActiveGame() && panelCollapsed) {
    setPanelCollapsed(false);
  }
});

(async function init() {
  await refreshMe();
  await loadVersion();
  if (me) {
    await refreshLeaderboard();
    refreshLobby();
  }
})();
