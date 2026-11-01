# Security design

- **Passphrase:** only a PBKDF2-SHA256 hash (`pbkdf2-sha256:<iter>:<salt>:<hash>`, 100,000 iterations: the Workers WebCrypto maximum) is stored, as the `AUTH_PASSPHRASE_HASH` Worker secret. Use a long passphrase (5+ random words) to compensate for the iteration cap.
- **Token:** HMAC-SHA256 signed `{iat, exp, jti}`, 12 h TTL, held in React memory only (no localStorage/cookies). Reloading the app requires the passphrase again.
- **Rate limiting:** `AuthLimiter` Durable Object (SQLite-backed, persistent). Per IP: 5 failures / 15 min → lockout of 15 min, then 1 h, then 24 h. Global backstop: 20 failures / h → 1 h lockout for everyone. Trade-off: a determined attacker can trigger the global lockout and lock the owner out temporarily; accepted for a single-user app.
- **Revocation:** logout stores the token `jti` in the Durable Object until expiry.
- **CORS:** exact match on `ALLOWED_ORIGIN`; other origins get no CORS headers (preflight → 403).
- **Responses:** `Cache-Control: no-store`, `nosniff`, `no-referrer` on every response. Errors are generic. Logs contain method, path, status, duration only.
- **Database:** the Worker uses the least-privileged `app_worker` role (no DDL). Migrations use the owner role from a developer machine only.
- **Frontend:** no credentials in the bundle (CI scans `out/`); meta CSP limits connections to self + API origin.

## Change the passphrase
```bash
npm run -s set-passphrase                            # prompts, hashes, stores the secret
cd workers/api
openssl rand -base64 32 | npx wrangler secret put TOKEN_SIGNING_SECRET   # invalidates all sessions
```

## Invalidate all sessions
Rotate `TOKEN_SIGNING_SECRET` (as above). Every outstanding token fails verification immediately.

## Clear a lockout
Lockouts expire on their own. To clear immediately: `npx wrangler deploy` does not reset state; delete the Durable Object by deploying a migration (`deleted_classes` then re-add) or wait for expiry.
