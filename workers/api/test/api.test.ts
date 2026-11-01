import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { signToken, verifyToken } from "../src/auth/token";
import type { Env } from "../src/env";
import { pickUnit } from "../src/analytics";
import { safeTimeZone } from "../src/dashboard";
import { createEpisodeInput, exposureInput, treatmentInput, updateEpisodeInput } from "../src/validation";

const PASSPHRASE = "correct horse battery staple";
const ORIGIN = "https://mrlabrecque.github.io";
const SECRET = "test-signing-secret-test-signing-secret";

async function makeHash(pass: string, iterations = 1000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  return `pbkdf2-sha256:${iterations}:${b64(salt)}:${b64(new Uint8Array(bits))}`;
}

let testEnv: Env;
async function getEnv(): Promise<Env> {
  testEnv ??= {
    ...(env as unknown as Env),
    AUTH_PASSPHRASE_HASH: await makeHash(PASSPHRASE),
    TOKEN_SIGNING_SECRET: SECRET,
    ALLOWED_ORIGIN: ORIGIN,
    TOKEN_TTL_SECONDS: "43200",
    NEON_DATABASE_URL: "postgresql://invalid:invalid@invalid.invalid/db",
  };
  return testEnv;
}

async function call(path: string, init: RequestInit & { ip?: string; origin?: string } = {}) {
  const { ip = "1.1.1.1", origin = ORIGIN, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("CF-Connecting-IP", ip);
  if (origin) headers.set("Origin", origin);
  const req = new Request(`https://api.test${path}`, { ...rest, headers });
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  return worker.fetch(req, await getEnv(), ctx);
}

const login = (passphrase: string, ip?: string) =>
  call("/api/auth/login", { method: "POST", body: JSON.stringify({ passphrase }), ip });

describe("authentication", () => {
  it("issues a token for the correct passphrase", async () => {
    const res = await login(PASSPHRASE, "10.0.0.1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: number };
    expect(body.token).toContain(".");
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("rejects an incorrect passphrase with a generic 401", async () => {
    const res = await login("wrong passphrase", "10.0.0.2");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_passphrase" });
  });

  it("rejects malformed and oversized bodies", async () => {
    const bad = await call("/api/auth/login", { method: "POST", body: "nope", ip: "10.0.0.3" });
    expect(bad.status).toBe(400);
    const big = await call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ passphrase: "x".repeat(5000) }),
      ip: "10.0.0.3",
    });
    expect(big.status).toBe(400);
  });

  it("locks out an IP after 5 failures, even for the correct passphrase", async () => {
    const ip = "10.0.0.4";
    for (let i = 0; i < 4; i++) expect((await login("bad", ip)).status).toBe(401);
    const fifth = await login("bad", ip);
    expect(fifth.status).toBe(429);
    expect(Number(fifth.headers.get("Retry-After"))).toBeGreaterThan(0);
    const correct = await login(PASSPHRASE, ip);
    expect(correct.status).toBe(429);
    // A different IP is unaffected.
    expect((await login(PASSPHRASE, "10.0.0.5")).status).toBe(200);
  });
});

describe("tokens", () => {
  it("rejects tampered and expired tokens", async () => {
    const { token } = await signToken(SECRET, 60);
    expect(await verifyToken(SECRET, token)).not.toBeNull();
    const [body, sig] = token.split(".");
    expect(await verifyToken(SECRET, `${body}x.${sig}`)).toBeNull();
    expect(await verifyToken(SECRET, `${body}.${sig!.slice(0, -2)}AA`)).toBeNull();
    expect(await verifyToken("other-secret", token)).toBeNull();
    expect(await verifyToken(SECRET, token, Date.now() + 61_000)).toBeNull();
  });
});

describe("protected routes", () => {
  it("returns 401 without a token or with a bad token", async () => {
    expect((await call("/api/system/db-check")).status).toBe(401);
    const bad = await call("/api/system/db-check", { headers: { Authorization: "Bearer abc.def" } });
    expect(bad.status).toBe(401);
  });

  it("returns 401 after the token is revoked via logout", async () => {
    const { token } = (await (await login(PASSPHRASE, "10.0.1.1")).json()) as { token: string };
    const auth = { Authorization: `Bearer ${token}` };
    // Valid token passes auth; DB is unreachable in tests so we get a generic 500.
    const ok = await call("/api/system/db-check", { headers: auth });
    expect(ok.status).toBe(500);
    expect(await ok.json()).toEqual({ error: "internal_error" });

    expect((await call("/api/auth/logout", { method: "POST", headers: auth })).status).toBe(200);
    expect((await call("/api/system/db-check", { headers: auth })).status).toBe(401);
  });

  it("returns 404 for unknown routes", async () => {
    expect((await call("/api/nope")).status).toBe(404);
  });

  it("requires a token on every episode route", async () => {
    const id = "6f1c1d2e-8a3b-4c5d-9e0f-123456789abc";
    const routes: [string, string][] = [
      ["GET", "/api/episodes"],
      ["POST", "/api/episodes"],
      ["GET", `/api/episodes/${id}`],
      ["PUT", `/api/episodes/${id}`],
      ["DELETE", `/api/episodes/${id}`],
      ["POST", `/api/episodes/${id}/symptoms`],
      ["POST", `/api/episodes/${id}/exposures`],
      ["POST", `/api/episodes/${id}/treatments`],
      ["PUT", `/api/episodes/${id}/symptoms/${id}`],
      ["DELETE", `/api/episodes/${id}/symptoms/${id}`],
      ["PUT", `/api/episodes/${id}/exposures/${id}`],
      ["DELETE", `/api/episodes/${id}/exposures/${id}`],
      ["GET", "/api/dashboard/summary"],
      ["GET", "/api/dashboard/trends"],
      ["GET", "/api/analytics"],
      ["GET", "/api/symptoms"],
      ["GET", "/api/exposures"],
    ];
    for (const [method, path] of routes) {
      const res = await call(path, { method, body: method === "GET" || method === "DELETE" ? undefined : "{}" });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe("CORS and headers", () => {
  it("echoes only the exact allowed origin", async () => {
    const ok = await call("/api/health", { origin: ORIGIN });
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    for (const origin of ["https://evil.example", `${ORIGIN}.evil.example`, "http://mrlabrecque.github.io"]) {
      const res = await call("/api/health", { origin });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("answers preflight for the allowed origin and refuses others", async () => {
    const ok = await call("/api/auth/login", { method: "OPTIONS", origin: ORIGIN });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    const bad = await call("/api/auth/login", { method: "OPTIONS", origin: "https://evil.example" });
    expect(bad.status).toBe(403);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("marks every response no-store", async () => {
    for (const res of [
      await call("/api/health"),
      await login("bad", "10.0.2.1"),
      await call("/api/system/db-check"),
      await call("/nope"),
    ]) {
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});

// Runs last: the global lockout persists in the shared Durable Object.
describe("global backstop", () => {
  it("applies a global lockout across many IPs", async () => {
    let locked = false;
    for (let i = 0; i < 25 && !locked; i++) {
      const res = await login("bad", `10.1.0.${i}`);
      locked = res.status === 429;
    }
    expect(locked).toBe(true);
    expect((await login(PASSPHRASE, "10.9.9.9")).status).toBe(429);
  });
});

describe("input validation", () => {
  const base = { clientRequestId: "6f1c1d2e-8a3b-4c5d-9e0f-123456789abc", onsetAt: "2026-11-01T10:00:00Z" };

  it("accepts a minimal (incomplete) episode", () => {
    const r = createEpisodeInput.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.symptoms).toEqual([]);
  });

  it("rejects bad ids, dates, severities and unknown fields", () => {
    expect(createEpisodeInput.safeParse({ ...base, clientRequestId: "nope" }).success).toBe(false);
    expect(createEpisodeInput.safeParse({ ...base, onsetAt: "yesterday" }).success).toBe(false);
    expect(createEpisodeInput.safeParse({ ...base, overallSeverity: 11 }).success).toBe(false);
    expect(createEpisodeInput.safeParse({ ...base, overallSeverity: 0 }).success).toBe(false);
    expect(createEpisodeInput.safeParse({ ...base, status: "cured" }).success).toBe(false);
    expect(createEpisodeInput.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(
      createEpisodeInput.safeParse({ ...base, symptoms: [{ symptomType: "Hives", severity: 99 }] }).success,
    ).toBe(false);
  });

  it("defaults an exposure to 'unknown' and never accepts auto-confirmation values", () => {
    const e = exposureInput.parse({ exposureCategory: "Food" });
    expect(e.suspectedRelationship).toBe("unknown");
    expect(exposureInput.safeParse({ exposureCategory: "Food", suspectedRelationship: "confirmed" }).success).toBe(false);
  });

  it("requires medication name and administration time for treatments", () => {
    expect(treatmentInput.safeParse({ medicationName: "X" }).success).toBe(false);
    expect(treatmentInput.safeParse({ medicationName: "X", administrationTime: "2026-11-01T10:00:00Z" }).success).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(updateEpisodeInput.safeParse({}).success).toBe(false);
    expect(updateEpisodeInput.safeParse({ resolutionAt: null }).success).toBe(true);
  });
});

describe("dashboard helpers", () => {
  it("accepts real time zones and falls back to UTC for anything else", () => {
    expect(safeTimeZone("America/New_York")).toBe("America/New_York");
    expect(safeTimeZone("Pacific/Auckland")).toBe("Pacific/Auckland");
    expect(safeTimeZone(null)).toBe("UTC");
    expect(safeTimeZone("Not/AZone")).toBe("UTC");
    expect(safeTimeZone("'; drop table flare_episodes; --")).toBe("UTC");
  });
});

describe("analytics bucketing", () => {
  const at = (days: number) => [new Date("2026-01-01T00:00:00Z"), new Date(Date.parse("2026-01-01T00:00:00Z") + days * 86_400_000)] as const;
  it("keeps charts to a readable number of bars", () => {
    expect(pickUnit(...at(30))).toBe("week");
    expect(pickUnit(...at(120))).toBe("week");
    expect(pickUnit(...at(180))).toBe("month");
    expect(pickUnit(...at(1000))).toBe("month");
    expect(pickUnit(...at(3000))).toBe("year");
  });
});
