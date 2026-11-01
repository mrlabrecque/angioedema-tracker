// Hash format: pbkdf2-sha256:<iterations>:<salt b64>:<hash b64>
// Workers WebCrypto caps PBKDF2 at 100,000 iterations.
/** Misconfiguration of a secret. The message never contains the secret's value. */
export class ConfigError extends Error {}

const enc = new TextEncoder();

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassphrase(passphrase: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256") {
    throw new ConfigError("AUTH_PASSPHRASE_HASH is malformed");
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) {
    throw new ConfigError("AUTH_PASSPHRASE_HASH has unsupported iterations");
  }
  const salt = fromB64(parts[2]!);
  const expected = fromB64(parts[3]!);
  const key = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    expected.length * 8,
  );
  return timingSafeEqual(new Uint8Array(bits), expected);
}
