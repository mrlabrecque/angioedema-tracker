import type { Env } from "./env";

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (origin && origin === env.ALLOWED_ORIGIN) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Max-Age": "600",
      "Access-Control-Expose-Headers": "Retry-After",
      Vary: "Origin",
    };
  }
  return { Vary: "Origin" };
}

export function json(
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...SECURITY_HEADERS,
      ...corsHeaders(request, env),
      ...extra,
    },
  });
}

export function text(request: Request, env: Env, body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType, ...SECURITY_HEADERS, ...corsHeaders(request, env) },
  });
}
