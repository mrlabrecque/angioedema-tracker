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
check("exposure catalog has the 15 standard categories (custom ones may add more)", exp.data.items?.length >= 15 && exp.data.items.some((i) => i.name === "Food"));

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

// ---------- Phase 4: analytics with hand-computed fixtures (all in 2015, UTC) ----------
const A = async (qs) => (await call("GET", `/api/analytics?tz=UTC&${qs}`)).data;
const Y2015 = `from=${encodeURIComponent("2015-01-01T00:00:00Z")}&to=${encodeURIComponent("2015-12-31T23:59:59Z")}`;
// Clean leftovers from an interrupted earlier run, so reruns start from a known state.
for (const old of (await call("GET", `/api/episodes?limit=200&${Y2015}`)).data.items ?? []) await call("DELETE", `/api/episodes/${old.id}`);

const at = (iso, plusMin = 0) => new Date(Date.parse(iso) + plusMin * 60000).toISOString();
const fx = (onset, resolveMin, severity, symptoms, exposures) =>
  mk({ onsetAt: onset, resolutionAt: resolveMin === null ? null : at(onset, resolveMin), overallSeverity: severity, symptoms, exposures });
const fA = await fx("2015-01-10T12:00:00Z", 120, 4,
  [{ symptomType: "Lip swelling", bodyLocation: "Lip", severity: 4 }, { symptomType: "Hives", severity: 3 }],
  [{ exposureCategory: "Food", exposureDescription: "Shellfish", suspectedRelationship: "possible" }]);
const fB = await fx("2015-01-20T12:00:00Z", 240, 8,
  [{ symptomType: "Lip swelling", bodyLocation: "lip", severity: 8 }, { symptomType: "Tongue swelling", bodyLocation: "Tongue", severity: 5 }],
  [{ exposureCategory: "Food", exposureDescription: " shellfish ", suspectedRelationship: "possible" }, { exposureCategory: "Stress" }]);
const fC = await fx("2015-03-01T12:00:00Z", null, 6,
  [{ symptomType: "Hives", severity: 6 }],
  [{ exposureCategory: "Food", exposureDescription: "peanut", suspectedRelationship: "confirmed_by_clinician" }]);
const fD = await fx("2015-03-05T12:00:00Z", 60, 8, [], []);
check("created 4 analytics fixtures", [fA, fB, fC, fD].every((r) => r.status === 201));

const y = await A(Y2015);
check("range echo uses month buckets for a year", y.range.unit === "month" && y.range.timeZone === "UTC");
check("episodes in range = 4", y.totals.episodes === 4, String(y.totals.episodes));
check("average duration = 140 min", y.totals.averageDurationMinutes === 140, String(y.totals.averageDurationMinutes));
check("median duration = 120 min", y.totals.medianDurationMinutes === 120);
check("longest duration = 240 min", y.totals.longestDurationMinutes === 240);
check("episodes with a duration = 3 (active one excluded)", y.totals.episodesWithDuration === 3);
check("average severity = 6.5", y.totals.averageSeverity === 6.5, String(y.totals.averageSeverity));
check("12 month buckets", y.frequency.length === 12 && y.frequency[0].start === "2015-01-01" && y.frequency[11].start === "2015-12-01");
check("frequency: Jan=2, Feb=0, Mar=2, rest 0", y.frequency.map((b) => b.episodes).join() === "2,0,2,0,0,0,0,0,0,0,0,0", y.frequency.map((b) => b.episodes).join());
check("severity trend per bucket (Jan 6, Mar 7, empty = null)", y.frequency[0].averageSeverity === 6 && y.frequency[2].averageSeverity === 7 && y.frequency[1].averageSeverity === null);
check("duration trend per bucket (Jan 180, Mar 60)", y.frequency[0].averageDurationMinutes === 180 && y.frequency[2].averageDurationMinutes === 60);
check("severity distribution (4:1, 6:1, 8:2)", y.severityDistribution.length === 10 && y.severityDistribution.map((d) => d.episodes).join() === "0,0,0,1,0,1,0,2,0,0", y.severityDistribution.map((d) => d.episodes).join());
const sy = Object.fromEntries(y.symptoms.map((x) => [x.name, x]));
check("symptoms count distinct episodes", sy["Lip swelling"]?.episodes === 2 && sy["Hives"]?.episodes === 2 && sy["Tongue swelling"]?.episodes === 1);
check("symptom average severity (Lip 6, Hives 4.5)", sy["Lip swelling"]?.averageSeverity === 6 && sy["Hives"]?.averageSeverity === 4.5);
check("locations are normalised (Lip 2, Tongue 1)", y.locations.map((l) => `${l.name}:${l.episodes}`).join() === "Lip:2,Tongue:1", y.locations.map((l) => `${l.name}:${l.episodes}`).join());
const food = y.exposures.find((x) => x.category === "Food");
check("exposure reports: Food in 3 episodes, Stress in 1", food?.episodes === 3 && y.exposures.find((x) => x.category === "Stress")?.episodes === 1);
check("exposure relationships are only what the user labelled (possible 2, clinician 1, suspected 0)", food?.possible === 2 && food?.clinicianConfirmed === 1 && food?.suspected === 0);
check("exposure details are case/space-normalised (shellfish in 2)", y.exposureDetails.find((d) => d.description === "shellfish")?.episodes === 2 && y.exposureDetails.find((d) => d.description === "peanut")?.episodes === 1);
check("gaps: 3 gaps, avg 18, median 10, shortest 4, longest 40", y.gaps.count === 3 && y.gaps.averageDays === 18 && y.gaps.medianDays === 10 && y.gaps.shortestDays === 4 && y.gaps.longestDays === 40, JSON.stringify(y.gaps).slice(0, 120));
check("gap list is chronological [10, 40, 4]", y.gaps.recent.map((g) => g.days).join() === "10,40,4");

const sub = await A(`from=${encodeURIComponent("2015-02-01T00:00:00Z")}&to=${encodeURIComponent("2015-12-31T23:59:59Z")}`);
check("narrower range counts only C and D", sub.totals.episodes === 2 && sub.totals.averageSeverity === 7);
check("first episode in range still gets a gap from before the range (40 and 4)", sub.gaps.count === 2 && sub.gaps.averageDays === 22, JSON.stringify(sub.gaps).slice(0, 100));
const weeks = await A(`from=${encodeURIComponent("2015-03-01T00:00:00Z")}&to=${encodeURIComponent("2015-03-31T23:59:59Z")}`);
check("30-day range uses week buckets starting on Monday", weeks.range.unit === "week" && weeks.frequency[0].start === "2015-02-23" && weeks.frequency.length === 6, `${weeks.range.unit} ${weeks.frequency.map((b) => b.start)}`);
check("weekly counts [1,1,0,0,0,0]", weeks.frequency.map((b) => b.episodes).join() === "1,1,0,0,0,0", weeks.frequency.map((b) => b.episodes).join());
const empty = await A(`from=${encodeURIComponent("2014-01-01T00:00:00Z")}&to=${encodeURIComponent("2014-12-31T23:59:59Z")}`);
check("empty range returns zeros and nulls, not errors", empty.totals.episodes === 0 && empty.totals.averageDurationMinutes === null && empty.gaps.count === 0 && empty.symptoms.length === 0);
check("all-time (no from) works and covers the fixtures", (await A("")).totals.episodes >= 4);
check("from after to -> 400", (await call("GET", `/api/analytics?from=${encodeURIComponent("2016-01-01T00:00:00Z")}&to=${encodeURIComponent("2015-01-01T00:00:00Z")}`)).status === 400);
check("garbage date -> 400", (await call("GET", "/api/analytics?from=yesterday")).status === 400);
check("absurd range (>20 years) -> 400", (await call("GET", `/api/analytics?from=${encodeURIComponent("1900-01-01T00:00:00Z")}&to=${encodeURIComponent("2026-01-01T00:00:00Z")}`)).status === 400);
check("analytics requires a token", (await call("GET", "/api/analytics", null, false)).status === 401);

for (const f of [fA, fB, fC, fD]) await call("DELETE", `/api/episodes/${f.data.id}`);
check("cleanup: fixtures leave analytics", (await A(Y2015)).totals.episodes === 0);

// ---------- Custom triggers ----------
const custom = `Zq Trigger ${randomUUID().slice(0, 6)}`;
const catBefore = (await call("GET", "/api/exposures")).data.items.length;
const c1 = await mk({ onsetAt: new Date(Date.now() - 2 * 3600_000).toISOString(), exposures: [{ exposureCategory: `  ${custom}  `, exposureDescription: "first use" }] });
check("custom trigger is accepted and stored trimmed", c1.status === 201 && c1.data.exposures[0].exposureCategory === custom, JSON.stringify(c1.data.exposures?.[0]));
const catAfter = (await call("GET", "/api/exposures")).data.items;
check("custom trigger is added to the catalog exactly once", catAfter.length === catBefore + 1 && catAfter.filter((i) => i.name === custom).length === 1);
check("custom trigger is listed after the standard ones", catAfter.findIndex((i) => i.name === custom) >= 15);
const c2 = await mk({ onsetAt: new Date(Date.now() - 3600_000).toISOString(), exposures: [{ exposureCategory: custom.toUpperCase() }] });
check("same trigger in different case reuses the saved name", c2.data.exposures[0].exposureCategory === custom, c2.data.exposures?.[0]?.exposureCategory);
const c3 = await mk({ onsetAt: new Date().toISOString() });
const c3add = await call("POST", `/api/episodes/${c3.data.id}/exposures`, { exposureCategory: custom.toLowerCase() });
check("adding a custom trigger to an existing episode reuses the saved name", c3add.status === 201 && c3add.data.exposures[0].exposureCategory === custom);
check("a standard category in a different case maps to the standard name", (await mk({ onsetAt: new Date().toISOString(), exposures: [{ exposureCategory: "food" }] })).data.exposures[0].exposureCategory === "Food");
check("catalog size unchanged by reuse", (await call("GET", "/api/exposures")).data.items.length === catBefore + 1);
check("blank trigger is rejected", (await mk({ onsetAt: new Date().toISOString(), exposures: [{ exposureCategory: "   " }] })).status === 400);
check("over-long trigger name is rejected", (await mk({ onsetAt: new Date().toISOString(), exposures: [{ exposureCategory: "x".repeat(81) }] })).status === 400);
const an = (await call("GET", `/api/analytics?tz=UTC&from=${encodeURIComponent(new Date(Date.now() - 86400_000).toISOString())}`)).data;
check("analytics groups the custom trigger under one name (3 episodes)", an.exposures.find((x) => x.category === custom)?.episodes === 3, JSON.stringify(an.exposures.map((x) => [x.category, x.episodes])).slice(0, 140));
const raceName = `Zq Race ${randomUUID().slice(0, 6)}`;
await Promise.all(Array.from({ length: 5 }, () => mk({ onsetAt: new Date().toISOString(), exposures: [{ exposureCategory: raceName }] })));
check("five concurrent uses of a brand-new trigger create one catalog entry", (await call("GET", "/api/exposures")).data.items.filter((i) => i.name === raceName).length === 1);

// ---------- Edit / remove symptoms and exposures ----------
const eo = new Date(Date.now() - 6 * 3600_000).toISOString();
const ed = await mk({
  onsetAt: eo, generalNotes: "child edit fixture",
  symptoms: [{ symptomType: "Lip swelling", bodyLocation: "Bottom lip", severity: 5 }, { symptomType: "Hives", severity: 2 }],
  exposures: [{ exposureCategory: "Food", exposureDescription: "oats", exposureTime: eo }, { exposureCategory: "Stress" }],
});
const edId = ed.data.id;
const [s1, s2] = ed.data.symptoms;
const [x1, x2] = ed.data.exposures;
const other = await mk({ onsetAt: eo, symptoms: [{ symptomType: "Pain", severity: 1 }], exposures: [{ exposureCategory: "Food" }] });

const up1 = await call("PUT", `/api/episodes/${edId}/symptoms/${s1.id}`, { symptomType: "Lip swelling", bodyLocation: "Upper left lip", severity: 8, notes: "corrected" });
const gs1 = up1.data.symptoms.find((x) => x.id === s1.id);
check("edit symptom: severity, location and notes change", up1.status === 200 && gs1.severity === 8 && gs1.bodyLocation === "Upper left lip" && gs1.notes === "corrected");
check("edit symptom: sibling symptom untouched", up1.data.symptoms.find((x) => x.id === s2.id).severity === 2);
check("edit symptom: episode fields untouched", up1.data.generalNotes === "child edit fixture" && up1.data.status === "active" && up1.data.onsetAt === ed.data.onsetAt);
check("edit symptom can clear optional fields", (await call("PUT", `/api/episodes/${edId}/symptoms/${s1.id}`, { symptomType: "Lip swelling", severity: 8 })).data.symptoms.find((x) => x.id === s1.id).bodyLocation === null);
check("edit symptom persists on re-read", (await call("GET", `/api/episodes/${edId}`)).data.symptoms.find((x) => x.id === s1.id).severity === 8);
check("edit symptom rejects severity 11", (await call("PUT", `/api/episodes/${edId}/symptoms/${s1.id}`, { symptomType: "Hives", severity: 11 })).status === 400);
check("edit symptom rejects an empty body", (await call("PUT", `/api/episodes/${edId}/symptoms/${s1.id}`, {})).status === 400);
check("cannot edit another episode's symptom through this episode", (await call("PUT", `/api/episodes/${edId}/symptoms/${other.data.symptoms[0].id}`, { symptomType: "Hives", severity: 9 })).status === 404);
check("the other episode's symptom is unchanged", (await call("GET", `/api/episodes/${other.data.id}`)).data.symptoms[0].severity === 1);
check("unknown symptom id -> 404", (await call("PUT", `/api/episodes/${edId}/symptoms/${randomUUID()}`, { symptomType: "Hives", severity: 3 })).status === 404);

const newCat = `Zq Edit ${randomUUID().slice(0, 6)}`;
const ux1 = await call("PUT", `/api/episodes/${edId}/exposures/${x1.id}`, { exposureCategory: newCat, exposureDescription: "changed", suspectedRelationship: "possible", exposureTime: null, notes: "n" });
const gx1 = ux1.data.exposures.find((x) => x.id === x1.id);
check("edit exposure: category, description, relationship, time cleared, notes", ux1.status === 200 && gx1.exposureCategory === newCat && gx1.exposureDescription === "changed" && gx1.suspectedRelationship === "possible" && gx1.exposureTime === null && gx1.notes === "n");
check("edit exposure with a new custom category adds it to the catalog", (await call("GET", "/api/exposures")).data.items.some((i) => i.name === newCat));
check("edit exposure canonicalises case (food -> Food)", (await call("PUT", `/api/episodes/${edId}/exposures/${x2.id}`, { exposureCategory: "food" })).data.exposures.find((x) => x.id === x2.id).exposureCategory === "Food");
const t2 = new Date(Date.now() - 5 * 3600_000).toISOString();
check("edit exposure can set a time", Date.parse((await call("PUT", `/api/episodes/${edId}/exposures/${x2.id}`, { exposureCategory: "Food", exposureTime: t2 })).data.exposures.find((x) => x.id === x2.id).exposureTime) === Date.parse(t2));
check("edit exposure rejects a bad relationship", (await call("PUT", `/api/episodes/${edId}/exposures/${x2.id}`, { exposureCategory: "Food", suspectedRelationship: "proven" })).status === 400);
check("cannot edit another episode's exposure through this episode", (await call("PUT", `/api/episodes/${edId}/exposures/${other.data.exposures[0].id}`, { exposureCategory: "Stress" })).status === 404);
check("treatments have no item route", (await call("PUT", `/api/episodes/${edId}/treatments/${randomUUID()}`, {})).status === 404);

const del1 = await call("DELETE", `/api/episodes/${edId}/symptoms/${s2.id}`);
check("remove symptom", del1.status === 200 && del1.data.symptoms.length === 1 && del1.data.symptoms[0].id === s1.id);
check("remove symptom: second delete -> 404", (await call("DELETE", `/api/episodes/${edId}/symptoms/${s2.id}`)).status === 404);
const del2 = await call("DELETE", `/api/episodes/${edId}/exposures/${x1.id}`);
check("remove exposure", del2.status === 200 && del2.data.exposures.length === 1 && del2.data.exposures[0].id === x2.id);
check("cannot remove another episode's exposure through this episode", (await call("DELETE", `/api/episodes/${edId}/exposures/${other.data.exposures[0].id}`)).status === 404);
check("the other episode kept its exposure", (await call("GET", `/api/episodes/${other.data.id}`)).data.exposures.length === 1);
check("removing every symptom is allowed (episode stays)", (await call("DELETE", `/api/episodes/${edId}/symptoms/${s1.id}`)).data.symptoms.length === 0);
await call("DELETE", `/api/episodes/${edId}`);
check("child edit on a deleted episode -> 404", (await call("PUT", `/api/episodes/${edId}/symptoms/${s1.id}`, { symptomType: "Hives", severity: 3 })).status === 404);
check("child delete on a deleted episode -> 404", (await call("DELETE", `/api/episodes/${edId}/exposures/${x2.id}`)).status === 404);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
console.log(`created id for DB verification: ${id}`);
process.exit(failures ? 1 : 0);
