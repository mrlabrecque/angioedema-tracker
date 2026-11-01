# API (Phase 2)

All routes except `/api/health` and `/api/auth/login` need `Authorization: Bearer <token>`. Responses are `no-store`.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/logout` | |
| GET | `/api/symptoms`, `/api/exposures` | catalog choices |
| GET | `/api/episodes?limit=&status=` | newest first; includes a symptom summary |
| POST | `/api/episodes` | one transaction for the episode + symptoms/exposures/treatments. `clientRequestId` (UUID) is required: re-sending it returns the original episode (200) instead of creating a second one |
| GET | `/api/episodes/:id` | full detail |
| PUT | `/api/episodes/:id` | partial update. `status: "resolved"` stamps `resolutionAt` if missing; `status: "active"` clears it; resolution before onset is rejected |
| DELETE | `/api/episodes/:id` | soft delete (row kept, hidden) |
| POST | `/api/episodes/:id/symptoms`, `/exposures`, `/treatments` | add to an existing episode; returns the full detail |

Exposures default to `suspectedRelationship: "unknown"`; nothing is ever set to `confirmed_by_clinician` automatically.

## End-to-end test
`scripts/e2e-api.mjs` creates real rows, so run it only against a disposable database (e.g. a Neon branch):
```bash
API_URL=http://localhost:8787 PASSPHRASE=... node scripts/e2e-api.mjs
```
