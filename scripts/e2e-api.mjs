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

// ---------- Phase 3: dashboard, search, filters (deltas, so existing data is fine) ----------
const sumBefore = (await call("GET", "/api/dashboard/summary")).data;
const tag = `zq${randomUUID().slice(0, 8)}`;
const DAY = 86400_000;
const mk = (extra) => call("POST", "/api/episodes", { clientRequestId: randomUUID(), ...extra });

const e60 = await mk({ onsetAt: new Date(Date.now() - 5 * 3600_000).toISOString(), resolutionAt: new Date(Date.now() - 4 * 3600_000).toISOString(), generalNotes: `${tag} sixty`, symptoms: [{ symptomType: "Hives", severity: 3 }], exposures: [{ exposureCategory: "Food", exposureDescription: `${tag}-peanut` }] });
const e120 = await mk({ onsetAt: new Date(Date.now() - 9 * 3600_000).toISOString(), resolutionAt: new Date(Date.now() - 7 * 3600_000).toISOString(), generalNotes: `${tag} onetwenty`, symptoms: [{ symptomType: "Hives", severity: 4 }, { symptomType: "Itching", severity: 2 }] });
const eActive = await mk({ onsetAt: new Date(Date.now() - 3600_000).toISOString(), generalNotes: `${tag} active 100% sure`, treatments: [{ medicationName: `${tag}-med`, administrationTime: new Date().toISOString() }] });
const eOld = await mk({ onsetAt: new Date(Date.now() - 40 * DAY).toISOString(), resolutionAt: new Date(Date.now() - 40 * DAY + 3600_000).toISOString(), generalNotes: `${tag} old` });
check("created 4 dashboard fixtures", [e60, e120, eActive, eOld].every((r) => r.status === 201));

const sumAfter = (await call("GET", "/api/dashboard/summary")).data;
check("summary total increased by exactly 4", sumAfter.total - sumBefore.total === 4, `${sumBefore.total}->${sumAfter.total}`);
check("summary active increased by exactly 1", sumAfter.active - sumBefore.active === 1);
check("summary last30Days increased by exactly 3 (old one excluded)", sumAfter.last30Days - sumBefore.last30Days === 3, `${sumBefore.last30Days}->${sumAfter.last30Days}`);
check("summary most recent is the newest episode", sumAfter.mostRecent?.id === eActive.data.id);
if (sumBefore.episodesWithDuration === 0) {
  // durations 60, 120, 60 min => average 80
  check("average duration computed from real records (80 min)", sumAfter.averageDurationMinutes === 80, String(sumAfter.averageDurationMinutes));
} else {
  check("average duration present", typeof sumAfter.averageDurationMinutes === "number");
}

const tr = (await call("GET", "/api/dashboard/trends?months=6&tz=America/New_York")).data;
check("trends: 6 month buckets ending this month", tr.episodesByMonth?.length === 6 && /^\d{4}-\d{2}$/.test(tr.episodesByMonth[5].month));
check("trends: this month counts today's episodes", tr.episodesByMonth[5].episodes >= 3);
check("trends: symptom frequency counts distinct episodes (Hives >= 2)", (tr.symptomFrequency.find((s) => s.name === "Hives")?.episodes ?? 0) >= 2);
check("trends: exposure reports list Food", tr.exposureReports.some((x) => x.category === "Food" && x.episodes >= 1));
check("trends: nothing is auto-confirmed", tr.exposureReports.find((x) => x.category === "Food")?.clinicianConfirmed === 0);
check("trends: bad tz falls back to UTC", (await call("GET", "/api/dashboard/trends?tz=%27%3B%20drop%20table")).data.timeZone === "UTC");
check("trends: months is clamped", (await call("GET", "/api/dashboard/trends?months=999")).data.episodesByMonth.length === 24);

const search = async (qs) => (await call("GET", `/api/episodes?${qs}`)).data;
check("search by notes token finds all 4", (await search(`q=${tag}`)).items.length === 4);
check("search by exposure description", (await search(`q=${tag}-peanut`)).items.map((i) => i.id).join() === e60.data.id);
check("search by medication name", (await search(`q=${tag}-med`)).items.map((i) => i.id).join() === eActive.data.id);
check("search by symptom + token", (await search(`q=${tag}`)).items.every((i) => i.symptoms !== undefined));
check("search is case-insensitive", (await search(`q=${tag.toUpperCase()}`)).items.length === 4);
const pctLiteral = await search(`q=${encodeURIComponent(`${tag} active 100%`)}`);
check("search matches a literal '%' in text", pctLiteral.items.map((i) => i.id).join() === eActive.data.id, `${pctLiteral.items.length} items`);
const pctOnly = await search("q=%25&limit=200");
const everything = await search("limit=200");
check("a lone '%' is not a wildcard (fewer results than no filter)", pctOnly.items.length >= 1 && pctOnly.items.length < everything.items.length, `${pctOnly.items.length} vs ${everything.items.length}`);
check("search with no match is empty", (await search(`q=${tag}nomatch`)).items.length === 0);
check("filter status=active + token", (await search(`q=${tag}&status=active`)).items.map((i) => i.id).join() === eActive.data.id);
check("filter status=resolved + token", (await search(`q=${tag}&status=resolved`)).items.length === 3);
const win = (a, b) => `from=${encodeURIComponent(new Date(Date.now() - a * DAY).toISOString())}&to=${encodeURIComponent(new Date(Date.now() - b * DAY).toISOString())}`;
check("date range 50d..30d ago returns only the old episode", (await search(`q=${tag}&${win(50, 30)}`)).items.map((i) => i.id).join() === eOld.data.id);
check("date range last 2 days excludes the old episode", (await search(`q=${tag}&${win(2, -1)}`)).items.length === 3);
const p1 = await search(`q=${tag}&limit=2&offset=0`);
const p2 = await search(`q=${tag}&limit=2&offset=2`);
check("pagination: page 1 has 2 and hasMore", p1.items.length === 2 && p1.hasMore === true);
check("pagination: page 2 has the rest, no overlap, no more", p2.items.length === 2 && p2.hasMore === false && !p2.items.some((i) => p1.items.some((j) => j.id === i.id)));
check("results are newest first", [...p1.items, ...p2.items].every((it, i, a) => i === 0 || new Date(a[i - 1].onsetAt) >= new Date(it.onsetAt)));

check("delete a fixture", (await call("DELETE", `/api/episodes/${e120.data.id}`)).status === 200);
const sumDel = (await call("GET", "/api/dashboard/summary")).data;
check("deleted episode leaves the dashboard totals", sumDel.total === sumAfter.total - 1);
check("deleted episode leaves search", (await search(`q=${tag}`)).items.length === 3);
check("deleted episode leaves symptom stats", ((await call("GET", "/api/dashboard/trends")).data.symptomFrequency.find((s) => s.name === "Itching")?.episodes ?? 0) === (tr.symptomFrequency.find((s) => s.name === "Itching")?.episodes ?? 0) - 1);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
console.log(`created id for DB verification: ${id}`);
process.exit(failures ? 1 : 0);
