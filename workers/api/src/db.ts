import { neon, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "@angioedema/database";
import { EXPECTED_TABLES } from "@angioedema/database";
import type { Env } from "./env";

export function getDb(env: Env) {
  return drizzle(neon(env.NEON_DATABASE_URL));
}

export type Db = ReturnType<typeof drizzleWs<typeof schema>>;

// Neon connections occasionally die silently (the socket reports "Network connection lost" but the
// pending query never settles). Awaiting such a query hangs the request indefinitely, and the
// driver's own timeouts do not catch it. So every step here has a hard deadline enforced by a timer.
const CONNECT_TIMEOUT_MS = 6_000;
const CONNECT_ATTEMPTS = 3;
const OPERATION_TIMEOUT_MS = 25_000;

/** Raised when the database does not answer in time. Its message is safe to log (no data). */
export class DbTimeout extends Error {}

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DbTimeout(`${what} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function openPool(env: Env): Promise<Pool> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    const pool = new Pool({ connectionString: env.NEON_DATABASE_URL, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
    // A dropped connection emits "error" on the pool; with no listener it is an uncaught exception.
    // The in-flight query is handled by the deadlines below, and nothing sensitive may reach the logs.
    pool.on("error", () => {});
    const connecting = pool.connect();
    try {
      // Nothing has been sent to the database yet, so retrying here is safe, even for writes.
      (await withTimeout(connecting, CONNECT_TIMEOUT_MS + 1_000, "connect")).release();
      return pool;
    } catch (err) {
      lastError = err;
      connecting.then((c) => c.release()).catch(() => {}); // don't leak a connection that arrives late
      pool.end().catch(() => {});
    }
  }
  throw lastError;
}

/** WebSocket pool client (supports transactions). One short-lived pool per request, with a deadline. */
export async function withDb<T>(env: Env, ctx: ExecutionContext, fn: (db: Db) => Promise<T>): Promise<T> {
  const pool = await openPool(env);
  try {
    return await withTimeout(fn(drizzleWs(pool, { schema })), OPERATION_TIMEOUT_MS, "database operation");
  } finally {
    ctx.waitUntil(pool.end().catch(() => {}));
  }
}

/** Connectivity/schema check. Returns counts and booleans only — never row data. */
export function dbCheck(env: Env) {
  return withTimeout(dbCheckInner(env), 10_000, "database check");
}

async function dbCheckInner(env: Env) {
  const db = getDb(env);
  await db.execute(sql`select 1`);
  const names = EXPECTED_TABLES as readonly string[];
  const found = await db.execute(
    sql`select count(*)::int as n from information_schema.tables
        where table_schema = 'public'
        and table_name in (${sql.join(names.map((n) => sql`${n}`), sql`, `)})`,
  );
  const tables = Number((found.rows[0] as { n: number }).n);
  let migrations: number | null = null;
  try {
    const m = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    migrations = Number((m.rows[0] as { n: number }).n);
  } catch {
    migrations = null;
  }
  return {
    database: "ok" as const,
    tablesExpected: names.length,
    tablesFound: tables,
    migrationsApplied: migrations,
    schemaComplete: tables === names.length,
  };
}
