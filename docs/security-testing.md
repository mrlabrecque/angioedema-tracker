# Security and privacy testing (Phase 5)

What was tested, how to repeat it, and what has **not** been verified.

## Automated (run on every change: `npm test`)
| Area | Test |
|---|---|
| Passphrase | correct → token; wrong → generic 401; malformed/oversized body → 400 |
| Rate limiting | 5 failures per IP → lockout (even for the right passphrase); global backstop; other IPs unaffected |
| Tokens | tampered, wrong-secret and expired tokens rejected; logout revokes the token |
| Authorization | every API route (episodes, children, dashboard, analytics, exports) returns 401 without a token |
| CORS | only the exact allowed origin is echoed; other origins get 403 on preflight |
| Caching headers | every response is `Cache-Control: no-store` |
| Service worker (`apps/web/test/sw.test.mjs`) | never intercepts the API or any request with an Authorization header; page URLs are cached without query strings (no episode ids); data payloads are not cached; offline falls back to the cached shell or fails cleanly; old caches are removed |
| CSV | quoting, BOM/CRLF, formula-injection neutralised, time-zone/DST conversion |
| Database deadlines | a database that never answers fails in the configured time instead of hanging |

## Database end-to-end (`scripts/e2e-api.mjs`, 163 checks)
Creates real rows, so run it only against a **disposable Neon branch**:
```bash
API_URL=http://localhost:8787 PASSPHRASE=... node scripts/e2e-api.mjs
```
Covers episode lifecycle, duplicate-submission protection (including 5 simultaneous identical submissions), search/filters/paging, dashboard and analytics numbers checked against hand-computed fixtures, custom triggers, editing/removing symptoms and exposures (including cross-episode protection), and CSV/report exports.

## Log privacy (`scripts/audit-logs.mjs`)
Sends distinctive canary values (fake passphrase, notes, locations, exposures, medication, search text) through every kind of request, then confirms none of them, nor the real passphrase, access token, `Bearer`, or database credentials/host, appear in the Worker's log. Result: all clear. Logs contain only `METHOD /path status duration`.

## Browser storage
After signing in, browsing history, preparing a CSV and opening a 99-episode report from the production build: no localStorage, sessionStorage, cookies, IndexedDB or Cache Storage entries.

## Not verified here (needs a real iPhone)
- Add to Home Screen, standalone display, icon rendering, safe-area layout.
- Service-worker registration in iOS Safari. (The desktop test pane refuses service workers, so the worker's logic was tested in a simulated environment instead.)
- Share sheet / "Save to Files" for CSV and Print → PDF for the report.
- How the printed report looks on paper.
See the checklist in [ios-install.md](ios-install.md).

## Known limits
- Passphrase hashing is PBKDF2-SHA256 at 100,000 iterations (the Workers maximum); use a long passphrase.
- A determined attacker can trigger the global lockout and temporarily lock the owner out.
- The access token is memory-only: reloading or closing the app locks it.
