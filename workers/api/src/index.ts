import type { Env } from "./env";
import { corsHeaders, json } from "./http";
import { verifyPassphrase } from "./auth/passphrase";
import { signToken, verifyToken, type TokenPayload } from "./auth/token";
import { dbCheck } from "./db";

export { AuthLimiter } from "./auth/rate-limiter";

const MAX_LOGIN_BODY = 1024;

function limiter(env: Env) {
  return env.AUTH_LIMITER.get(env.AUTH_LIMITER.idFromName("global"));
}

async function authenticate(request: Request, env: Env): Promise<TokenPayload | null> {
  const header = request.headers.get("Authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(header);
  if (!m) return null;
  const payload = await verifyToken(env.TOKEN_SIGNING_SECRET, m[1]!);
  if (!payload) return null;
  if (await limiter(env).isRevoked(payload.jti)) return null;
  return payload;
}

async function login(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const stub = limiter(env);

  const wait = await stub.checkLock(ip);
  if (wait > 0) {
    return json(request, env, { error: "locked", retryAfterSeconds: wait }, 429, {
      "Retry-After": String(wait),
    });
  }

  const raw = await request.text();
  if (raw.length > MAX_LOGIN_BODY) return json(request, env, { error: "bad_request" }, 400);
  let passphrase: unknown;
  try {
    passphrase = (JSON.parse(raw) as { passphrase?: unknown }).passphrase;
  } catch {
    return json(request, env, { error: "bad_request" }, 400);
  }
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    return json(request, env, { error: "bad_request" }, 400);
  }

  const ok = await verifyPassphrase(passphrase, env.AUTH_PASSPHRASE_HASH);
  if (!ok) {
    const lock = await stub.recordFailure(ip);
    if (lock > 0) {
      return json(request, env, { error: "locked", retryAfterSeconds: lock }, 429, {
        "Retry-After": String(lock),
      });
    }
    return json(request, env, { error: "invalid_passphrase" }, 401);
  }

  await stub.recordSuccess(ip);
  const ttl = Number(env.TOKEN_TTL_SECONDS) || 43200;
  const { token, payload } = await signToken(env.TOKEN_SIGNING_SECRET, ttl);
  return json(request, env, { token, expiresAt: payload.exp * 1000 });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin");
    if (!origin || origin !== env.ALLOWED_ORIGIN) {
      return json(request, env, { error: "forbidden" }, 403);
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store", ...corsHeaders(request, env) },
    });
  }

  if (path === "/api/health" && request.method === "GET") {
    return json(request, env, { ok: true });
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    return login(request, env);
  }

  // Everything below requires a valid, unrevoked token.
  const isKnown = path === "/api/auth/logout" || path === "/api/system/db-check";
  if (!isKnown) return json(request, env, { error: "not_found" }, 404);

  const auth = await authenticate(request, env);
  if (!auth) return json(request, env, { error: "unauthorized" }, 401);

  if (path === "/api/auth/logout" && request.method === "POST") {
    await limiter(env).revoke(auth.jti, auth.exp);
    return json(request, env, { ok: true });
  }

  if (path === "/api/system/db-check" && request.method === "GET") {
    return json(request, env, await dbCheck(env));
  }

  return json(request, env, { error: "method_not_allowed" }, 405);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    let res: Response;
    try {
      res = await route(request, env);
    } catch {
      // Never include error details: they may contain connection strings or data.
      res = json(request, env, { error: "internal_error" }, 500);
    }
    // Operational log only: no bodies, headers, tokens, or query strings.
    console.log(`${request.method} ${new URL(request.url).pathname} ${res.status} ${Date.now() - started}ms`);
    return res;
  },
} satisfies ExportedHandler<Env>;
