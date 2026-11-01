// Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload_b64))
export interface TokenPayload {
  iat: number; // seconds
  exp: number; // seconds
  jti: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    usage,
  ]);
}

export async function signToken(secret: string, ttlSeconds: number, now = Date.now()): Promise<{
  token: string;
  payload: TokenPayload;
}> {
  const iat = Math.floor(now / 1000);
  const payload: TokenPayload = { iat, exp: iat + ttlSeconds, jti: crypto.randomUUID() };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(body));
  return { token: `${body}.${b64url(new Uint8Array(sig))}`, payload };
}

export async function verifyToken(
  secret: string,
  token: string,
  now = Date.now(),
): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      fromB64url(parts[1]!),
      enc.encode(parts[0]!),
    );
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(fromB64url(parts[0]!))) as TokenPayload;
    if (
      typeof payload.exp !== "number" ||
      typeof payload.jti !== "string" ||
      payload.exp * 1000 <= now
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
