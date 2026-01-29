const $ = (id) => document.getElementById(id);

const adminPassword = $("adminPassword");
const adminLoginBtn = $("adminLoginBtn");
const adminLoginMsg = $("adminLoginMsg");
const adminLoginCard = $("adminLoginCard");
const adminConsole = $("adminConsole");
const adminUsersBody = $("adminUsersBody");
const adminSearch = $("adminSearch");
const adminStatus = $("adminStatus");
const adminRefreshBtn = $("adminRefreshBtn");
const adminLogoutBtn = $("adminLogoutBtn");
const adminModal = $("adminModal");
const adminModalTitle = $("adminModalTitle");
const adminModalBody = $("adminModalBody");
const adminModalConfirm = $("adminModalConfirm");
const adminModalCancel = $("adminModalCancel");

const DEFAULT_PASSWORD_REGEX_SOURCE = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d]{8,}$";
const DEFAULT_PASSWORD_MESSAGE =
  "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.";
let passwordRegex = new RegExp(DEFAULT_PASSWORD_REGEX_SOURCE);
let passwordMessage = DEFAULT_PASSWORD_MESSAGE;

let users = [];
let modalConfirmHandler = null;

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

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function setStatus(message, isError = false) {
  if (!adminStatus) return;
  adminStatus.textContent = message || "";
  adminStatus.classList.toggle("error", isError);
}

function clearLoginMsg() {
  if (adminLoginMsg) adminLoginMsg.textContent = "";
}

function showLoginMsg(message) {
  if (adminLoginMsg) adminLoginMsg.textContent = message || "";
}

function openModal({ title, body, confirmText = "Guardar", onConfirm }) {
  if (!adminModal) return;
  adminModalTitle.textContent = title;
  adminModalBody.innerHTML = "";
  adminModalBody.appendChild(body);
  adminModalConfirm.textContent = confirmText;
  adminModal.classList.remove("hidden");
  adminModal.setAttribute("aria-hidden", "false");
  modalConfirmHandler = onConfirm;
}

function closeModal() {
  if (!adminModal) return;
  adminModal.classList.add("hidden");
  adminModal.setAttribute("aria-hidden", "true");
  adminModalBody.innerHTML = "";
  modalConfirmHandler = null;
}

function renderUsers() {
  if (!adminUsersBody) return;
  const query = adminSearch?.value?.trim().toLowerCase() || "";
  adminUsersBody.innerHTML = "";
  const filtered = users.filter((user) => user.username.toLowerCase().includes(query));
  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="adminEmpty">No hay usuarios para mostrar.</td>`;
    adminUsersBody.appendChild(tr);
    return;
  }

  filtered.forEach((user) => {
    const tr = document.createElement("tr");
    const presenceLabel = user.presence
      ? `Conectado (${user.presence.status})`
      : "Desconectado";
    const statusLabel = user.disabled ? "Deshabilitado" : presenceLabel;
    const statusClass = user.disabled ? "danger" : user.presence ? "success" : "muted";

    tr.innerHTML = `
      <td>
        <div class="adminUser">
          <span class="adminUserName">${user.username}</span>
          <span class="adminUserId">#${user.id}</span>
        </div>
      </td>
      <td><span class="adminStatusBadge ${statusClass}">${statusLabel}</span></td>
      <td>${formatDate(user.createdAt)}</td>
      <td>${formatDate(user.lastLogin)}</td>
      <td>${user.hasRecovery ? "Sí" : "No"}</td>
      <td>
        <div class="adminActionButtons">
          <button class="ghost" data-action="reset">Resetear contraseña</button>
          <button class="ghost" data-action="recovery">Regenerar recovery</button>
          <button class="ghost" data-action="toggle">${user.disabled ? "Habilitar" : "Deshabilitar"}</button>
        </div>
      </td>
    `;

    const buttons = tr.querySelectorAll("button[data-action]");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "reset") openResetModal(user);
        if (action === "recovery") regenerateRecovery(user);
        if (action === "toggle") toggleDisabled(user);
      });
    });

    adminUsersBody.appendChild(tr);
  });
}

function openResetModal(user) {
  const wrapper = document.createElement("div");
  wrapper.className = "modalBody";
  const info = document.createElement("div");
  info.className = "hint";
  info.textContent = passwordMessage;
  const input = document.createElement("input");
  input.type = "password";
  input.placeholder = "Nueva contraseña";
  input.autocomplete = "new-password";
  const error = document.createElement("div");
  error.className = "hint error";
  wrapper.appendChild(info);
  wrapper.appendChild(input);
  wrapper.appendChild(error);

  openModal({
    title: `Resetear contraseña de ${user.username}`,
    body: wrapper,
    confirmText: "Guardar",
    onConfirm: async () => {
      const value = input.value || "";
      error.textContent = "";
      if (!passwordRegex.test(value)) {
        error.textContent = passwordMessage;
        return;
      }
      try {
        await api(`/api/admin/users/${user.id}/reset-password`, "POST", { newPassword: value });
        setStatus(`Contraseña actualizada para ${user.username}.`);
        closeModal();
      } catch (err) {
        setStatus("No se pudo resetear la contraseña.", true);
      }
    }
  });
}

async function regenerateRecovery(user) {
  try {
    const data = await api(`/api/admin/users/${user.id}/regenerate-recovery`, "POST");
    const wrapper = document.createElement("div");
    wrapper.className = "modalBody";
    const info = document.createElement("div");
    info.className = "hint";
    info.textContent = "Copia el nuevo código de recuperación. Solo se muestra una vez.";
    const codeInput = document.createElement("input");
    codeInput.value = data.recoveryCode || "";
    codeInput.readOnly = true;
    codeInput.addEventListener("click", () => codeInput.select());
    const copyStatus = document.createElement("div");
    copyStatus.className = "hint";
    const copyBtn = document.createElement("button");
    copyBtn.className = "ghost";
    copyBtn.textContent = "Copiar";
    copyBtn.type = "button";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codeInput.value);
        copyStatus.textContent = "Copiado ✅";
      } catch {
        copyStatus.textContent = "No se pudo copiar. Selecciona y copia manualmente.";
        codeInput.focus();
        codeInput.select();
      }
    });
    const row = document.createElement("div");
    row.className = "row";
    row.appendChild(codeInput);
    row.appendChild(copyBtn);
    wrapper.appendChild(info);
    wrapper.appendChild(row);
    wrapper.appendChild(copyStatus);
    openModal({
      title: `Recovery code de ${user.username}`,
      body: wrapper,
      confirmText: "He copiado",
      onConfirm: () => closeModal()
    });
  } catch (err) {
    setStatus("No se pudo regenerar el recovery code.", true);
  }
}

async function toggleDisabled(user) {
  const nextDisabled = !user.disabled;
  const ok = window.confirm(
    nextDisabled
      ? `¿Deshabilitar la cuenta de ${user.username}?`
      : `¿Habilitar la cuenta de ${user.username}?`
  );
  if (!ok) return;
  try {
    await api(`/api/admin/users/${user.id}/disable`, "POST", { disabled: nextDisabled });
    setStatus(`Cuenta ${nextDisabled ? "deshabilitada" : "habilitada"}: ${user.username}.`);
    await loadUsers();
  } catch {
    setStatus("No se pudo actualizar el estado del usuario.", true);
  }
}

async function loadUsers() {
  try {
    const data = await api("/api/admin/users");
    users = data.users || [];
    renderUsers();
    setStatus(`Usuarios cargados: ${users.length}.`);
  } catch (err) {
    setStatus("No se pudo cargar la lista de usuarios.", true);
  }
}

async function loadAuthConfig() {
  try {
    const data = await api("/api/auth/config");
    if (data?.password?.regex) passwordRegex = new RegExp(data.password.regex);
    if (data?.password?.message) passwordMessage = data.password.message;
  } catch {
    // mantener fallback
  }
}

async function checkAdminSession() {
  try {
    const data = await api("/api/admin/me");
    if (data?.isAdmin) {
      adminLoginCard.classList.add("hidden");
      adminConsole.classList.remove("hidden");
      await loadUsers();
    }
  } catch {
    // ignore
  }
}

if (adminLoginBtn) {
  adminLoginBtn.addEventListener("click", async () => {
    clearLoginMsg();
    const password = adminPassword?.value || "";
    if (!password) {
      showLoginMsg("Ingresa la contraseña de administrador.");
      return;
    }
    try {
      await api("/api/admin/login", "POST", { password });
      adminPassword.value = "";
      adminLoginCard.classList.add("hidden");
      adminConsole.classList.remove("hidden");
      await loadUsers();
    } catch (err) {
      const error = err?.error;
      if (error === "admin_not_configured") {
        showLoginMsg("ADMIN_PASSWORD no está configurada en el servidor.");
      } else if (error === "bad_credentials") {
        showLoginMsg("Contraseña incorrecta.");
      } else {
        showLoginMsg("No se pudo iniciar sesión.");
      }
    }
  });
}

if (adminLogoutBtn) {
  adminLogoutBtn.addEventListener("click", async () => {
    try {
      await api("/api/admin/logout", "POST");
      adminConsole.classList.add("hidden");
      adminLoginCard.classList.remove("hidden");
      setStatus("");
    } catch {
      setStatus("No se pudo cerrar sesión.", true);
    }
  });
}

if (adminRefreshBtn) {
  adminRefreshBtn.addEventListener("click", () => loadUsers());
}

if (adminSearch) {
  adminSearch.addEventListener("input", () => renderUsers());
}

if (adminModalCancel) {
  adminModalCancel.addEventListener("click", () => closeModal());
}

if (adminModalConfirm) {
  adminModalConfirm.addEventListener("click", () => {
    if (modalConfirmHandler) modalConfirmHandler();
  });
}

if (adminModal) {
  adminModal.addEventListener("click", (event) => {
    if (event.target?.classList.contains("modalBackdrop")) closeModal();
  });
}

(async function init() {
  await loadAuthConfig();
  await checkAdminSession();
})();
