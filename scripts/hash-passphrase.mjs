#!/usr/bin/env node
// Prints a PBKDF2-SHA256 hash string for AUTH_PASSPHRASE_HASH.
// Format: pbkdf2-sha256:<iterations>:<salt b64>:<hash b64>
// Workers' WebCrypto caps PBKDF2 at 100,000 iterations.
import { webcrypto as crypto } from "node:crypto";

const ITERATIONS = 100_000;

function readHidden(prompt) {
  return new Promise((resolve) => {
    process.stderr.write(prompt);
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let data = "";
      stdin.on("data", (c) => (data += c));
      stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    stdin.on("data", function onData(ch) {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stderr.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(130);
      } else if (ch === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    });
  });
}

const b64 = (buf) => Buffer.from(buf).toString("base64");

const pass = await readHidden("Passphrase: ");
if (pass.length < 12) {
  console.error("Use at least 12 characters (5+ random words recommended).");
  process.exit(1);
}
if (process.stdin.isTTY) {
  const again = await readHidden("Repeat: ");
  if (again !== pass) {
    console.error("Passphrases do not match.");
    process.exit(1);
  }
}
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
console.log(`pbkdf2-sha256:${ITERATIONS}:${b64(salt)}:${b64(new Uint8Array(bits))}`);
