#!/usr/bin/env node
// End-to-end API checks. Writes real rows: point API_URL at a Worker connected to a
// disposable database/branch, never at production data.
//   API_URL=http://localhost:8787 PASSPHRASE=... node scripts/e2e-api.mjs
import { randomUUID } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:8787";
const PASS = process.env.PASSPHRASE;
if (!PASS) throw new Error("PASSPHRASE is required");

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
  if (!cond) failures++;
};

let token = "";
async function call(method, path, body, auth = true) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(auth ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const login = await call("POST", "/api/auth/login", { passphrase: PASS }, false);
token = login.data.token;
check("login", login.status === 200 && !!token);
check("unauthenticated request rejected", (await call("GET", "/api/episodes", null, false)).status === 401);

const sym = await call("GET", "/api/symptoms");
const exp = await call("GET", "/api/exposures");
check("symptom catalog seeded (13)", sym.data.items?.length === 13, JSON.stringify(sym.data).slice(0, 80));
check("exposure catalog seeded (15)", exp.data.items?.length === 15);

const onset = new Date(Date.now() - 3 * 3600_000).toISOString();
const reqId = randomUUID();
const payload = {
  clientRequestId: reqId,
  onsetAt: onset,
  overallSeverity: 6,
  generalNotes: "e2e test episode",
  symptoms: [
    { symptomType: "Lip swelling", bodyLocation: "Lip", severity: 6 },
    { symptomType: "Hives", severity: 3, notes: "arms" },
  ],
  exposures: [{ exposureCategory: "Food", exposureDescription: "shellfish" }],
  treatments: [{ medicationName: "Test med", dosage: "10 mg", administrationTime: onset, response: "partial" }],
};
const created = await call("POST", "/api/episodes", payload);
const id = created.data.id;
check("create episode returns 201 with id", created.status === 201 && !!id, `status ${created.status}`);
check("symptoms persisted", created.data.symptoms?.length === 2);
check("exposure persisted and defaults to 'unknown'", created.data.exposures?.[0]?.suspectedRelationship === "unknown");
check("treatment persisted", created.data.treatments?.[0]?.medicationName === "Test med" && created.data.treatments[0].response === "partial");
check("new episode is active", created.data.status === "active" && created.data.resolutionAt === null);

const dup = await call("POST", "/api/episodes", payload);
check("duplicate submission returns the original (200)", dup.status === 200 && dup.data.id === id && dup.data.duplicate === true);
check("duplicate did not duplicate children", dup.data.symptoms?.length === 2);

const raceId = randomUUID();
const race = await Promise.all(
  Array.from({ length: 5 }, () =>
    call("POST", "/api/episodes", { clientRequestId: raceId, onsetAt: onset, symptoms: [{ symptomType: "Pain", severity: 2 }] }),
  ),
);
const raceIds = new Set(race.map((r) => r.data.id));
check("5 concurrent identical submissions create exactly one episode", raceIds.size === 1 && race.filter((r) => r.status === 201).length === 1, `ids=${raceIds.size}`);
const raceDetail = await call("GET", `/api/episodes/${[...raceIds][0]}`);
check("concurrent race left exactly one symptom row", raceDetail.data.symptoms?.length === 1);

check("incomplete episode (onset only) is accepted", (await call("POST", "/api/episodes", { clientRequestId: randomUUID(), onsetAt: onset })).status === 201);
for (const [label, bad] of [
  ["severity 11", { ...payload, clientRequestId: randomUUID(), overallSeverity: 11 }],
  ["bad date", { ...payload, clientRequestId: randomUUID(), onsetAt: "soon" }],
  ["resolution before onset", { clientRequestId: randomUUID(), onsetAt: onset, resolutionAt: new Date(Date.now() - 5 * 3600_000).toISOString() }],
]) {
  check(`rejects ${label}`, (await call("POST", "/api/episodes", bad)).status === 400);
}

const got = await call("GET", `/api/episodes/${id}`);
check("get by id (survives a fresh request)", got.status === 200 && got.data.generalNotes === "e2e test episode");
check("unknown id -> 404", (await call("GET", `/api/episodes/${randomUUID()}`)).status === 404);
check("malformed id -> 404", (await call("GET", "/api/episodes/not-a-uuid")).status === 404);

const edit = await call("PUT", `/api/episodes/${id}`, { generalNotes: "edited", overallSeverity: 8 });
check("edit episode", edit.status === 200 && edit.data.generalNotes === "edited" && edit.data.overallSeverity === 8);
check("edit persisted on re-read", (await call("GET", `/api/episodes/${id}`)).data.overallSeverity === 8);
check("empty update rejected", (await call("PUT", `/api/episodes/${id}`, {})).status === 400);

const addSym = await call("POST", `/api/episodes/${id}/symptoms`, { symptomType: "Throat swelling", bodyLocation: "Throat", severity: 4 });
const addExp = await call("POST", `/api/episodes/${id}/exposures`, { exposureCategory: "Stress", suspectedRelationship: "possible" });
const addTr = await call("POST", `/api/episodes/${id}/treatments`, { medicationName: "Second med", administrationTime: onset });
check("add symptom", addSym.status === 201 && addSym.data.symptoms.length === 3);
check("add exposure", addExp.status === 201 && addExp.data.exposures.length === 2);
check("add treatment (response defaults to unknown)", addTr.status === 201 && addTr.data.treatments.length === 2 && addTr.data.treatments.at(-1).response === "unknown");
check("add child to missing episode -> 404", (await call("POST", `/api/episodes/${randomUUID()}/symptoms`, { symptomType: "Pain", severity: 1 })).status === 404);

const resolved = await call("PUT", `/api/episodes/${id}`, { status: "resolved" });
check("resolve sets status and resolutionAt", resolved.data.status === "resolved" && !!resolved.data.resolutionAt);
check("duration is positive", new Date(resolved.data.resolutionAt) > new Date(resolved.data.onsetAt));
check("resolution before onset rejected on update", (await call("PUT", `/api/episodes/${id}`, { resolutionAt: new Date(Date.now() - 9 * 3600_000).toISOString() })).status === 400);
check("reopening clears resolutionAt", (await call("PUT", `/api/episodes/${id}`, { status: "active" })).data.resolutionAt === null);

const list = await call("GET", "/api/episodes");
check("list includes episode with symptom summary", list.data.items?.some((e) => e.id === id && e.symptoms.length === 3));
check("list has no duplicates of the idempotent episode", list.data.items.filter((e) => e.id === id).length === 1);
check("list status filter", (await call("GET", "/api/episodes?status=resolved")).data.items.every((e) => e.status === "resolved"));

check("soft delete", (await call("DELETE", `/api/episodes/${id}`)).status === 200);
check("deleted episode hidden from get", (await call("GET", `/api/episodes/${id}`)).status === 404);
check("deleted episode hidden from list", !(await call("GET", "/api/episodes")).data.items.some((e) => e.id === id));
check("second delete -> 404", (await call("DELETE", `/api/episodes/${id}`)).status === 404);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
console.log(`created id for DB verification: ${id}`);
process.exit(failures ? 1 : 0);
