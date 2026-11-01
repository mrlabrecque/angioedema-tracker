# Setup

## 1. Neon
1. Create a project and a database named `angioedema` at https://console.neon.tech.
2. Create a restricted role for the Worker (run as the owner, e.g. in the Neon SQL editor):
   ```sql
   CREATE ROLE app_worker LOGIN PASSWORD '<long random>' NOSUPERUSER NOCREATEDB NOCREATEROLE;
   GRANT CONNECT ON DATABASE angioedema TO app_worker;
   GRANT USAGE ON SCHEMA public TO app_worker;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_worker;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_worker;
   GRANT USAGE ON SCHEMA drizzle TO app_worker;
   GRANT SELECT ON drizzle.__drizzle_migrations TO app_worker;
   REVOKE CREATE ON SCHEMA public FROM app_worker;
   ```
   (Run after step 3 so the tables exist.)
3. Run migrations with the **owner** connection string (pooled is fine):
   ```bash
   echo 'DATABASE_URL="postgresql://…"' > packages/database/.env   # gitignored; quote the value
   npm run db:migrate
   ```

## 2. Cloudflare Worker
```bash
cd workers/api
npx wrangler login
npx wrangler secret put NEON_DATABASE_URL      # app_worker connection string
npm run hash-passphrase                         # from repo root; copy the output
npx wrangler secret put AUTH_PASSPHRASE_HASH
openssl rand -base64 32 | npx wrangler secret put TOKEN_SIGNING_SECRET
```
Set `ALLOWED_ORIGIN` in `workers/api/wrangler.toml` to `https://<github-user>.github.io` (scheme + host only).
Deploy: `npx wrangler deploy` (or push to `main`; see `worker.yml`). Note the `*.workers.dev` URL.

## 3. GitHub Pages
1. Repo **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions**:
   - Variable `API_URL` = the Worker URL (public, no trailing slash).
   - Secrets `CLOUDFLARE_API_TOKEN` (Workers edit permission) and `CLOUDFLARE_ACCOUNT_ID`. No database credentials belong in GitHub.
3. Push to `main`. Site: `https://<user>.github.io/<repo>/`.

## 4. Local development
`workers/api/.dev.vars` (copy from `.dev.vars.example`, `ALLOWED_ORIGIN=http://localhost:3000`) and `apps/web/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:8787`).

## 5. iPhone install
Planned for Phase 5 (manifest + service worker).
