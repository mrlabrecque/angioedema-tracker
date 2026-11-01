# Angioedema Tracker

Private, single-user health log. Static Next.js frontend (GitHub Pages) → Cloudflare Worker API → Neon PostgreSQL (Drizzle).
Not a diagnostic or treatment tool.

**Status:** Phase 1 (foundation): passphrase access, protected API, Neon connectivity check. Episode logging is Phase 2.

```
apps/web          Next.js static export (GitHub Pages)
workers/api       Cloudflare Worker: auth, rate limiting (Durable Object), DB access
packages/database Drizzle schema + SQL migrations
scripts           hash-passphrase.mjs
docs              setup, security, migrations
```

## Commands
```bash
npm install
npm run typecheck
npm test                 # Worker tests (workerd, real Durable Object storage)
npm run dev:api          # Worker on :8787 (needs workers/api/.dev.vars)
npm run dev:web          # site on :3000 (set NEXT_PUBLIC_API_URL=http://localhost:8787 in apps/web/.env.local)
npm run db:generate      # after schema changes
npm run db:migrate       # needs packages/database/.env with DATABASE_URL (owner role)
npm run hash-passphrase  # prints AUTH_PASSPHRASE_HASH
```

See [docs/setup.md](docs/setup.md), [docs/security.md](docs/security.md), [docs/migrations.md](docs/migrations.md).
