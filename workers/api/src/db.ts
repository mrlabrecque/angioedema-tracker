import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { EXPECTED_TABLES } from "@angioedema/database";
import type { Env } from "./env";

export function getDb(env: Env) {
  return drizzle(neon(env.NEON_DATABASE_URL));
}

/** Connectivity/schema check. Returns counts and booleans only — never row data. */
export async function dbCheck(env: Env) {
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
