export interface Env {
  NEON_DATABASE_URL: string;
  AUTH_PASSPHRASE_HASH: string;
  TOKEN_SIGNING_SECRET: string;
  ALLOWED_ORIGIN: string;
  TOKEN_TTL_SECONDS: string;
  AUTH_LIMITER: DurableObjectNamespace<import("./auth/rate-limiter").AuthLimiter>;
}
