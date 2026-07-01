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

  function initSetupPlugins() {
    initFinancialYearList();

    if ($.fn.datepicker) {
      $(".datepicker").datepicker({
        format: "dd-mm-yyyy",
        autoclose: true,
        todayHighlight: true
      });
    }

    if ($.fn.select2) {
      $(".select2-basic").select2({ theme: "bootstrap4", width: "100%" });
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

  let countriesCache = null;

  function normalizeCountry(c) {
    const currencies = c.currencies || {};
    const firstCode = Object.keys(currencies)[0];
    return {
      code: c.cca2,
      name: c.name && c.name.common ? c.name.common : c.cca2,
      currencies,
      currency: firstCode ? { code: firstCode, name: currencies[firstCode].name || firstCode, symbol: currencies[firstCode].symbol || "" } : null
    };
  }

  function countriesToSelect2(countries) {
    return countries.slice(0, 75).map(c => ({
      id: JSON.stringify({ code: c.code, name: c.name, currency: c.currency }),
      text: c.name + " (" + c.code + ")"
    }));
  }

  function currenciesToSelect2(currencies) {
    return currencies.slice(0, 75).map(c => ({
      id: JSON.stringify(c),
      text: c.code + " - " + c.name
    }));
  }

  async function fetchAllCountries() {
    if (countriesCache) return countriesCache;
    const res = await fetch("https://restcountries.com/v3.1/all?fields=name,cca2,currencies");
    if (!res.ok) throw new Error("Country API failed.");
    const data = await res.json();
    countriesCache = data.map(normalizeCountry).sort((a, b) => a.name.localeCompare(b.name));
    return countriesCache;
  }

  async function fetchCountries(term) {
    const search = String(term || "").trim().toLowerCase();

    // For an actual AJAX search, call the API by name when the user types.
    // If the API returns 404 for partial names, fall back to the cached all-country list.
    if (search.length >= 2) {
      try {
        const res = await fetch("https://restcountries.com/v3.1/name/" + encodeURIComponent(search) + "?fields=name,cca2,currencies");
        if (res.ok) {
          const data = await res.json();
          return data.map(normalizeCountry).sort((a, b) => a.name.localeCompare(b.name));
        }
      } catch (e) {
        // Fallback below.
      }
    }

    const countries = await fetchAllCountries();
    return countries.filter(c => !search || c.name.toLowerCase().includes(search) || c.code.toLowerCase().includes(search));
  }

  async function fetchCurrencies(term) {
    const search = String(term || "").trim().toLowerCase();
    const countries = await fetchAllCountries();
    const map = new Map();
    countries.forEach(country => {
      Object.keys(country.currencies || {}).forEach(code => {
        const cur = country.currencies[code] || {};
        if (!map.has(code)) map.set(code, { code, name: cur.name || code, symbol: cur.symbol || "" });
      });
    });
    return Array.from(map.values())
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

  async function bootstrapApp() {
    initSetupPlugins();

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
