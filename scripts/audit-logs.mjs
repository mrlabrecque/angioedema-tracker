#!/usr/bin/env node
// Privacy audit for Worker logs. Sends distinctive "canary" values through the API, then checks
// that none of them (nor the passphrase, token or connection details) appear in the log file.
//   wrangler dev ... > worker.log   (pointed at a DISPOSABLE database)
//   API_URL=http://localhost:8787 PASSPHRASE=... LOG_FILE=worker.log node scripts/audit-logs.mjs
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://localhost:8787";
const PASS = process.env.PASSPHRASE;
const LOG = process.env.LOG_FILE;
if (!PASS || !LOG) throw new Error("PASSPHRASE and LOG_FILE are required");

const tag = randomUUID().slice(0, 8).toUpperCase();
const canary = {
  wrongPass: `CANARY-WRONG-${tag}`,
  notes: `CANARY-NOTES-${tag}`,
  location: `CANARY-LOC-${tag}`,
  exposure: `CANARY-EXPOSURE-${tag}`,
  med: `CANARY-MED-${tag}`,
  search: `CANARY-SEARCH-${tag}`,
  custom: `CANARY-CUSTOM-${tag}`,
};

const call = async (method, path, body, token) => {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

await call("POST", "/api/auth/login", { passphrase: canary.wrongPass });
const login = await call("POST", "/api/auth/login", { passphrase: PASS });
const token = login.data.token;
const ep = await call("POST", "/api/episodes", {
  clientRequestId: randomUUID(),
  onsetAt: new Date().toISOString(),
  generalNotes: canary.notes,
  symptoms: [{ symptomType: "Lip swelling", bodyLocation: canary.location, severity: 4 }],
  exposures: [{ exposureCategory: canary.custom, exposureDescription: canary.exposure }],
  treatments: [{ medicationName: canary.med, administrationTime: new Date().toISOString() }],
}, token);
await call("GET", `/api/episodes?q=${canary.search}`, null, token);
await call("GET", `/api/episodes/${ep.data.id}`, null, token);
await call("PUT", `/api/episodes/${ep.data.id}`, { generalNotes: `${canary.notes}-EDITED` }, token);
await fetch(`${API}/api/export/csv`, { headers: { Authorization: `Bearer ${token}` } });
await call("POST", "/api/episodes", { clientRequestId: "not-a-uuid", generalNotes: canary.notes }, token); // validation error path
await call("DELETE", `/api/episodes/${ep.data.id}`, null, token);
await call("POST", "/api/auth/logout", null, token);

await new Promise((r) => setTimeout(r, 1500));
const log = readFileSync(LOG, "utf8");
const forbidden = {
  ...Object.fromEntries(Object.entries(canary).map(([k, v]) => [`canary ${k}`, v])),
  "real passphrase": PASS,
  "access token": token,
  "Authorization header value": "Bearer ",
  "database credentials": "postgresql://",
  "neon host": "neon.tech",
};
let bad = 0;
for (const [name, needle] of Object.entries(forbidden)) {
  const found = needle && log.includes(needle);
  console.log(`${found ? "FAIL" : "PASS"}  log does not contain ${name}`);
  if (found) bad++;
}
const lines = log.split("\n").filter((l) => /^(GET|POST|PUT|DELETE|OPTIONS) /.test(l));
console.log(`\n${lines.length} request log lines. Sample:`);
for (const l of lines.slice(-6)) console.log("  " + l);
process.exit(bad ? 1 : 0);
