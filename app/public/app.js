const $ = (id) => document.getElementById(id);

const meBox = $("meBox");
const authCard = $("authCard");
const mainApp = $("mainApp");
const authMsg = $("authMsg");
const registrationStatus = $("registrationStatus");
const recoveryPanel = $("recoveryPanel");
const btnShowRecovery = $("btnShowRecovery");
const btnRecover = $("btnRecover");
const btnCancelRecovery = $("btnCancelRecovery");
const recoveryUsername = $("recoveryUsername");
const recoveryCode = $("recoveryCode");
const recoveryPassword = $("recoveryPassword");
const recoveryPasswordConfirm = $("recoveryPasswordConfirm");
const recoveryNotice = $("recoveryNotice");
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
const themeSelect = $("themeSelect");
const soundToggle = $("soundToggle");
const soundVolume = $("soundVolume");
const animToggle = $("animToggle");
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
const buzzPanel = $("buzzPanel");
const buzzButton = $("buzzButton");
const buzzStatus = $("buzzStatus");
const buzzToast = $("buzzToast");
const presenceList = $("presenceList");
const presenceCount = $("presenceCount");
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
let lastMoveKey = null;
let activityByColor = { red: null, black: null };
let lastBuzzSentAt = 0;
let buzzToastTimer = null;
let pendingMoveAnimation = null;
let lastMoveAnimationKey = null;
let moveAnimationsEnabled = true;
let trailSvg = null;
let previewTrailGroup = null;
let moveTrailGroup = null;
let moveTrailTimeout = null;
let moveHighlightTimeout = null;
let activeGhostPiece = null;
let activeGhostTimer = null;

const INACTIVITY_MS = 30_000;
const BUZZ_COOLDOWN_MS = 10_000;
const ACTIVITY_THROTTLE_MS = 1_000;
let lastActivitySentAt = 0;
const THEME_KEY = "uiTheme";
const THEMES = ["technology", "classic", "wooden"];
const THEME_CLASSES = THEMES.map((theme) => `theme-${theme}`);
const DEFAULT_USERNAME_REGEX_SOURCE = "^[a-zA-Z0-9_-]+$";
const DEFAULT_PASSWORD_REGEX_SOURCE = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d]{8,}$";
const DEFAULT_PASSWORD_MESSAGE =
  "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.";
let usernameRegex = new RegExp(DEFAULT_USERNAME_REGEX_SOURCE);
let passwordRegex = new RegExp(DEFAULT_PASSWORD_REGEX_SOURCE);
let passwordMessage = DEFAULT_PASSWORD_MESSAGE;
const MOVE_ANIMATIONS_KEY = "moveAnimationsEnabled";
let authConfig = {
  allowRegistration: true,
  username: { min: 3, max: 20, pattern: DEFAULT_USERNAME_REGEX_SOURCE },
  password: { min: 8, regex: DEFAULT_PASSWORD_REGEX_SOURCE, message: DEFAULT_PASSWORD_MESSAGE }
};

function getAudioManager() {
  return window.AudioManager || null;
}

function playClickSound() {
  const audio = getAudioManager();
  if (audio?.playClick) audio.playClick();
}

function updateSoundUI() {
  const audio = getAudioManager();
  if (!audio || !soundToggle || !soundVolume) return;
  soundToggle.textContent = audio.isEnabled() ? "🔊" : "🔇";
  soundToggle.classList.toggle("muted", !audio.isEnabled());
  const vol = Math.round(audio.getVolume() * 10);
  soundVolume.value = Number.isNaN(vol) ? 5 : `${vol}`;
}

function initSoundControls() {
  const audio = getAudioManager();
  if (!audio) return;
  audio.bindToUserGesture?.();
  updateSoundUI();
  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      audio.markUserInteracted?.();
      audio.setEnabled?.(!audio.isEnabled());
      updateSoundUI();
      audio.playClick?.();
    });
  }
  if (soundVolume) {
    soundVolume.addEventListener("input", () => {
      audio.markUserInteracted?.();
      const nextValue = Number(soundVolume.value);
      audio.setVolume?.(Number.isNaN(nextValue) ? 0.5 : nextValue / 10);
      updateSoundUI();
    });
  }
}

function initMoveAnimationToggle() {
  let stored = null;
  try {
    stored = localStorage.getItem(MOVE_ANIMATIONS_KEY);
  } catch {
    stored = null;
  }
  if (stored !== null) {
    moveAnimationsEnabled = stored === "true";
  }
  if (animToggle) animToggle.checked = moveAnimationsEnabled;
  if (animToggle) {
    animToggle.addEventListener("change", (event) => {
      moveAnimationsEnabled = !!event.target.checked;
      try {
        localStorage.setItem(MOVE_ANIMATIONS_KEY, String(moveAnimationsEnabled));
      } catch {
        // ignore storage failures
      }
    });
  }
}

function normalizeTheme(value) {
  if (!value) return "technology";
  const normalized = String(value).toLowerCase();
  return THEMES.includes(normalized) ? normalized : "technology";
}

function applyTheme(value, persist = true) {
  const normalized = normalizeTheme(value);
  document.body.classList.remove(...THEME_CLASSES);
  document.body.classList.add(`theme-${normalized}`);
  if (themeSelect) themeSelect.value = normalized;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, normalized);
    } catch {
      // ignore storage failures
    }
  }
}

function initThemeSelector() {
  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem(THEME_KEY);
  } catch {
    storedTheme = null;
  }
  applyTheme(storedTheme || "technology", false);
  if (themeSelect) {
    themeSelect.addEventListener("change", (event) => {
      applyTheme(event.target.value);
    });
  }
}

function showBuzzToast(message) {
  if (!buzzToast) return;
  buzzToast.textContent = message;
  buzzToast.classList.remove("hidden");
  if (buzzToastTimer) window.clearTimeout(buzzToastTimer);
  buzzToastTimer = window.setTimeout(() => {
    buzzToast.classList.add("hidden");
  }, 4500);
}

function updateBuzzUI() {
  if (!buzzPanel || !buzzButton || !buzzStatus) return;
  if (!state || !currentRoom || currentRole !== "player" || state.mode !== "pvp" || state.over) {
    buzzPanel.classList.add("hidden");
    return;
  }
  const myColor = getMyColor();
  if (!myColor) {
    buzzPanel.classList.add("hidden");
    return;
  }
  const opponentColor = myColor === "red" ? "black" : "red";
  const opponent = state.players[opponentColor];
  if (!opponent?.id) {
    buzzPanel.classList.add("hidden");
    return;
  }
  const lastActivity = activityByColor[opponentColor];
  if (!lastActivity) {
    buzzPanel.classList.add("hidden");
    return;
  }
  const now = Date.now();
  const inactiveFor = now - lastActivity;
  if (inactiveFor < INACTIVITY_MS) {
    buzzPanel.classList.add("hidden");
    return;
  }
  buzzPanel.classList.remove("hidden");
  const inactiveSeconds = Math.floor(inactiveFor / 1000);
  const cooldownRemaining = Math.max(0, BUZZ_COOLDOWN_MS - (now - lastBuzzSentAt));
  const canBuzz = cooldownRemaining <= 0;
  buzzButton.disabled = !canBuzz;
  let statusText = `Rival inactivo: ${inactiveSeconds}s.`;
  if (!canBuzz) {
    statusText += ` Puedes avisar en ${Math.ceil(cooldownRemaining / 1000)}s.`;
  }
  buzzStatus.textContent = statusText;
}

function sendActivity(reason, throttleMs = 0) {
  if (!socket || !socketReady || !currentRoom || currentRole !== "player") return;
  const now = Date.now();
  if (throttleMs > 0 && now - lastActivitySentAt < throttleMs) return;
  socket.emit("activity", { code: currentRoom, reason });
  lastActivitySentAt = now;
}

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
document.addEventListener("pointerdown", () => sendActivity("pointerdown"));
document.addEventListener("keydown", () => sendActivity("keydown"));
document.addEventListener("touchstart", () => sendActivity("touchstart"), { passive: true });
document.addEventListener("mousemove", () => sendActivity("mousemove", ACTIVITY_THROTTLE_MS));
window.setInterval(updateBuzzUI, 1000);

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

function clearRecoveryNotice() {
  if (!recoveryNotice) return;
  recoveryNotice.classList.add("hidden");
  recoveryNotice.textContent = "";
}

function showRecoveryNotice(message, code) {
  if (!recoveryNotice) return;
  recoveryNotice.innerHTML = `${message} <strong>${code}</strong>`;
  recoveryNotice.classList.remove("hidden");
}

function validateUsername(username) {
  if (!username) return "Ingresa tu usuario.";
  const min = authConfig.username?.min ?? 3;
  const max = authConfig.username?.max ?? 20;
  if (username.length < min || username.length > max) {
    return `El usuario debe tener entre ${min} y ${max} caracteres.`;
  }
  if (/\s/.test(username)) return "El usuario no debe tener espacios.";
  if (!usernameRegex.test(username)) {
    return "El usuario solo puede incluir letras, números, guion bajo y guion medio.";
  }
  return null;
}

function validatePasswordStrength(password) {
  if (!passwordRegex.test(password || "")) {
    return passwordMessage;
  }
  return null;
}

function authErrorMessage(error, context) {
  switch (error) {
    case passwordMessage:
      return passwordMessage;
    case "username_taken":
      return "Ese usuario ya existe. Prueba otro.";
    case "bad_credentials":
      return "Usuario o contraseña incorrectos.";
    case "registration_disabled":
      return "El registro está deshabilitado. Contacta al administrador.";
    case "registration_limited":
      return "Se alcanzó el límite de registros por IP. Intenta más tarde.";
    case "recovery_failed":
      return "No se pudo verificar el código de recuperación.";
    case "bad_input":
      return context === "recover"
        ? "Revisa el usuario, el código y la nueva contraseña."
        : "Revisa los campos ingresados.";
    default:
      return null;
  }
}

async function loadAuthConfig() {
  try {
    const data = await api("/api/auth/config");
    if (data?.username) authConfig.username = data.username;
    if (data?.password) authConfig.password = data.password;
    if (authConfig.username?.pattern) {
      usernameRegex = new RegExp(authConfig.username.pattern);
    }
    if (authConfig.password?.regex) {
      passwordRegex = new RegExp(authConfig.password.regex);
    }
    if (authConfig.password?.message) {
      passwordMessage = authConfig.password.message;
    }
    authConfig.allowRegistration = data?.allowRegistration ?? true;
  } catch (_) {
    authConfig = authConfig || {
      allowRegistration: true,
      username: { min: 3, max: 20, pattern: DEFAULT_USERNAME_REGEX_SOURCE },
      password: { min: 8, regex: DEFAULT_PASSWORD_REGEX_SOURCE, message: DEFAULT_PASSWORD_MESSAGE }
    };
  }
  if (btnRegister) btnRegister.disabled = !authConfig.allowRegistration;
  if (registrationStatus) {
    registrationStatus.textContent = authConfig.allowRegistration
      ? "Registro habilitado."
      : "Registro deshabilitado por el administrador.";
  }
}

function setAuthUI(logged) {
  const canPlay = logged && socketReady;
  authCard.classList.toggle("hidden", logged);
  mainApp.classList.toggle("hidden", !logged);
  if (logged) {
    recoveryPanel?.classList.add("hidden");
    clearRecoveryNotice();
  }
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

  socket.on("presence:update", ({ users }) => {
    renderPresence(users || []);
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
    const prevState = state;
    state = { ...st, messages: st.messages || [] };
    if (st.activity) {
      activityByColor = { ...activityByColor, ...st.activity };
    }
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
    handleStateSounds(prevState, state);
    prepareMoveAnimation(prevState, state);
    renderBoard();
    runPendingMoveAnimation();
    renderChat();
    updateChatControls();
    updateBuzzUI();
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
    const audio = getAudioManager();
    const myColor = getMyColor();
    if (audio && myColor && g?.winner) {
      if (g.winner === myColor) audio.playWin();
      else audio.playLose();
    }
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

  socket.on("activity:update", ({ color, lastActivityAt }) => {
    if (!color) return;
    activityByColor = { ...activityByColor, [color]: lastActivityAt };
    updateBuzzUI();
  });

  socket.on("buzz:received", () => {
    const audio = getAudioManager();
    if (audio?.playBuzz) audio.playBuzz();
    showBuzzToast("⚡ Tu rival te está avisando. ¡Es tu turno!");
  });

  socket.on("buzz:sent", ({ ts }) => {
    lastBuzzSentAt = ts || Date.now();
    updateBuzzUI();
  });

  socket.on("buzz:denied", ({ reason }) => {
    const reasonMsg = reason === "target_active"
      ? "Tu rival está activo."
      : reason === "cooldown"
        ? "Espera unos segundos para volver a avisar."
        : "No se pudo enviar el aviso.";
    showBuzzToast(reasonMsg);
    updateBuzzUI();
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
      playClickSound();
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

function formatConnectedSince(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Ahora";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return `${hours} h`;
}

function renderPresence(users = []) {
  if (!presenceList) return;
  presenceList.innerHTML = "";
  users.forEach((user) => {
    const tr = document.createElement("tr");
    const badge = user.connections > 1 ? ` <span class="presenceBadge">x${user.connections}</span>` : "";
    tr.innerHTML = `
      <td>${user.username || "Usuario"}${badge}</td>
      <td>${user.status || "En lobby"}</td>
      <td>${formatConnectedSince(user.connectedAt)}</td>
    `;
    presenceList.appendChild(tr);
  });
  if (presenceCount) presenceCount.textContent = `${users.length}`;
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
function squareName(coord) {
  if (!coord) return "—";
  const ui = engineToUiCoord(coord);
  return `${files[ui.c]}${8 - ui.r}`;
}
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
function lastMoveKeyFor(st) {
  if (!st?.lastMove?.move) return null;
  const color = st.lastMove.color || "none";
  const turnNumber = st.lastMovedByColor?.[color]?.turnNumber ?? st.turnCount ?? "0";
  return `${color}:${turnNumber}:${moveSig(st.lastMove.move)}`;
}

function isPerspectiveFlipped() {
  const myColor = getMyColor();
  return myColor === "black";
}

function engineToUiCoord(coord) {
  if (!coord) return { r: 0, c: 0 };
  if (!isPerspectiveFlipped()) return { r: coord.r, c: coord.c };
  return { r: 7 - coord.r, c: 7 - coord.c };
}

function uiToEngineCoord(coord) {
  if (!coord) return { r: 0, c: 0 };
  if (!isPerspectiveFlipped()) return { r: coord.r, c: coord.c };
  return { r: 7 - coord.r, c: 7 - coord.c };
}

function ensureTrailLayer() {
  if (!boardEl) return;
  if (!trailSvg) {
    trailSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    trailSvg.classList.add("trailOverlay");
    trailSvg.setAttribute("viewBox", "0 0 100 100");
    trailSvg.setAttribute("preserveAspectRatio", "none");
    previewTrailGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    previewTrailGroup.classList.add("trailGroup", "previewTrail");
    moveTrailGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    moveTrailGroup.classList.add("trailGroup", "moveTrail");
    trailSvg.appendChild(previewTrailGroup);
    trailSvg.appendChild(moveTrailGroup);
  }
  if (!boardEl.contains(trailSvg)) {
    boardEl.appendChild(trailSvg);
  }
}

function clearTrailGroup(group) {
  if (!group) return;
  group.innerHTML = "";
}

function coordToPercent(coord) {
  const ui = engineToUiCoord(coord);
  const x = ((ui.c + 0.5) / 8) * 100;
  const y = ((ui.r + 0.5) / 8) * 100;
  return { x, y };
}

function drawTrail(path, group, className = "") {
  ensureTrailLayer();
  if (!group) return;
  clearTrailGroup(group);
  if (!Array.isArray(path) || path.length < 2) return;
  const points = path.map((p) => {
    const { x, y } = coordToPercent(p);
    return `${x},${y}`;
  }).join(" ");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", points);
  line.classList.add("trailLine");
  if (className) line.classList.add(className);
  group.appendChild(line);
}

function clearMoveAnimationEffects() {
  if (moveHighlightTimeout) window.clearTimeout(moveHighlightTimeout);
  if (moveTrailTimeout) window.clearTimeout(moveTrailTimeout);
  moveHighlightTimeout = null;
  moveTrailTimeout = null;
  boardEl?.querySelectorAll(".moveOrigin, .moveDestination").forEach((cell) => {
    cell.classList.remove("moveOrigin", "moveDestination");
  });
  clearTrailGroup(moveTrailGroup);
  if (activeGhostTimer) window.clearTimeout(activeGhostTimer);
  activeGhostTimer = null;
  if (activeGhostPiece) {
    activeGhostPiece.remove();
    activeGhostPiece = null;
  }
}

function highlightMoveEndpoints(move, duration = 600) {
  if (!move) return;
  const fromCell = getCell(move.pieceFrom);
  const toCell = getCell(move.pieceTo);
  if (fromCell) fromCell.classList.add("moveOrigin");
  if (toCell) toCell.classList.add("moveDestination");
  moveHighlightTimeout = window.setTimeout(() => {
    if (fromCell) fromCell.classList.remove("moveOrigin");
    if (toCell) toCell.classList.remove("moveDestination");
  }, duration);
}

function showMoveTrail(path, duration = 700) {
  if (!Array.isArray(path) || path.length < 2) return;
  drawTrail(path, moveTrailGroup, "moveTrailLine");
  moveTrailTimeout = window.setTimeout(() => {
    clearTrailGroup(moveTrailGroup);
  }, duration);
}

function createGhostPiece(pieceValue, colorHint) {
  const ghost = document.createElement("div");
  ghost.className = "piece ghostPiece";
  const color = pieceValue ? colorOfPiece(pieceValue) : colorHint;
  if (color) ghost.classList.add(color);
  if (pieceValue && Math.abs(pieceValue) === 2) ghost.classList.add("king");
  return ghost;
}

function positionGhost(ghost, uiCoord, size) {
  const pad = size * 0.12;
  ghost.style.width = `${size * 0.76}px`;
  ghost.style.height = `${size * 0.76}px`;
  ghost.style.left = `${uiCoord.c * size + pad}px`;
  ghost.style.top = `${uiCoord.r * size + pad}px`;
}

async function animateMoveGhost(move, pieceValue, colorHint) {
  if (!moveAnimationsEnabled || !boardEl || !move?.path || move.path.length < 2) return;
  const rect = boardEl.getBoundingClientRect();
  if (!rect.width) return;
  const size = rect.width / 8;
  if (activeGhostPiece) activeGhostPiece.remove();
  const ghost = createGhostPiece(pieceValue, colorHint);
  activeGhostPiece = ghost;
  boardEl.appendChild(ghost);
  const uiStart = engineToUiCoord(move.path[0]);
  positionGhost(ghost, uiStart, size);
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  for (let i = 1; i < move.path.length; i++) {
    const ui = engineToUiCoord(move.path[i]);
    positionGhost(ghost, ui, size);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      activeGhostTimer = window.setTimeout(resolve, 190);
    });
  }
  activeGhostTimer = window.setTimeout(() => {
    if (ghost) ghost.remove();
    if (activeGhostPiece === ghost) activeGhostPiece = null;
  }, 220);
}

function prepareMoveAnimation(prevState, nextState) {
  if (!prevState) return;
  if (!nextState?.lastMove?.move) return;
  const moveKey = lastMoveKeyFor(nextState);
  if (!moveKey || moveKey === lastMoveAnimationKey) return;
  lastMoveAnimationKey = moveKey;
  const myColor = getMyColor();
  const moveColor = nextState.lastMove.color;
  const isOpponent = myColor ? moveColor !== myColor : true;
  if (!isOpponent) return;
  const move = nextState.lastMove.move;
  const pieceValue = prevState?.board?.[move.pieceFrom.r]?.[move.pieceFrom.c] ?? null;
  pendingMoveAnimation = { move, color: moveColor, pieceValue };
}

function runPendingMoveAnimation() {
  if (!pendingMoveAnimation) return;
  const { move, color, pieceValue } = pendingMoveAnimation;
  pendingMoveAnimation = null;
  clearMoveAnimationEffects();
  highlightMoveEndpoints(move);
  showMoveTrail(move.path);
  animateMoveGhost(move, pieceValue, color);
}
function handleStateSounds(prevState, nextState) {
  const audio = getAudioManager();
  if (!audio) return;
  const nextKey = lastMoveKeyFor(nextState);
  if (!prevState) {
    lastMoveKey = nextKey;
    return;
  }
  const prevKey = lastMoveKey || lastMoveKeyFor(prevState);
  const moveChanged = nextKey && nextKey !== prevKey;
  if (moveChanged && nextState?.lastMove?.move) {
    const captures = nextState.lastMove.move.captures?.length || 0;
    if (captures > 0) {
      audio.playEat();
    } else {
      const myColor = getMyColor();
      if (myColor && nextState.lastMove.color && nextState.lastMove.color !== myColor) {
        audio.playMove();
      }
    }
  }
  const pendingCleared = prevState?.pendingBlow && !nextState?.pendingBlow;
  const missedCleared = prevState?.missedCapture && !nextState?.missedCapture;
  if (pendingCleared && missedCleared && !moveChanged) {
    audio.playBlow();
  }
  lastMoveKey = nextKey || prevKey;
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
  clearTrailGroup(previewTrailGroup);
}

function showPreview(move, opts = {}) {
  if (!move) return;
  clearPreview();
  const partialUntil = opts.partialUntil || move.path.length;
  const trailPath = move.path.slice(0, Math.min(partialUntil + 1, move.path.length));
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
  drawTrail(trailPath, previewTrailGroup, "previewTrailLine");
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
    card.onmouseenter = () => showPreview(mv);
    card.onmouseleave = () => {
      const fallback = committedMove || selection?.candidates?.[0] || mv;
      showPreview(fallback);
    };
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
  sendActivity("move");
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
  sendActivity("blow");
  awaitingBlowSelection = false;
}

function renderBoard() {
  boardEl.innerHTML = "";
  currentTargets = [];
  currentPreviewBadges = [];
  boardCells = [];
  trailSvg = null;
  previewTrailGroup = null;
  moveTrailGroup = null;
  clearMoveAnimationEffects();
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
  const myLastMove = myColor ? lastMoves[myColor] : null;
  const opponentLastMove = opponent ? lastMoves[opponent] : null;

  for (let uiR = 0; uiR < 8; uiR++) {
    for (let uiC = 0; uiC < 8; uiC++) {
      const engineCoord = uiToEngineCoord({ r: uiR, c: uiC });
      const r = engineCoord.r;
      const c = engineCoord.c;
      const cell = document.createElement("div");
      cell.className = "cell " + (((uiR + uiC) % 2 === 1) ? "dark" : "light");
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
      if (myLastMove) {
        if (isSameCoord(myLastMove.to, { r, c })) cell.classList.add("lastMovedPiece");
      }
      if (opponentLastMove) {
        if (isSameCoord(opponentLastMove.from, { r, c })) {
          cell.classList.add("lastMovedOrigin", "lastMovedOpponent");
        }
        if (isSameCoord(opponentLastMove.to, { r, c })) {
          cell.classList.add("lastMovedPiece", "lastMovedOpponent");
        }
      }

      boardEl.appendChild(cell);
      boardCells[r * 8 + c] = cell;
    }
  }
  ensureTrailLayer();
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
  sendActivity("chat");
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
  activityByColor = { red: null, black: null };
  lastBuzzSentAt = 0;
  if (buzzPanel) buzzPanel.classList.add("hidden");
  if (buzzToast) buzzToast.classList.add("hidden");
  updateFocusMode(false);
}

if (btnShowRecovery) {
  btnShowRecovery.onclick = () => {
    recoveryPanel?.classList.toggle("hidden");
    authMsg.textContent = "";
  };
}

if (btnCancelRecovery) {
  btnCancelRecovery.onclick = () => {
    recoveryPanel?.classList.add("hidden");
    authMsg.textContent = "";
  };
}

if (btnRecover) {
  btnRecover.onclick = async () => {
    try {
      const username = recoveryUsername?.value.trim() || "";
      const code = recoveryCode?.value.trim() || "";
      const password = recoveryPassword?.value || "";
      const confirm = recoveryPasswordConfirm?.value || "";
      const usernameError = validateUsername(username);
      if (usernameError) {
        authMsg.textContent = usernameError;
        return;
      }
      if (!code) {
        authMsg.textContent = "Ingresa el código de recuperación.";
        return;
      }
      const passwordError = validatePasswordStrength(password);
      if (passwordError) {
        authMsg.textContent = passwordError;
        return;
      }
      if (password !== confirm) {
        authMsg.textContent = "Las contraseñas no coinciden.";
        return;
      }
      const data = await api("/api/auth/recover", "POST", {
        username,
        recoveryCode: code,
        newPassword: password
      });
      if (data?.recoveryCode) {
        showRecoveryNotice("Nuevo código de recuperación:", data.recoveryCode);
        window.alert(`Nuevo código de recuperación:\n${data.recoveryCode}`);
      }
      if (recoveryPassword) recoveryPassword.value = "";
      if (recoveryPasswordConfirm) recoveryPasswordConfirm.value = "";
      if (recoveryCode) recoveryCode.value = "";
      if (recoveryPanel) recoveryPanel.classList.add("hidden");
      authMsg.textContent = "Contraseña actualizada. Ya puedes iniciar sesión.";
    } catch (e) {
      authMsg.textContent = authErrorMessage(e?.error, "recover") || "Error";
    }
  };
}

btnLogin.onclick = async () => {
  try {
    const username = $("username").value.trim();
    const password = $("password").value;
    clearRecoveryNotice();
    const usernameError = validateUsername(username);
    if (usernameError) {
      authMsg.textContent = usernameError;
      return;
    }
    if (!password) {
      authMsg.textContent = "Ingresa tu contraseña.";
      return;
    }
    await api("/api/auth/login", "POST", { username, password });
    await refreshMe();
  } catch (e) {
    authMsg.textContent = authErrorMessage(e?.error, "login") || "Error";
  }
};

btnRegister.onclick = async () => {
  try {
    const username = $("username").value.trim();
    const password = $("password").value;
    clearRecoveryNotice();
    if (!authConfig.allowRegistration) {
      authMsg.textContent = "El registro está deshabilitado por el administrador.";
      return;
    }
    const usernameError = validateUsername(username);
    if (usernameError) {
      authMsg.textContent = usernameError;
      return;
    }
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      authMsg.textContent = passwordError;
      return;
    }
    const data = await api("/api/auth/register", "POST", { username, password });
    if (data?.recoveryCode) {
      showRecoveryNotice("Guarda este código de recuperación:", data.recoveryCode);
      window.alert(`Guarda este código de recuperación:\n${data.recoveryCode}`);
    }
    await refreshMe();
  } catch (e) {
    authMsg.textContent = authErrorMessage(e?.error, "register") || "Error";
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
  sendActivity("chat");
  if (e.key === "Enter") {
    e.preventDefault();
    sendChatMessage();
  }
});

if (buzzButton) {
  buzzButton.onclick = () => {
    if (!socket || !currentRoom || !state) return;
    const myColor = getMyColor();
    if (!myColor) return;
    const opponentColor = myColor === "red" ? "black" : "red";
    const targetId = state.players[opponentColor]?.id;
    if (!targetId) return;
    playClickSound();
    sendActivity("buzz");
    socket.emit("buzz:request", { roomId: currentRoom, targetPlayerId: targetId });
  };
}

btnRequestDraw.onclick = () => {
  if (!state || !currentRoom) return;
  playClickSound();
  sendActivity("draw");
  socket.emit("requestDraw", { code: currentRoom });
  pendingTxt.textContent = "Solicitud enviada";
};

btnResign.onclick = () => {
  if (!state || !currentRoom) return;
  playClickSound();
  sendActivity("resign");
  const ok = window.confirm("¿Seguro que deseas rendirte?");
  if (ok) socket.emit("resign", { code: currentRoom });
};

btnLeaveRoom.onclick = () => {
  if (!state || !currentRoom) return;
  playClickSound();
  sendActivity("leave");
  const reason = state.mode === "ai" ? "ai_exit" : "leave";
  socket.emit("room:close", { code: currentRoom, reason });
};

btnFinishRoom.onclick = () => {
  if (!state || !currentRoom) return;
  playClickSound();
  sendActivity("finish");
  const reason = "finished";
  socket.emit("room:close", { code: currentRoom, reason });
};
btnConfirmMove.onclick = () => {
  playClickSound();
  submitMove(committedMove);
};
btnCancelMove.onclick = () => {
  playClickSound();
  selection = null;
  committedMove = null;
  hoverMove = null;
  clearTargetHighlights();
  clearPreview();
  renderMovePanel();
};
btnModifyMove.onclick = () => {
  if (!selection) return;
  playClickSound();
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
  playClickSound();
  await refreshLeaderboard();
  drawer.classList.remove("hidden");
};
btnCloseRanking.onclick = () => drawer.classList.add("hidden");

btnResume.onclick = () => {
  playClickSound();
  if (resumeCode) socket.emit("rejoinRoom", { code: resumeCode });
  resumeModal.classList.add("hidden");
  updateFocusMode(true);
};
btnSkipResume.onclick = async () => {
  playClickSound();
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
  playClickSound();
  hideEndgameModal();
  switchTab("lobbyPanel");
  updateFocusMode(false);
};
btnEndgameNew.onclick = () => {
  playClickSound();
  hideEndgameModal();
  refreshLobby();
  switchTab("lobbyPanel");
};
btnEndgameRanking.onclick = async () => {
  playClickSound();
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
  await loadAuthConfig();
  await refreshMe();
  await loadVersion();
  initThemeSelector();
  initSoundControls();
  initMoveAnimationToggle();
  if (me) {
    await refreshLeaderboard();
    refreshLobby();
  }
})();
