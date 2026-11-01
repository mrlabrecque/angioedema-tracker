import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

// Persistent (SQLite-backed) login throttling and token revocation.
// A single instance ("global") serves the whole app.
const IP_LIMIT = 5;
const IP_WINDOW_S = 15 * 60;
const IP_LOCKOUTS_S = [15 * 60, 60 * 60, 24 * 60 * 60]; // escalating by strike
const GLOBAL_LIMIT = 20;
const GLOBAL_WINDOW_S = 60 * 60;
const GLOBAL_LOCKOUT_S = 60 * 60;

export class AuthLimiter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS attempts (
        key TEXT PRIMARY KEY,
        fails INTEGER NOT NULL DEFAULT 0,
        window_start INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER NOT NULL DEFAULT 0,
        strikes INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS revoked (jti TEXT PRIMARY KEY, exp INTEGER NOT NULL);
    `);
  }

  private row(key: string) {
    const r = this.ctx.storage.sql
      .exec<{ fails: number; window_start: number; locked_until: number; strikes: number }>(
        "SELECT fails, window_start, locked_until, strikes FROM attempts WHERE key = ?",
        key,
      )
      .toArray()[0];
    return r ?? { fails: 0, window_start: 0, locked_until: 0, strikes: 0 };
  }

  private save(key: string, r: { fails: number; window_start: number; locked_until: number; strikes: number }) {
    this.ctx.storage.sql.exec(
      `INSERT INTO attempts (key, fails, window_start, locked_until, strikes) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET fails=excluded.fails, window_start=excluded.window_start,
       locked_until=excluded.locked_until, strikes=excluded.strikes`,
      key, r.fails, r.window_start, r.locked_until, r.strikes,
    );
  }

  /** Seconds the caller must wait, or 0 if login attempts are allowed. */
  checkLock(ip: string, nowMs = Date.now()): number {
    const now = Math.floor(nowMs / 1000);
    const wait = Math.max(
      this.row(`ip:${ip}`).locked_until - now,
      this.row("global").locked_until - now,
      0,
    );
    return wait;
  }

  /** Records a failed attempt; returns seconds of lockout now in force (0 if none). */
  recordFailure(ip: string, nowMs = Date.now()): number {
    const now = Math.floor(nowMs / 1000);
    const ipKey = `ip:${ip}`;

    const r = this.row(ipKey);
    if (now - r.window_start > IP_WINDOW_S) {
      r.fails = 0;
      r.window_start = now;
    }
    r.fails += 1;
    let lock = 0;
    if (r.fails >= IP_LIMIT) {
      lock = IP_LOCKOUTS_S[Math.min(r.strikes, IP_LOCKOUTS_S.length - 1)]!;
      r.strikes += 1;
      r.locked_until = now + lock;
      r.fails = 0;
    }
    this.save(ipKey, r);

    const g = this.row("global");
    if (now - g.window_start > GLOBAL_WINDOW_S) {
      g.fails = 0;
      g.window_start = now;
    }
    g.fails += 1;
    if (g.fails >= GLOBAL_LIMIT) {
      g.locked_until = now + GLOBAL_LOCKOUT_S;
      g.fails = 0;
      lock = Math.max(lock, GLOBAL_LOCKOUT_S);
    }
    this.save("global", g);
    return lock;
  }

  recordSuccess(ip: string): void {
    this.ctx.storage.sql.exec("DELETE FROM attempts WHERE key = ?", `ip:${ip}`);
  }

  revoke(jti: string, exp: number, nowMs = Date.now()): void {
    this.ctx.storage.sql.exec("DELETE FROM revoked WHERE exp < ?", Math.floor(nowMs / 1000));
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO revoked (jti, exp) VALUES (?, ?)", jti, exp);
  }

  isRevoked(jti: string): boolean {
    return this.ctx.storage.sql.exec("SELECT 1 FROM revoked WHERE jti = ?", jti).toArray().length > 0;
  }
}
