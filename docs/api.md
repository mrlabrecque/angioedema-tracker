# API (Phases 2-4)

All routes except `/api/health` and `/api/auth/login` need `Authorization: Bearer <token>`. Responses are `no-store`.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/logout` | |
| GET | `/api/symptoms`, `/api/exposures` | catalog choices |
| GET | `/api/episodes` | newest first, with a symptom summary. Query: `limit` (<=200), `offset`, `status`, `from`/`to` (ISO datetimes on onset), `q` (case-insensitive text search across notes, symptoms, exposures, medications; `%`/`_` are literal). Returns `{items, hasMore}` |
| GET | `/api/dashboard/summary` | total, active, last 30 days, average duration, most recent; computed from stored episodes |
| GET | `/api/dashboard/trends?months=&tz=` | episodes per month (in the viewer's IANA time zone; invalid zones fall back to UTC), symptom frequency, exposure *report* counts (observed alongside episodes, not causes) |
| POST | `/api/episodes` | one transaction for the episode + symptoms/exposures/treatments. `clientRequestId` (UUID) is required: re-sending it returns the original episode (200) instead of creating a second one |
| GET | `/api/episodes/:id` | full detail |
| PUT | `/api/episodes/:id` | partial update. `status: "resolved"` stamps `resolutionAt` if missing; `status: "active"` clears it; resolution before onset is rejected |
| DELETE | `/api/episodes/:id` | soft delete (row kept, hidden) |
| GET | `/api/analytics?from=&to=&tz=` | descriptive statistics for a date range (omit `from` for all time): totals and duration/severity stats, frequency per week/month/year (bucket size chosen from the range), severity distribution, symptom and swelling-location counts, reported-exposure counts, and time between episodes. Ranges over 20 years or with `from` after `to` return 400 |
| POST | `/api/episodes/:id/symptoms`, `/exposures`, `/treatments` | add to an existing episode; returns the full detail |

| PUT / DELETE | `/api/episodes/:id/symptoms/:childId`, `/exposures/:childId` | edit (full set of fields, same validation as adding) or remove one symptom/exposure. The item must belong to that episode; the episode itself is never changed |

Custom triggers: an `exposureCategory` that isn't in the list is saved as a new category automatically (matched case-insensitively, so "grass cutting" reuses "Grass cutting"), and then appears in `GET /api/exposures` for next time. Names are limited to 80 characters.

Exposures default to `suspectedRelationship: "unknown"`; nothing is ever set to `confirmed_by_clinician` automatically.

## End-to-end test
`scripts/e2e-api.mjs` creates real rows, so run it only against a disposable database (e.g. a Neon branch):
```bash
API_URL=http://localhost:8787 PASSPHRASE=... node scripts/e2e-api.mjs
```

## Analytics are descriptive, not causal
Exposure figures count what was *reported alongside* episodes. Only flare-ups are logged, so there is no baseline of how often the same exposures occur without a flare; the app never labels an exposure as a cause. `confirmed_by_clinician` appears only when you set it yourself.
