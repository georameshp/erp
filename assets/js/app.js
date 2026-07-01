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
    const defaultOption = new Option("Oman", JSON.stringify({ code: "OM", name: "Oman", currency: { code: "OMR", name: "Omani rial" } }), true, true);
    $country.append(defaultOption).trigger("change");
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
      placeholder: "Search country",
      ajax: {
        delay: 250,
        transport: function (params, success, failure) {
          fetchCountries().then(success).catch(failure);
          return { abort: function () {} };
        },
        processResults: function (countries, params) {
          const term = ((params.term || "")).toLowerCase();
          return {
            results: countries
              .filter(c => !term || c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term))
              .slice(0, 50)
              .map(c => ({ id: JSON.stringify({ code: c.code, name: c.name, currency: c.currency }), text: c.name + " (" + c.code + ")" }))
          };
        }
      }
    });
  }

  function initCurrencySelect() {
    const $currency = $("#currency");
    const defaultOption = new Option("OMR - Omani rial", JSON.stringify({ code: "OMR", name: "Omani rial" }), true, true);
    $currency.append(defaultOption).trigger("change");
    $currency.select2({
      theme: "bootstrap4",
      width: "100%",
      placeholder: "Search currency",
      ajax: {
        delay: 250,
        transport: function (params, success, failure) {
          fetchCurrencies().then(success).catch(failure);
          return { abort: function () {} };
        },
        processResults: function (currencies, params) {
          const term = ((params.term || "")).toLowerCase();
          return {
            results: currencies
              .filter(c => !term || c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term))
              .slice(0, 50)
              .map(c => ({ id: JSON.stringify(c), text: c.code + " - " + c.name }))
          };
        }
      }
    });
  }

  let countriesCache = null;
  async function fetchCountries() {
    if (countriesCache) return countriesCache;
    const res = await fetch("https://restcountries.com/v3.1/all?fields=name,cca2,currencies");
    if (!res.ok) throw new Error("Country API failed.");
    const data = await res.json();
    countriesCache = data.map(c => {
      const currencies = c.currencies || {};
      const firstCode = Object.keys(currencies)[0];
      return {
        code: c.cca2,
        name: c.name && c.name.common ? c.name.common : c.cca2,
        currencies,
        currency: firstCode ? { code: firstCode, name: currencies[firstCode].name || firstCode, symbol: currencies[firstCode].symbol || "" } : null
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return countriesCache;
  }

  async function fetchCurrencies() {
    const countries = await fetchCountries();
    const map = new Map();
    countries.forEach(country => {
      Object.keys(country.currencies || {}).forEach(code => {
        const cur = country.currencies[code] || {};
        if (!map.has(code)) map.set(code, { code, name: cur.name || code, symbol: cur.symbol || "" });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
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

  window.addEventListener("hashchange", () => routeTo(location.hash));
  initSetupPlugins();
  showScreen("login");
});
