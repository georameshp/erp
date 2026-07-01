/* global window */
window.ERP_CONFIG = {
  // TODO: Replace with your Google OAuth 2.0 Web Client ID.
  // Google Cloud Console > APIs & Services > Credentials > OAuth client ID > Web application.
  GOOGLE_CLIENT_ID: "395438751245-dbpqd2col2fdeo04017n2qardhj4kk1c.apps.googleusercontent.com",

  APP_ID: "drive-erp-adminlte",
  APP_FOLDER_NAME: "ERP-App-Data",
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
