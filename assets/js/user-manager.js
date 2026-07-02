/* global window, $, alert, confirm */
(function () {
  const SESSION_KEY = "GeoERP_AppUserSession";
  let cache = { users: [], userFiles: {} };
  let initialized = false;

  function nowIso() { return new Date().toISOString(); }
  function amount(v) { return Number(v || 0); }
  function normalizeUsername(v) { return String(v || "").trim().toLowerCase(); }
  function userEmail() { return (window.GoogleAuth.getCurrentUser() || {}).email || "unknown"; }
  function roleLabel(role) { return String(role || "").replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase()); }
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch])); }
  function escapeAttr(value) { return escapeHtml(value); }

  async function getState() {
    const state = await window.LocalDB.getKV("driveState");
    if (!state || !state.manifest) throw new Error("Drive state missing.");
    return state;
  }

  function saveSession(user) {
    const publicUser = {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      googleEmail: user.googleEmail || user.email,
      driveAccessRole: user.driveAccessRole || "reader",
      role: user.role,
      permissions: user.permissions || [],
      employeeId: user.employeeId || null,
      loginAt: nowIso()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(publicUser));
    return publicUser;
  }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; }
  }

  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  async function ensureUsersFolder(state) {
    const manifest = state.manifest;
    manifest.folderIds = manifest.folderIds || {};
    if (!manifest.folderIds.users) {
      const folder = await window.GoogleDrive.createFolder("users", manifest.rootFolderId, {
        appId: window.ERP_CONFIG.APP_ID,
        type: "system-folder",
        companyId: manifest.companyId
      });
      manifest.folderIds.users = folder.id;
      manifest.fileIds = manifest.fileIds || {};
      await window.LocalDB.setKV("driveState", state);
      if (manifest.fileIds.manifest) await window.GoogleDrive.updateJsonFile(manifest.fileIds.manifest, manifest);
    }
    return manifest.folderIds.users;
  }

  async function discoverUsers(manifest) {
    const userFileIds = { ...(((manifest.fileIds || {}).users) || {}) };
    if (!Object.keys(userFileIds).length && manifest.folderIds && manifest.folderIds.users) {
      const files = await window.GoogleDrive.listChildren(manifest.folderIds.users);
      files.filter(f => String(f.name).startsWith("USR-") && String(f.name).endsWith(".json")).forEach(f => {
        const id = (f.appProperties && f.appProperties.userId) || String(f.name).replace(/\.json$/i, "");
        userFileIds[id] = f.id;
      });
    }
    return userFileIds;
  }

  async function loadUsers() {
    const state = await getState();
    const manifest = state.manifest;
    await ensureUsersFolder(state);
    const userFileIds = await discoverUsers(manifest);
    const rows = await Promise.all(Object.entries(userFileIds).map(async ([id, fileId]) => {
      try {
        const doc = await window.GoogleDrive.readJsonFile(fileId);
        return doc && !doc.isDeleted ? { ...doc, _fileId: fileId } : null;
      } catch (e) { console.warn("Cannot read user", id, e); return null; }
    }));
    cache.users = rows.filter(Boolean).sort((a, b) => a.username.localeCompare(b.username));
    cache.userFiles = userFileIds;
    manifest.fileIds = manifest.fileIds || {};
    manifest.fileIds.users = userFileIds;
    await window.LocalDB.setKV("driveState", state);
    renderUsers();
    return cache.users;
  }

  async function login(username, password) {
    username = normalizeUsername(username);
    const users = await loadUsers();
    const user = users.find(u => normalizeUsername(u.username) === username && u.status === "active");
    if (!user) throw new Error("Invalid username or inactive user.");
    const googleUser = window.GoogleAuth.getCurrentUser() || {};
    const expectedGoogleEmail = String(user.googleEmail || user.email || "").toLowerCase();
    const actualGoogleEmail = String(googleUser.email || "").toLowerCase();
    if (expectedGoogleEmail && actualGoogleEmail && expectedGoogleEmail !== actualGoogleEmail) {
      throw new Error("This ERP user is linked to " + expectedGoogleEmail + ". Please login to Google using that account.");
    }
    const ok = await window.CryptoManager.verifyPassword(password, user.passwordHash);
    if (!ok) throw new Error("Invalid password.");
    user.lastLoginAt = nowIso();
    try {
      const updated = { ...user, lastLoginAt: user.lastLoginAt, updatedAt: user.updatedAt || nowIso() };
      delete updated._fileId;
      await window.GoogleDrive.updateJsonFile(user._fileId, updated);
    } catch (e) { console.warn("Unable to update last login", e); }
    return saveSession(user);
  }

  function renderUsers() {
    const body = $("#userTable");
    if (!body.length) return;
    if (!cache.users.length) {
      body.html('<tr><td colspan="7" class="text-muted p-3">No users found.</td></tr>');
      return;
    }
    body.html(cache.users.map(u => `
      <tr>
        <td><code>${escapeHtml(u.username)}</code></td>
        <td>${escapeHtml(u.displayName || "")}</td>
        <td>${escapeHtml(u.googleEmail || u.email || "")}</td>
        <td><span class="badge badge-${u.role === "super_admin" ? "danger" : "info"}">${escapeHtml(roleLabel(u.role))}</span></td>
        <td>${u.employeeId ? escapeHtml(u.employeeId) : '<span class="text-muted">Not linked</span>'}</td>
        <td><span class="badge badge-${u.status === "active" ? "success" : "secondary"}">${escapeHtml(u.status || "active")}</span></td>
        <td>
          <button class="btn btn-xs btn-outline-primary btn-edit-user" data-id="${escapeAttr(u.userId)}"><i class="fas fa-edit"></i></button>
          <button class="btn btn-xs btn-outline-danger btn-delete-user" data-id="${escapeAttr(u.userId)}"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join(""));
  }

  function openUserModal(mode, userId) {
    const u = cache.users.find(x => x.userId === userId) || null;
    $("#userMode").val(mode);
    $("#userId").val(u ? u.userId : "");
    $("#userModalTitle").text(mode === "edit" ? "Edit User" : "Create User");
    $("#userUsername").prop("disabled", mode === "edit").val(u ? u.username : "");
    $("#userDisplayName").val(u ? u.displayName || "" : "");
    $("#userGoogleEmail").val(u ? (u.googleEmail || u.email || "") : "");
    $("#userRole").val(u ? u.role : "viewer");
    $("#userEmployeeId").val(u ? u.employeeId || "" : "");
    $("#userStatus").val(u ? u.status || "active" : "active");
    $("#userPassword,#userPasswordConfirm").val("");
    $("#passwordRequiredMark").toggleClass("d-none", mode === "edit");
    $("#userModal").modal("show");
  }

  async function saveUserFromForm() {
    const state = await getState();
    const manifest = state.manifest;
    await ensureUsersFolder(state);
    manifest.fileIds = manifest.fileIds || {};
    manifest.fileIds.users = manifest.fileIds.users || {};
    const mode = $("#userMode").val();
    const userId = mode === "edit" ? $("#userId").val() : "USR-" + window.CryptoManager.uuid("").slice(0, 8).toUpperCase();
    const username = normalizeUsername($("#userUsername").val());
    const password = $("#userPassword").val();
    const passwordConfirm = $("#userPasswordConfirm").val();
    const googleEmail = String($("#userGoogleEmail").val() || "").trim().toLowerCase();
    if (!username) throw new Error("Username is required.");
    if (!googleEmail) throw new Error("Google Gmail is required.");
    if (mode === "create" && !password) throw new Error("Password is required.");
    if (password || passwordConfirm) {
      if (password !== passwordConfirm) throw new Error("Passwords do not match.");
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    }

    if (mode === "create" && cache.users.some(u => normalizeUsername(u.username) === username)) throw new Error("Username already exists.");

    let before = null;
    let doc;
    if (mode === "edit") {
      const fileId = manifest.fileIds.users[userId];
      before = await window.GoogleDrive.readJsonFile(fileId);
      doc = { ...before };
    } else {
      doc = { schemaVersion: 1, userId, username, createdAt: nowIso(), createdBy: userEmail(), revision: 0, isDeleted: false };
    }

    doc.username = username;
    doc.displayName = $("#userDisplayName").val().trim();
    doc.googleEmail = googleEmail;
    doc.email = googleEmail;
    doc.driveAccessRole = doc.role === "super_admin" ? "owner" : "reader";
    doc.role = $("#userRole").val();
    doc.driveAccessRole = doc.role === "super_admin" ? "owner" : "reader";
    doc.permissions = doc.role === "super_admin" ? ["*"] : [];
    doc.employeeId = $("#userEmployeeId").val() || null;
    doc.employeeLinkStatus = doc.employeeId ? "linked" : "not_linked";
    doc.status = $("#userStatus").val();
    if (password) {
      doc.passwordHash = await window.CryptoManager.hashPassword(password);
      doc.passwordUpdatedAt = nowIso();
    }
    doc.updatedAt = nowIso();
    doc.updatedBy = userEmail();
    doc.revision = amount(doc.revision) + 1;

    if (mode === "create") {
      const file = await window.GoogleDrive.createJsonFile(userId + ".json", manifest.folderIds.users, doc, {
        appId: window.ERP_CONFIG.APP_ID,
        type: "erp-user",
        companyId: manifest.companyId,
        userId,
        username,
        role: doc.role
      });
      manifest.fileIds.users[userId] = file.id;
      await window.LocalDB.setKV("driveState", state);
    } else {
      await window.GoogleDrive.updateJsonFile(manifest.fileIds.users[userId], doc);
    }
    await shareCompanyReadOnly(doc).catch(function (e) {
      console.warn("Unable to share Drive folder. User record saved, but Drive access may need manual sharing:", e.message || e);
      alert("User saved, but Google Drive sharing failed. Please share the ERP-App-Data folder manually with " + doc.googleEmail + " as Viewer/Reader.");
    });
    await updateUsersSummary();
    await addUserEvent(mode === "create" ? "user_created" : "user_updated", userId, before, doc);
    $("#userModal").modal("hide");
    await loadUsers();
  }

  async function updateUsersSummary() {
    const state = await getState();
    const manifest = state.manifest;
    const users = await loadUsers();
    const summary = {
      schemaVersion: 1,
      companyId: manifest.companyId,
      users: users.map(u => ({ userId: u.userId, username: u.username, displayName: u.displayName, email: u.email, googleEmail: u.googleEmail || u.email, driveAccessRole: u.driveAccessRole || "reader", role: u.role, employeeId: u.employeeId || null, status: u.status })),
      roles: ["super_admin", "admin", "accountant", "inventory_manager", "hr_payroll", "viewer"],
      updatedAt: nowIso(),
      revision: 1
    };
    if (manifest.fileIds.usersSummary) await window.GoogleDrive.updateJsonFile(manifest.fileIds.usersSummary, summary);
  }

  async function addUserEvent(action, userId, before, after) {
    const state = await getState();
    const manifest = state.manifest;
    const event = window.SyncEngine.makeEvent(action, "user", userId, before, after, action.replace(/_/g, " "));
    if (manifest.folderIds && manifest.folderIds.events) await window.GoogleDrive.createEventFile(manifest.folderIds.events, event);
    await window.LocalDB.putEvent(event);
  }

  async function deleteUser(userId) {
    const session = getSession();
    if (session && session.userId === userId) { alert("You cannot delete the currently logged-in ERP user."); return; }
    const u = cache.users.find(x => x.userId === userId);
    if (!u) return;
    if (u.role === "super_admin" && cache.users.filter(x => x.role === "super_admin" && x.status === "active").length <= 1) {
      alert("Delete not allowed. At least one active Super Admin is required."); return;
    }
    if (!confirm("Delete user " + u.username + "?")) return;
    const before = await window.GoogleDrive.readJsonFile(u._fileId);
    const after = { ...before, isDeleted: true, status: "inactive", deletedAt: nowIso(), deletedBy: userEmail(), revision: amount(before.revision) + 1 };
    await window.GoogleDrive.updateJsonFile(u._fileId, after);
    await addUserEvent("user_deleted", userId, before, after);
    await loadUsers();
    await updateUsersSummary();
  }


  async function shareCompanyReadOnly(user) {
    if (!user || !user.googleEmail) return;
    const state = await getState();
    const manifest = state.manifest;
    const currentGoogle = (window.GoogleAuth.getCurrentUser() || {}).email || "";
    if (String(user.googleEmail).toLowerCase() === String(currentGoogle).toLowerCase()) return;
    // Share the root ERP folder as reader. Google Drive folder permissions inherit to child files.
    // This gives the user Drive-level read-only access; ERP role permissions decide what screens/actions they can use.
    await window.GoogleDrive.createPermission(manifest.rootFolderId, user.googleEmail, "reader");
  }

  function can(permission) {
    const session = getSession();
    if (!session) return false;
    const isManagePermission = String(permission || "").endsWith(".manage");
    if (session.driveAccessRole === "reader" && isManagePermission) return false;
    if (session.role === "super_admin" || (session.permissions || []).includes("*")) return true;
    const role = session.role;
    const map = {
      admin: ["users.view", "users.manage", "ledgers.view", "ledgers.manage", "inventory.view", "transactions.view"],
      accountant: ["ledgers.view", "ledgers.manage", "transactions.view", "transactions.manage"],
      inventory_manager: ["inventory.view", "inventory.manage", "ledgers.view"],
      hr_payroll: ["users.view", "employees.view", "employees.manage", "payroll.view", "payroll.manage"],
      viewer: ["ledgers.view", "inventory.view", "transactions.view", "reports.view"]
    };
    return (map[role] || []).includes(permission);
  }

  function openRequest(request) {
    openUserModal("create");
    setTimeout(function () {
      $("#userUsername").val(request.username || (request.gmail || "").split("@")[0]);
      $("#userDisplayName").val(request.name || "");
      $("#userGoogleEmail").val(request.gmail || "");
      $("#userRole").val("viewer");
      $("#userStatus").val("active");
      if (request.contact) {
        const note = "Requested contact: " + request.contact + (request.message ? " | Message: " + request.message : "");
        console.info("User request details:", note);
      }
      alert("User request loaded. Select/create the employee link when Employee module is available, choose role, set a temporary password, then Save User. The ERP folder will be shared read-only to the user's Gmail.");
    }, 300);
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    $(document).on("submit", "#erpLoginForm", async function (e) {
      e.preventDefault();
      try {
        const user = await login($("#erpUsername").val(), $("#erpPassword").val());
        $(document).trigger("geoerp:user-login", [user]);
      } catch (err) { alert(err.message || "ERP login failed."); }
    });
    $(document).on("click", "#btnAddUser", () => openUserModal("create"));
    $(document).on("click", ".btn-edit-user", function () { openUserModal("edit", $(this).data("id")); });
    $(document).on("click", ".btn-delete-user", function () { deleteUser($(this).data("id")).catch(err => alert(err.message || err)); });
    $(document).on("submit", "#userForm", function (e) { e.preventDefault(); saveUserFromForm().catch(err => alert(err.message || err)); });
  }

  window.UserManager = {
    init: bindEvents,
    loadUsers,
    login,
    getSession,
    saveSession,
    clearSession,
    hasSession: () => !!getSession(),
    openRequest,
    can
  };

  bindEvents();
})();
