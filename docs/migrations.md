# Migrations

- Schema source: `packages/database/schema/index.ts`. Generate SQL with `npm run db:generate` and commit the result in `packages/database/migrations/`. Hand-written statements use `drizzle-kit generate --custom` (see `0001_*`).
- Apply with `npm run db:migrate` (owner role). Policy: **forward-only**; never edit an applied migration.
- Historical records are never hard-deleted by the app: episodes use `deleted_at`, child FKs are `ON DELETE RESTRICT`.

## Recovery
- Preferred: Neon point-in-time restore / branch from a past timestamp. (This account's plan retains 6 hours of history, so take a Neon branch/snapshot before risky migrations.)
- Full teardown of the initial schema (destroys data): `packages/database/migrations/rollback_0000_0001.sql.txt`.
