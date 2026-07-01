/* global window, google, fetch */
(function () {
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
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: window.ERP_CONFIG.GOOGLE_CLIENT_ID,
      scope: window.ERP_CONFIG.SCOPES,
      callback: ""
    });
  }

  async function signIn() {
    if (!tokenClient) await init();
    return new Promise((resolve, reject) => {
      tokenClient.callback = async (response) => {
        if (response.error) return reject(response);
        accessToken = response.access_token;
        currentUser = await fetchUserInfo(accessToken);
        resolve({ accessToken, user: currentUser });
      };
      tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  async function fetchUserInfo(token) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error("Unable to fetch Google user profile.");
    return await res.json();
  }

  function signOut() {
    if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(accessToken);
    }
    accessToken = null;
    currentUser = null;
  }

  window.GoogleAuth = {
    init,
    signIn,
    signOut,
    getAccessToken: () => accessToken,
    getCurrentUser: () => currentUser,
    isConfigured
  };
})();
