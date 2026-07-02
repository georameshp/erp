/* global window */
window.ERP_CONFIG = {
  // TODO: Replace with your Google OAuth 2.0 Web Client ID.
  // Google Cloud Console > APIs & Services > Credentials > OAuth client ID > Web application.
  GOOGLE_CLIENT_ID: "395438751245-dbpqd2col2fdeo04017n2qardhj4kk1c.apps.googleusercontent.com",

  APP_ID: "drive-erp-adminlte",
  APP_FOLDER_NAME: "ERP-App-Data",

  // REST Countries registered API. This is used by the setup page Select2 fields.
  // Note: because this is a GitHub Pages/browser-only app, this key is visible in browser source.
  RESTCOUNTRIES_API_BASE: "https://api.restcountries.com/countries/v5",
  RESTCOUNTRIES_API_KEY: "rc_live_31966f39f6614710913ab07636480955",

  // sql.js is used for the primary fast local/Drive SQLite database.
  // JSON files remain the audit/source fallback.
  SQLJS_WASM_URL: "https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.wasm",
  SCOPES: [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file"
  ].join(" "),

  DEFAULT_FOLDERS: [
    "events",
    "activity-log",
    "snapshots",
    "exports",
    "attachments"
  ]
};
