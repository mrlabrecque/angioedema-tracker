# Installing on iPhone

Requires iOS 16.4 or later (Safari). The app is a Progressive Web App: no App Store, no account.

## Install
1. Open `https://<your-github-user>.github.io/<repo>/` in **Safari** (not an in-app browser).
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open the new icon. It runs full-screen without Safari's address bar.
4. Sign in with your passphrase. (Settings shows "Installed" when you are in the home-screen app.)

## What is stored on the phone
- Only the app's screens, icons and scripts (the "app shell"), so it opens quickly and shows a clear "can't reach the server" message when offline.
- **Never** your records, API responses or your sign-in. Health data is not cached, and the sign-in token lives only in memory, so closing or reloading the app locks it.
- Offline entry is intentionally not supported: an entry is only "saved" once the server confirms it, and the app says so.

## Updating
The app updates itself when it is online: the next launch loads the new version (a second launch if the first was served from the cache). To force it, close the app from the app switcher and reopen it.

## Exporting on iPhone
- **CSV:** Settings, then "Export spreadsheet (CSV)", then tap **Save**. Choose "Save to Files" in the share sheet.
- **PDF:** Settings, then "Open printable report", then **Print / Save as PDF**. On iPhone, tap Share, then Print, then pinch the preview open to get a PDF you can save or send.

## Manual iPhone checklist (not testable from a desktop)
Tick these on a real iPhone after each deploy that touches the app shell:
- [ ] Add to Home Screen shows the ring-and-dot icon and the name "Angioedema".
- [ ] Opens full-screen; status bar and bottom nav respect the notch / home indicator.
- [ ] Passphrase prompt appears on every cold launch; wrong passphrase shows an error.
- [ ] Log a flare-up; "Saved" appears only after the server answers.
- [ ] Airplane mode: the app opens and shows a connection message; nothing is claimed as saved.
- [ ] Settings, then Export CSV, then Save to Files works and the file opens in Numbers/Excel.
- [ ] Report, then Print / Save as PDF produces a readable multi-page PDF.
- [ ] Settings, then Lock now returns to the passphrase screen.

## Troubleshooting
- **"Add to Home Screen" missing:** you are not in Safari, or iOS is older than 16.4.
- **Old version after a deploy:** close the app from the app switcher and reopen; if still old, remove and re-add the icon.
- **Blank screen offline on first ever launch:** the shell is cached on the first online visit; open the app once while online.
