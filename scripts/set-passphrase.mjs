#!/usr/bin/env node
// Prompts for the passphrase, hashes it, and stores it as the Worker's
// AUTH_PASSPHRASE_HASH secret in one step (nothing to copy or paste).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const hashed = spawnSync(process.execPath, ["scripts/hash-passphrase.mjs"], {
  cwd: root,
  stdio: ["inherit", "pipe", "inherit"],
  encoding: "utf8",
});
if (hashed.status !== 0) process.exit(hashed.status ?? 1);

const hash = hashed.stdout.trim();
if (!/^pbkdf2-sha256:\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(hash)) {
  console.error("Hash output was not in the expected format; nothing was stored.");
  process.exit(1);
}

const put = spawnSync("npx", ["wrangler", "secret", "put", "AUTH_PASSPHRASE_HASH"], {
  cwd: `${root}workers/api`,
  input: hash,
  stdio: ["pipe", "inherit", "inherit"],
});
process.exit(put.status ?? 1);
