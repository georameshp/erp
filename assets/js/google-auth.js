/* global window, google, fetch, localStorage */
(function () {
  const SESSION_KEY = "GeoERP_GoogleAuthSession";
  let tokenClient = null;
  let accessToken = null;
  let currentUser = null;

  function isConfigured() {
    return window.ERP_CONFIG.GOOGLE_CLIENT_ID && !window.ERP_CONFIG.GOOGLE_CLIENT_ID.includes("PASTE_");
  }

  function waitForGoogleIdentity() {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (window.google && google.accounts && google.accounts.oauth2) {
          clearInterval(timer);
          resolve();
        }
        if (tries > 100) {
          clearInterval(timer);
          reject(new Error("Google Identity Services failed to load."));
        }
      }, 100);
    });
  }

  async function init() {
    if (!isConfigured()) throw new Error("Google Client ID is not configured in assets/js/config.js");
    await waitForGoogleIdentity();
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: window.ERP_CONFIG.GOOGLE_CLIENT_ID,
        scope: window.ERP_CONFIG.SCOPES,
        callback: ""
      });
    }
  }

  function saveSession(token, user, expiresInSeconds) {
    const expiresAt = Date.now() + ((Number(expiresInSeconds) || 3600) * 1000);
    const session = { accessToken: token, user, expiresAt };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function loadSavedSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Keep a 60-second safety margin.
      if (!session.accessToken || !session.expiresAt || session.expiresAt < Date.now() + 60000) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  async function requestToken(promptValue) {
    if (!tokenClient) await init();
    return new Promise((resolve, reject) => {
      tokenClient.callback = async (response) => {
        if (response.error) return reject(response);
        try {
          accessToken = response.access_token;
          currentUser = await fetchUserInfo(accessToken);
          saveSession(accessToken, currentUser, response.expires_in);
          resolve({ accessToken, user: currentUser });
        } catch (err) {
          reject(err);
        }
      };
      tokenClient.requestAccessToken({ prompt: promptValue });
    });
  }

  async function signIn() {
    // Manual login should show consent/account selection if Google requires it.
    return await requestToken("consent");
  }

  async function silentSignIn() {
    // Works only if the user already has a valid Google session and consent.
    return await requestToken("");
  }

  async function restoreSession() {
    const saved = loadSavedSession();
    if (saved) {
      try {
        accessToken = saved.accessToken;
        currentUser = saved.user || await fetchUserInfo(accessToken);
        return { accessToken, user: currentUser, restoredFromStorage: true };
      } catch (e) {
        clearSessionOnly();
      }
    }

    // If the stored token is expired, try to obtain a fresh token silently.
    // If Google cannot do it silently, the caller should show the login button.
    try {
      return await silentSignIn();
    } catch (e) {
      return null;
    }
  }

  async function fetchUserInfo(token) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error("Unable to fetch Google user profile.");
    return await res.json();
  }

  function clearSessionOnly() {
    localStorage.removeItem(SESSION_KEY);
    accessToken = null;
    currentUser = null;
  }

  function signOut() {
    const tokenToRevoke = accessToken;
    clearSessionOnly();
    if (tokenToRevoke && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(tokenToRevoke);
    }
  }

  window.GoogleAuth = {
    init,
    signIn,
    silentSignIn,
    restoreSession,
    signOut,
    getAccessToken: () => accessToken,
    getCurrentUser: () => currentUser,
    isConfigured
  };
})();
