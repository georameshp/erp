/* global $, window */
$(function () {
  const $login = $("#loginScreen");
  const $setup = $("#setupScreen");
  const $app = $("#appShell");

  function showLoading(text) {
    $("#loadingText").text(text || "Loading...");
    $("#loadingOverlay").removeClass("d-none");
  }

  function hideLoading() {
    $("#loadingOverlay").addClass("d-none");
  }

  function showScreen(name) {
    $login.addClass("d-none");
    $setup.addClass("d-none");
    $app.addClass("d-none");
    if (name === "login") $login.removeClass("d-none");
    if (name === "setup") $setup.removeClass("d-none");
    if (name === "app") $app.removeClass("d-none");
  }

  function renderState(state) {
    const user = window.GoogleAuth.getCurrentUser();
    $("#userEmail").text(user && user.email ? user.email : "User");
    $("#companyJson").text(JSON.stringify(state.company || {}, null, 2));
    $("#driveStateJson").text(JSON.stringify(state, null, 2));
    $("#statEvents").text((state.manifest && state.manifest.eventCount) || 0);
    $("#syncBadge").removeClass("badge-secondary badge-danger").addClass("badge-success").text("Synced");
  }

  async function startAfterLogin() {
    showLoading("Checking Google Drive for ERP data...");
    const state = await window.SyncEngine.openOrSetup();
    hideLoading();
    if (!state) {
      showScreen("setup");
      return;
    }
    renderState(state);
    showScreen("app");
    routeTo(location.hash || "#dashboard");
  }

  $("#btnGoogleLogin").on("click", async function () {
    try {
      if (!window.GoogleAuth.isConfigured()) {
        alert("Please add your Google OAuth Web Client ID in assets/js/config.js first.");
        return;
      }
      showLoading("Signing in with Google...");
      await window.GoogleAuth.signIn();
      hideLoading();
      await startAfterLogin();
    } catch (err) {
      hideLoading();
      console.error(err);
      alert(err.message || "Google login failed.");
    }
  });

  $("#setupForm").on("submit", async function (e) {
    e.preventDefault();
    const setup = {
      companyName: $("#companyName").val().trim(),
      currency: $("#currency").val().trim(),
      taxName: $("#taxName").val().trim(),
      taxRate: Number($("#taxRate").val() || 0),
      financialYear: {
        code: $("#fyCode").val().trim(),
        startDate: $("#fyStart").val(),
        endDate: $("#fyEnd").val()
      }
    };
    try {
      showLoading("Creating ERP folders and files in Google Drive...");
      const state = await window.SyncEngine.createInitialDriveStructure(setup);
      hideLoading();
      renderState(state);
      showScreen("app");
      routeTo("#dashboard");
    } catch (err) {
      hideLoading();
      console.error(err);
      alert(err.message || "Setup failed.");
    }
  });

  $("#btnSyncNow").on("click", async function () {
    try {
      $("#syncBadge").removeClass("badge-success badge-danger").addClass("badge-secondary").text("Syncing...");
      const state = await window.SyncEngine.syncNow();
      renderState(state);
    } catch (err) {
      console.error(err);
      $("#syncBadge").removeClass("badge-success badge-secondary").addClass("badge-danger").text("Sync error");
      alert(err.message || "Sync failed.");
    }
  });

  $("#btnSignOut").on("click", function (e) {
    e.preventDefault();
    window.GoogleAuth.signOut();
    showScreen("login");
  });

  $(document).on("click", ".nav-route", function (e) {
    const href = $(this).attr("href");
    if (href && href.startsWith("#")) {
      e.preventDefault();
      routeTo(href);
    }
  });

  function routeTo(hash) {
    const route = (hash || "#dashboard").replace("#", "");
    location.hash = route;
    $(".app-view").addClass("d-none");
    const $view = $("#view-" + route);
    if ($view.length) $view.removeClass("d-none"); else $("#view-dashboard").removeClass("d-none");
    $(".nav-sidebar .nav-link").removeClass("active");
    $(`.nav-sidebar .nav-link[href="#${route}"]`).addClass("active");
    const titles = {
      dashboard: "Dashboard",
      ledgers: "Ledgers",
      transactions: "Transactions",
      inventory: "Inventory",
      activity: "Activity Log",
      settings: "Settings"
    };
    $("#pageTitle").text(titles[route] || "Dashboard");
  }

  window.addEventListener("hashchange", () => routeTo(location.hash));
  showScreen("login");
});
