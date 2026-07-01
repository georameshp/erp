# Geo ERP AdminLTE Prototype

Static ERP prototype hosted from GitHub Pages using:

- AdminLTE 3.2
- Bootstrap 4
- jQuery
- Google Identity Services
- Google Drive API
- IndexedDB local cache

## Current Build Status

Implemented skeleton:

1. Google login button
2. Google Drive folder detection
3. New setup page if no Drive ERP folder is found
4. Drive folder/file creation:
   - `ERP-App-Data/`
   - `company.json`
   - `app-manifest.json`
   - current financial year folder
   - ledger/inventory/transaction/events/snapshot folders
   - initial `ledger-summary.json` with selected chart of accounts groups
   - default ledger group files and ledger files from selected IFRS-style template
   - initial `inventory-summary.json`
   - setup activity event
   - optional company logo upload to Drive attachments folder
5. Setup form fields:
   - address
   - contact number
   - country using Select2 AJAX through registered REST Countries API
   - email
   - contact person
   - logo upload
   - currency using Select2 AJAX through registered REST Countries API
   - financial year from selectable year list
   - chart of accounts template selector
   - IFRS-style default ledger groups and ledgers
   - datepicker for financial year dates
6. AdminLTE dashboard shell
7. Local IndexedDB cache helper
8. Sync-now placeholder that reloads manifest/company data
9. Google session restore after page refresh using a locally stored expiring access token
10. Improved Select2 AJAX search for countries and currencies

## Required Google Setup

1. Go to Google Cloud Console.
2. Create/select a project.
3. Enable **Google Drive API**.
4. Configure OAuth consent screen.
5. Create OAuth Client ID:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:5500`
     - `http://127.0.0.1:5500`
     - `https://YOUR_GITHUB_USERNAME.github.io`
6. Copy your Web Client ID.
7. Edit:

```js
assets/js/config.js
```

Replace:

```js
GOOGLE_CLIENT_ID: "PASTE_YOUR_GOOGLE_WEB_CLIENT_ID_HERE"
```

with your real client ID.

## Local Run

Do not open `index.html` directly as `file://`.

Use a local web server, for example VS Code Live Server or:

```bash
cd erp-gdrive-adminlte
python3 -m http.server 5500
```

Then open:

```text
http://localhost:5500
```

## GitHub Pages Deployment

1. Push this folder contents to a GitHub repository.
2. Go to repository Settings > Pages.
3. Deploy from branch.
4. Add your GitHub Pages origin in Google OAuth authorized JavaScript origins.

Example origin:

```text
https://yourusername.github.io
```

## Next Implementation Steps

Recommended next order:

1. Add ledger group + ledger master creation.
2. Create permanent ledger codes.
3. Write ledger files to Drive.
4. Add event file for every create/edit/delete.
5. Add conflict detection using Drive file metadata + local revision.
6. Add transaction voucher creation.
7. Update ledger/inventory/summary derived files.
8. Build restore system using compensating events.

## Note About AdminLTE Assets

This prototype uses CDN links for AdminLTE, Bootstrap, jQuery and Font Awesome. This works in normal browsers and GitHub Pages. In restricted previews without network access, styling may appear simplified.
