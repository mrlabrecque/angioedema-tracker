import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { episodeExposures, episodeSymptoms, episodeTreatments, flareEpisodes } from "@angioedema/database";
import { z } from "zod";
import { CSV_HEADER, buildCsv, localStamp } from "./csv";
import { safeTimeZone } from "./dashboard";
import { withDb } from "./db";
import type { Env } from "./env";
import { json, text } from "./http";

interface Ctx {
  request: Request;
  env: Env;
  ec: ExecutionContext;
}

const iso = z.string().datetime({ offset: true });
const uuid = z.string().uuid();
const RELATIONSHIP = {
  unknown: "unknown if related",
  possible: "possibly related",
  suspected: "suspected",
  confirmed_by_clinician: "confirmed by clinician",
} as const;

/** Full records (episodes with symptoms, exposures, treatments), oldest first. */
async function load(c: Ctx) {
  const url = new URL(c.request.url);
  const id = url.searchParams.get("id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((id && !uuid.safeParse(id).success) || (from && !iso.safeParse(from).success) || (to && !iso.safeParse(to).success)) {
    return null;
  }
  const where = [isNull(flareEpisodes.deletedAt)];
  if (id) where.push(eq(flareEpisodes.id, id));
  if (from) where.push(gte(flareEpisodes.onsetAt, new Date(from)));
  if (to) where.push(lte(flareEpisodes.onsetAt, new Date(to)));

  return withDb(c.env, c.ec, async (db) => {
    const eps = await db.select().from(flareEpisodes).where(and(...where)).orderBy(asc(flareEpisodes.onsetAt));
    const ids = eps.map((e) => e.id);
    if (!ids.length) return { range: { from, to, id }, episodes: [] };
    const [syms, exps, treats] = await Promise.all([
      db.select().from(episodeSymptoms).where(inArray(episodeSymptoms.episodeId, ids)).orderBy(asc(episodeSymptoms.createdAt)),
      db.select().from(episodeExposures).where(inArray(episodeExposures.episodeId, ids)).orderBy(asc(episodeExposures.createdAt)),
      db.select().from(episodeTreatments).where(inArray(episodeTreatments.episodeId, ids)).orderBy(asc(episodeTreatments.administrationTime)),
    ]);
    return {
      range: { from, to, id },
      episodes: eps.map((e) => ({
        id: e.id,
        onsetAt: e.onsetAt,
        resolutionAt: e.resolutionAt,
        status: e.status,
        overallSeverity: e.overallSeverity,
        generalNotes: e.generalNotes,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        symptoms: syms.filter((s) => s.episodeId === e.id),
        exposures: exps.filter((x) => x.episodeId === e.id),
        treatments: treats.filter((t) => t.episodeId === e.id),
      })),
    };
  });
}

const bad = (c: Ctx) => json(c.request, c.env, { error: "validation", issues: [{ path: "query", message: "Invalid parameter" }] }, 400);

/** JSON used by the printable report page. */
export async function exportReport(c: Ctx) {
  const data = await load(c);
  if (!data) return bad(c);
  return json(c.request, c.env, { generatedAt: new Date().toISOString(), ...data });
}

export async function exportCsv(c: Ctx) {
  const data = await load(c);
  if (!data) return bad(c);
  const tz = safeTimeZone(new URL(c.request.url).searchParams.get("tz"));
  const L = (d: Date | string | null) => localStamp(d, tz);

  const rows = data.episodes.map((e) => [
    e.id,
    L(e.onsetAt),
    L(e.resolutionAt),
    e.status,
    e.resolutionAt ? Math.round((new Date(e.resolutionAt).getTime() - new Date(e.onsetAt).getTime()) / 60000) : "",
    e.overallSeverity ?? "",
    e.symptoms
      .map((s) => `${s.symptomType}${s.bodyLocation ? ` [${s.bodyLocation}]` : ""} ${s.severity}/10${s.notes ? ` (${s.notes})` : ""}`)
      .join("; "),
    e.exposures
      .map(
        (x) =>
          `${x.exposureCategory}${x.exposureDescription ? `: ${x.exposureDescription}` : ""} (${RELATIONSHIP[x.suspectedRelationship]})` +
          (x.exposureTime ? ` at ${L(x.exposureTime)}` : ""),
      )
      .join("; "),
    e.treatments
      .map((t) => `${t.medicationName}${t.dosage ? ` ${t.dosage}` : ""} at ${L(t.administrationTime)} (response: ${t.response})`)
      .join("; "),
    e.generalNotes ?? "",
    new Date(e.onsetAt).toISOString(),
    e.resolutionAt ? new Date(e.resolutionAt).toISOString() : "",
    new Date(e.createdAt).toISOString(),
    new Date(e.updatedAt).toISOString(),
  ]);

  return text(c.request, c.env, buildCsv(CSV_HEADER, rows), "text/csv; charset=utf-8");
}
