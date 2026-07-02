/* global $, window */
$(function () {
  const $login = $("#loginScreen");
  const $setup = $("#setupScreen");
  const $app = $("#appShell");
  const $erpLogin = $("#erpLoginScreen");
  const $sharedFolder = $("#sharedFolderScreen");
  let setupPluginsInitialized = false;

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
    $erpLogin.addClass("d-none");
    $sharedFolder.addClass("d-none");
    if (name === "login") $login.removeClass("d-none");
    if (name === "setup") $setup.removeClass("d-none");
    if (name === "sharedFolder") $sharedFolder.removeClass("d-none");
    if (name === "erpLogin") $erpLogin.removeClass("d-none");
    if (name === "app") $app.removeClass("d-none");
  }

  function initSetupPlugins() {
    if (setupPluginsInitialized) return;
    setupPluginsInitialized = true;

    initFinancialYearList();
    initChartTemplateList();

    if ($.fn.datepicker) {
      $(".datepicker").datepicker({
        format: "dd-mm-yyyy",
        autoclose: true,
        todayHighlight: true
      });
    }

    if ($.fn.select2) {
      initBasicSetupSelect2();
      initCurrencySelect();
      initCountrySelect();
    }

    $("#companyLogo").on("change", function () {
      const file = this.files && this.files[0];
      $(this).next(".custom-file-label").text(file ? file.name : "Choose logo");
    });

    $("#fyCode").on("change", function () {
      const selected = $(this).find(":selected");
      const start = selected.data("start");
      const end = selected.data("end");
      if (start) $("#fyStart").val(start);
      if (end) $("#fyEnd").val(end);
    });
  }

  function initBasicSetupSelect2() {
    // Use an explicit dropdown parent because the setup screen is dynamically shown/hidden.
    // This avoids Select2 dropdowns rendering behind AdminLTE/layout elements.
    $("#fyCode").select2({ theme: "bootstrap4", width: "100%", dropdownParent: $("#setupScreen") });
    $("#chartTemplate").select2({ theme: "bootstrap4", width: "100%", dropdownParent: $("#setupScreen") });
  }

  function initChartTemplateList() {
    const $template = $("#chartTemplate");
    if (!$template.length || !window.ChartTemplates) return;
    $template.empty();
    window.ChartTemplates.list.forEach((tpl, index) => {
      const opt = new Option(tpl.name, tpl.id, index === 0, index === 0);
      $(opt).attr("data-description", tpl.description);
      $template.append(opt);
    });
    $template.on("change", function () {
      const tpl = window.ChartTemplates.getTemplate($(this).val());
      $("#chartTemplateHelp").text(tpl.description + ` (${tpl.groups.length} groups, ${tpl.ledgers.length} ledgers will be created.)`);
    });
    const first = window.ChartTemplates.getTemplate($template.val());
    if (first) $("#chartTemplateHelp").text(first.description + ` (${first.groups.length} groups, ${first.ledgers.length} ledgers will be created.)`);
  }

  function initFinancialYearList() {
    const currentYear = new Date().getFullYear();
    const $fy = $("#fyCode");
    $fy.empty();
    for (let y = currentYear - 3; y <= currentYear + 5; y++) {
      const code = `FY-${y}`;
      const start = `01-01-${y}`;
      const end = `31-12-${y}`;
      const opt = new Option(String(y), code, y === 2026, y === 2026);
      $(opt).attr("data-start", start).attr("data-end", end);
      $fy.append(opt);
    }
  }

  function initCountrySelect() {
    const $country = $("#country");
    const defaultOption = new Option("Oman (OM)", JSON.stringify({ code: "OM", name: "Oman", currency: { code: "OMR", name: "Omani rial" } }), true, true);
    $country.empty().append(defaultOption).trigger("change");

    $country.on("change", function () {
      const country = parseSelectedJson("#country");
      if (country && country.currency && country.currency.code) {
        const cur = country.currency;
        const option = new Option(cur.code + " - " + cur.name, JSON.stringify(cur), true, true);
        $("#currency").append(option).trigger("change");
      }
    });

    $country.select2({
      theme: "bootstrap4",
      width: "100%",
      dropdownParent: $("#setupScreen"),
      placeholder: "Search country",
      minimumInputLength: 0,
      ajax: {
        delay: 250,
        transport: function (params, success, failure) {
          const term = (params.data && params.data.term) ? params.data.term : "";
          fetchCountries(term)
            .then(countries => success({ results: countriesToSelect2(countries) }))
            .catch(failure);
          return { abort: function () {} };
        },
        processResults: function (data) {
          return data;
        }
      }
    });
  }

  function initCurrencySelect() {
    const $currency = $("#currency");
    const defaultOption = new Option("OMR - Omani rial", JSON.stringify({ code: "OMR", name: "Omani rial" }), true, true);
    $currency.empty().append(defaultOption).trigger("change");
    $currency.select2({
      theme: "bootstrap4",
      width: "100%",
      dropdownParent: $("#setupScreen"),
      placeholder: "Search currency",
      minimumInputLength: 0,
      ajax: {
        delay: 250,
        transport: function (params, success, failure) {
          const term = (params.data && params.data.term) ? params.data.term : "";
          fetchCurrencies(term)
            .then(currencies => success({ results: currenciesToSelect2(currencies) }))
            .catch(failure);
          return { abort: function () {} };
        },
        processResults: function (data) {
          return data;
        }
      }
    });
  }

  const countrySearchCache = new Map();

  function getCountryApiHeaders() {
    return {
      Authorization: "Bearer " + window.ERP_CONFIG.RESTCOUNTRIES_API_KEY
    };
  }

  function getCountryName(c) {
    if (!c) return "";
    if (typeof c.name === "string") return c.name;
    return (c.name && (c.name.common || c.name.official || c.name.nativeName)) || c.commonName || c.officialName || c.country || "";
  }

  function getCountryCode(c) {
    return c.cca2 || c.cca3 || c.iso2 || c.iso3 || c.alpha2Code || c.alpha3Code || c.code || "";
  }

  function normalizeCurrencies(rawCurrencies) {
    const result = {};

    if (!rawCurrencies) return result;

    // Old REST Countries format: { OMR: { name: "Omani rial", symbol: "ر.ع." } }
    if (!Array.isArray(rawCurrencies) && typeof rawCurrencies === "object") {
      Object.keys(rawCurrencies).forEach(code => {
        const cur = rawCurrencies[code] || {};
        result[code] = {
          code,
          name: cur.name || cur.currency || code,
          symbol: cur.symbol || ""
        };
      });
      return result;
    }

    // Newer/registered API formats may return arrays.
    if (Array.isArray(rawCurrencies)) {
      rawCurrencies.forEach(cur => {
        if (typeof cur === "string") {
          result[cur] = { code: cur, name: cur, symbol: "" };
          return;
        }
        const code = cur.code || cur.isoCode || cur.currencyCode || cur.id || cur.name;
        if (!code) return;
        result[code] = {
          code,
          name: cur.name || cur.currency || code,
          symbol: cur.symbol || ""
        };
      });
    }

    return result;
  }

  function normalizeCountry(c) {
    const currencies = normalizeCurrencies(c.currencies || c.currency || c.money || c.currencyInfo);
    const firstCode = Object.keys(currencies)[0];
    const code = getCountryCode(c);
    return {
      code,
      name: getCountryName(c) || code,
      currencies,
      currency: firstCode ? {
        code: firstCode,
        name: currencies[firstCode].name || firstCode,
        symbol: currencies[firstCode].symbol || ""
      } : null
    };
  }

  function countriesToSelect2(countries) {
    return countries.slice(0, 75).map(c => ({
      id: JSON.stringify({ code: c.code, name: c.name, currency: c.currency }),
      text: c.name + (c.code ? " (" + c.code + ")" : "")
    }));
  }

  function currenciesToSelect2(currencies) {
    return currencies.slice(0, 75).map(c => ({
      id: JSON.stringify(c),
      text: c.code + " - " + c.name
    }));
  }

  function commonCurrencies() {
    return [
      { code: "OMR", name: "Omani rial" },
      { code: "AED", name: "United Arab Emirates dirham" },
      { code: "USD", name: "United States dollar" },
      { code: "EUR", name: "Euro" },
      { code: "GBP", name: "Pound sterling" },
      { code: "INR", name: "Indian rupee" },
      { code: "SAR", name: "Saudi riyal" },
      { code: "QAR", name: "Qatari riyal" },
      { code: "KWD", name: "Kuwaiti dinar" },
      { code: "BHD", name: "Bahraini dinar" },
      { code: "CAD", name: "Canadian dollar" },
      { code: "AUD", name: "Australian dollar" },
      { code: "JPY", name: "Japanese yen" },
      { code: "CNY", name: "Chinese yuan" }
    ];
  }

  function commonCountries() {
    return [
      { code: "OM", name: "Oman", currency: { code: "OMR", name: "Omani rial" } },
      { code: "AE", name: "United Arab Emirates", currency: { code: "AED", name: "United Arab Emirates dirham" } },
      { code: "SA", name: "Saudi Arabia", currency: { code: "SAR", name: "Saudi riyal" } },
      { code: "QA", name: "Qatar", currency: { code: "QAR", name: "Qatari riyal" } },
      { code: "KW", name: "Kuwait", currency: { code: "KWD", name: "Kuwaiti dinar" } },
      { code: "BH", name: "Bahrain", currency: { code: "BHD", name: "Bahraini dinar" } },
      { code: "IN", name: "India", currency: { code: "INR", name: "Indian rupee" } },
      { code: "US", name: "United States", currency: { code: "USD", name: "United States dollar" } },
      { code: "GB", name: "United Kingdom", currency: { code: "GBP", name: "Pound sterling" } },
      { code: "CA", name: "Canada", currency: { code: "CAD", name: "Canadian dollar" } },
      { code: "AU", name: "Australia", currency: { code: "AUD", name: "Australian dollar" } },
      { code: "DE", name: "Germany", currency: { code: "EUR", name: "Euro" } },
      { code: "FR", name: "France", currency: { code: "EUR", name: "Euro" } },
      { code: "IT", name: "Italy", currency: { code: "EUR", name: "Euro" } },
      { code: "CN", name: "China", currency: { code: "CNY", name: "Chinese yuan" } },
      { code: "JP", name: "Japan", currency: { code: "JPY", name: "Japanese yen" } }
    ];
  }

  function fallbackCountries(term) {
    const search = String(term || "").trim().toLowerCase();
    return commonCountries().filter(c => !search || c.name.toLowerCase().includes(search) || c.code.toLowerCase().includes(search));
  }

  async function fetchCountries(term) {
    const search = String(term || "oman").trim();
    const cacheKey = search.toLowerCase();
    if (countrySearchCache.has(cacheKey)) return countrySearchCache.get(cacheKey);

    try {
      const url = window.ERP_CONFIG.RESTCOUNTRIES_API_BASE + "?q=" + encodeURIComponent(search);
      const res = await fetch(url, { headers: getCountryApiHeaders() });
      if (!res.ok) throw new Error("Country API failed: " + res.status);

      const json = await res.json();
      const rows = Array.isArray(json) ? json : (json.data || json.results || json.countries || []);
      const countries = rows.map(normalizeCountry).filter(c => c.name || c.code).sort((a, b) => a.name.localeCompare(b.name));
      if (countries.length) {
        countrySearchCache.set(cacheKey, countries);
        return countries;
      }
    } catch (e) {
      console.warn("REST Countries API unavailable, using local fallback countries:", e.message || e);
    }

    const fallback = fallbackCountries(search);
    countrySearchCache.set(cacheKey, fallback);
    return fallback;
  }

  async function fetchCurrencies(term) {
    const search = String(term || "").trim().toLowerCase();
    let currencies = commonCurrencies();

    // Also query the country API. Searching a country such as "canada" returns CAD;
    // searching "oman" returns OMR. Common currencies remain available for code searches.
    if (search.length >= 2) {
      try {
        const countries = await fetchCountries(search);
        const map = new Map(currencies.map(c => [c.code, c]));
        countries.forEach(country => {
          Object.keys(country.currencies || {}).forEach(code => {
            const cur = country.currencies[code] || {};
            if (!map.has(code)) map.set(code, { code, name: cur.name || code, symbol: cur.symbol || "" });
          });
        });
        currencies = Array.from(map.values());
      } catch (e) {
        // Keep common currency fallback.
      }
    }

    return currencies
      .filter(c => !search || c.code.toLowerCase().includes(search) || c.name.toLowerCase().includes(search))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  function parseSelectedJson(selector) {
    const raw = $(selector).val();
    try { return JSON.parse(raw); } catch (e) { return raw || null; }
  }

  function dateToIso(ddmmyyyy) {
    const parts = String(ddmmyyyy || "").split("-");
    if (parts.length !== 3) return ddmmyyyy;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  function renderState(state) {
    const user = window.GoogleAuth.getCurrentUser();
    const appUser = window.UserManager ? window.UserManager.getSession() : null;
    $("#userEmail").text(appUser ? (appUser.displayName || appUser.username) + " (" + appUser.role + ")" : (user && user.email ? user.email : "User"));
    $("#companyJson").text(JSON.stringify(state.company || {}, null, 2));
    $("#driveStateJson").text(JSON.stringify(state, null, 2));
    const manifest = state.manifest || {};
    $("#statLedgers").text(manifest.fileIds && manifest.fileIds.ledgers ? Object.keys(manifest.fileIds.ledgers).length : 0);
    $("#statEvents").text(manifest.eventCount || 0);
    $("#syncBadge").removeClass("badge-secondary badge-danger").addClass("badge-success").text("Synced");
  }


  function extractDriveFolderId(input) {
    const value = String(input || "").trim();
    if (!value) return "";
    let match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    match = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return value;
  }

  async function continueAfterDriveState(state) {
    renderState(state);
    if (window.UserManager && !window.UserManager.hasSession()) {
      try {
        const users = await window.UserManager.loadUsers();
        if (users.length > 0) {
          showScreen("erpLogin");
          return;
        }
        alert("No ERP user accounts found for this company. Opening app for migration. Please create a Super Admin user from Users & Roles.");
        showScreen("app");
        routeTo("#users");
        return;
      } catch (e) {
        showScreen("erpLogin");
        return;
      }
    }
    showScreen("app");
    routeTo(location.hash || "#dashboard");
  }

  async function startAfterLogin() {
    showLoading("Checking Google Drive for ERP data...");
    const state = await window.SyncEngine.openOrSetup();
    hideLoading();
    if (!state) {
      showScreen("sharedFolder");
      return;
    }
    await continueAfterDriveState(state);
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

  $("#btnCreateNewCompany").on("click", function () {
    showScreen("setup");
    setTimeout(initSetupPlugins, 0);
  });

  $("#sharedFolderForm").on("submit", async function (e) {
    e.preventDefault();
    try {
      const folderId = extractDriveFolderId($("#sharedFolderInput").val());
      if (!folderId) return alert("Please enter a shared folder link or ID.");
      showLoading("Opening shared company folder...");
      const folder = await window.GoogleDrive.getFileMetadata(folderId);
      if (!folder || folder.mimeType !== "application/vnd.google-apps.folder") {
        throw new Error("The provided ID is not a Google Drive folder.");
      }
      const state = await window.SyncEngine.loadExistingDriveStructure({ id: folder.id, name: folder.name, modifiedTime: folder.modifiedTime, sharedOpen: true });
      state.sharedFolder = { id: folder.id, name: folder.name, openedAt: new Date().toISOString(), mode: "shared" };
      state.driveAccessRole = "reader";
      await window.LocalDB.setKV("driveState", state);
      hideLoading();
      await continueAfterDriveState(state);
    } catch (err) {
      hideLoading();
      console.error(err);
      alert(err.message || "Unable to open shared company folder.");
    }
  });

  $("#setupForm").on("submit", async function (e) {
    e.preventDefault();
    const setup = {
      companyName: $("#companyName").val().trim(),
      address: $("#companyAddress").val().trim(),
      country: parseSelectedJson("#country"),
      currency: parseSelectedJson("#currency"),
      email: $("#companyEmail").val().trim(),
      contactNumber: $("#contactNumber").val().trim(),
      contactPerson: $("#contactPerson").val().trim(),
      logoFile: $("#companyLogo")[0].files && $("#companyLogo")[0].files[0] ? $("#companyLogo")[0].files[0] : null,
      taxName: $("#taxName").val().trim(),
      taxRate: Number($("#taxRate").val() || 0),
      financialYear: {
        code: $("#fyCode").val(),
        startDate: dateToIso($("#fyStart").val()),
        endDate: dateToIso($("#fyEnd").val())
      },
      chartTemplateId: $("#chartTemplate").val(),
      chartTemplate: window.ChartTemplates ? window.ChartTemplates.getTemplate($("#chartTemplate").val()) : null,
      superAdmin: {
        username: $("#superAdminUsername").val().trim(),
        email: $("#superAdminEmail").val().trim(),
        displayName: $("#superAdminName").val().trim(),
        password: $("#superAdminPassword").val()
      }
    };
    if ($("#superAdminPassword").val() !== $("#superAdminPasswordConfirm").val()) {
      alert("Super Admin passwords do not match.");
      return;
    }
    try {
      showLoading("Creating ERP folders and files in Google Drive...");
      const state = await window.SyncEngine.createInitialDriveStructure(setup);
      hideLoading();
      if (state.superAdminUser && window.UserManager) window.UserManager.saveSession(state.superAdminUser);
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
    if (window.UserManager) window.UserManager.clearSession();
    window.GoogleAuth.signOut();
    showScreen("login");
  });

  $("#btnBackGoogleLogin").on("click", function () {
    if (window.UserManager) window.UserManager.clearSession();
    window.GoogleAuth.signOut();
    showScreen("login");
  });

  $(document).on("geoerp:user-login", function () {
    const statePromise = window.LocalDB.getKV("driveState");
    statePromise.then(function (state) {
      renderState(state || {});
      showScreen("app");
      routeTo(location.hash || "#dashboard");
    });
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
      users: "Users & Roles",
      settings: "Settings"
    };
    $("#pageTitle").text(titles[route] || "Dashboard");
    if (route === "users" && window.UserManager) {
      if (!window.UserManager.can("users.view")) {
        alert("You are not allowed to view user accounts.");
        routeTo("#dashboard");
        return;
      }
      $("#btnAddUser").toggle(window.UserManager.can("users.manage"));
      window.UserManager.loadUsers().catch(function (err) { console.error(err); alert(err.message || "Unable to load users."); });
    }
    if (route === "ledgers" && window.LedgerManager) {
      window.LedgerManager.load().catch(function (err) {
        console.error(err);
        alert(err.message || "Unable to load ledgers.");
      });
    }
  }

  async function bootstrapApp() {
    if (!window.GoogleAuth.isConfigured()) {
      showScreen("login");
      return;
    }

    try {
      showLoading("Restoring Google session...");
      const session = await window.GoogleAuth.restoreSession();
      hideLoading();
      if (session) {
        await startAfterLogin();
      } else {
        showScreen("login");
      }
    } catch (err) {
      hideLoading();
      console.warn("Session restore failed:", err);
      showScreen("login");
    }
  }

  window.addEventListener("hashchange", () => routeTo(location.hash));
  bootstrapApp();
});
