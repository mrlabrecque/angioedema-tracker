import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  episodeExposures,
  episodeSymptoms,
  episodeTreatments,
  exposureCatalog,
  flareEpisodes,
  symptomCatalog,
} from "@angioedema/database";
import type { ZodType } from "zod";
import { withDb, type Db } from "./db";
import type { Env } from "./env";
import { json } from "./http";
import {
  createEpisodeInput,
  exposureInput,
  symptomInput,
  treatmentInput,
  updateEpisodeInput,
  uuid,
} from "./validation";

const MAX_BODY = 64 * 1024;

interface Ctx {
  request: Request;
  env: Env;
  ec: ExecutionContext;
}

const fail = (c: Ctx, status: number, error: string, extra: Record<string, unknown> = {}) =>
  json(c.request, c.env, { error, ...extra }, status);

async function readBody<T>(c: Ctx, schema: ZodType<T>): Promise<{ data: T } | { res: Response }> {
  const raw = await c.request.text();
  if (raw.length > MAX_BODY) return { res: fail(c, 413, "too_large") };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { res: fail(c, 400, "bad_request") };
  }
  const r = schema.safeParse(parsed);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return { res: fail(c, 400, "validation", { issues }) };
  }
  return { data: r.data };
}

async function getDetail(db: Db, id: string) {
  const [episode] = await db
    .select()
    .from(flareEpisodes)
    .where(and(eq(flareEpisodes.id, id), isNull(flareEpisodes.deletedAt)));
  if (!episode) return null;
  const [symptoms, exposures, treatments] = await Promise.all([
    db.select().from(episodeSymptoms).where(eq(episodeSymptoms.episodeId, id)).orderBy(asc(episodeSymptoms.createdAt)),
    db.select().from(episodeExposures).where(eq(episodeExposures.episodeId, id)).orderBy(asc(episodeExposures.createdAt)),
    db.select().from(episodeTreatments).where(eq(episodeTreatments.episodeId, id)).orderBy(asc(episodeTreatments.administrationTime)),
  ]);
  return { ...episode, deletedAt: undefined, clientRequestId: undefined, symptoms, exposures, treatments };
}

export async function listCatalog(c: Ctx, which: "symptoms" | "exposures") {
  const table = which === "symptoms" ? symptomCatalog : exposureCatalog;
  const rows = await withDb(c.env, c.ec, (db) =>
    db.select({ id: table.id, name: table.name }).from(table).orderBy(asc(table.sortOrder)),
  );
  return json(c.request, c.env, { items: rows });
}

export async function listEpisodes(c: Ctx) {
  const url = new URL(c.request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const status = url.searchParams.get("status");
  const where =
    status === "active" || status === "resolved" || status === "unknown"
      ? and(isNull(flareEpisodes.deletedAt), eq(flareEpisodes.status, status))
      : isNull(flareEpisodes.deletedAt);

  const items = await withDb(c.env, c.ec, async (db) => {
    const eps = await db.select().from(flareEpisodes).where(where).orderBy(desc(flareEpisodes.onsetAt)).limit(limit);
    const ids = eps.map((e) => e.id);
    const syms = ids.length
      ? await db
          .select({
            episodeId: episodeSymptoms.episodeId,
            symptomType: episodeSymptoms.symptomType,
            bodyLocation: episodeSymptoms.bodyLocation,
            severity: episodeSymptoms.severity,
          })
          .from(episodeSymptoms)
          .where(inArray(episodeSymptoms.episodeId, ids))
      : [];
    return eps.map((e) => ({
      id: e.id,
      onsetAt: e.onsetAt,
      resolutionAt: e.resolutionAt,
      status: e.status,
      overallSeverity: e.overallSeverity,
      symptoms: syms.filter((s) => s.episodeId === e.id),
    }));
  });
  return json(c.request, c.env, { items });
}

export async function createEpisode(c: Ctx) {
  const body = await readBody(c, createEpisodeInput);
  if ("res" in body) return body.res;
  const d = body.data;

  const status = d.status ?? (d.resolutionAt ? "resolved" : "active");
  if (d.resolutionAt && new Date(d.resolutionAt) < new Date(d.onsetAt)) {
    return fail(c, 400, "validation", { issues: [{ path: "resolutionAt", message: "Resolution is before onset" }] });
  }

  const out = await withDb(c.env, c.ec, (db) =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(flareEpisodes)
        .values({
          clientRequestId: d.clientRequestId,
          onsetAt: new Date(d.onsetAt),
          resolutionAt: d.resolutionAt ? new Date(d.resolutionAt) : null,
          status,
          overallSeverity: d.overallSeverity,
          generalNotes: d.generalNotes,
        })
        .onConflictDoNothing({ target: flareEpisodes.clientRequestId })
        .returning({ id: flareEpisodes.id });

      if (!row) {
        // Same submission arrived before (double tap / retry): return the original.
        const [existing] = await tx
          .select({ id: flareEpisodes.id })
          .from(flareEpisodes)
          .where(eq(flareEpisodes.clientRequestId, d.clientRequestId));
        return { id: existing!.id, duplicate: true };
      }
      const episodeId = row.id;
      if (d.symptoms.length) await tx.insert(episodeSymptoms).values(d.symptoms.map((s) => ({ ...s, episodeId })));
      if (d.exposures.length) {
        await tx.insert(episodeExposures).values(
          d.exposures.map((e) => ({
            ...e,
            episodeId,
            exposureTime: e.exposureTime ? new Date(e.exposureTime) : null,
          })),
        );
      }
      if (d.treatments.length) {
        await tx.insert(episodeTreatments).values(
          d.treatments.map((t) => ({ ...t, episodeId, administrationTime: new Date(t.administrationTime) })),
        );
      }
      return { id: episodeId, duplicate: false };
    }),
  );

  const detail = await withDb(c.env, c.ec, (db) => getDetail(db, out.id));
  return json(c.request, c.env, { ...detail, duplicate: out.duplicate }, out.duplicate ? 200 : 201);
}

export async function getEpisode(c: Ctx, id: string) {
  if (!uuid.safeParse(id).success) return fail(c, 404, "not_found");
  const detail = await withDb(c.env, c.ec, (db) => getDetail(db, id));
  return detail ? json(c.request, c.env, detail) : fail(c, 404, "not_found");
}

export async function updateEpisode(c: Ctx, id: string) {
  if (!uuid.safeParse(id).success) return fail(c, 404, "not_found");
  const body = await readBody(c, updateEpisodeInput);
  if ("res" in body) return body.res;
  const d = body.data;

  const result = await withDb(c.env, c.ec, (db) =>
    db.transaction(async (tx) => {
      const [cur] = await tx
        .select()
        .from(flareEpisodes)
        .where(and(eq(flareEpisodes.id, id), isNull(flareEpisodes.deletedAt)));
      if (!cur) return "not_found" as const;

      const onsetAt = d.onsetAt ? new Date(d.onsetAt) : cur.onsetAt;
      let status = d.status ?? cur.status;
      let resolutionAt =
        d.resolutionAt === undefined ? cur.resolutionAt : d.resolutionAt ? new Date(d.resolutionAt) : null;
      if (d.resolutionAt && !d.status) status = "resolved";
      if (status === "active") resolutionAt = null;
      if (status === "resolved" && !resolutionAt) resolutionAt = new Date();
      if (resolutionAt && resolutionAt < onsetAt) return "bad_range" as const;

      await tx
        .update(flareEpisodes)
        .set({
          onsetAt,
          resolutionAt,
          status,
          ...(d.overallSeverity !== undefined ? { overallSeverity: d.overallSeverity } : {}),
          ...(d.generalNotes !== undefined ? { generalNotes: d.generalNotes || null } : {}),
        })
        .where(eq(flareEpisodes.id, id));
      return "ok" as const;
    }),
  );

  if (result === "not_found") return fail(c, 404, "not_found");
  if (result === "bad_range") {
    return fail(c, 400, "validation", { issues: [{ path: "resolutionAt", message: "Resolution is before onset" }] });
  }
  const detail = await withDb(c.env, c.ec, (db) => getDetail(db, id));
  return json(c.request, c.env, detail);
}

/** Soft delete: the row is kept (history is preserved) but hidden from the app. */
export async function deleteEpisode(c: Ctx, id: string) {
  if (!uuid.safeParse(id).success) return fail(c, 404, "not_found");
  const rows = await withDb(c.env, c.ec, (db) =>
    db
      .update(flareEpisodes)
      .set({ deletedAt: new Date() })
      .where(and(eq(flareEpisodes.id, id), isNull(flareEpisodes.deletedAt)))
      .returning({ id: flareEpisodes.id }),
  );
  return rows.length ? json(c.request, c.env, { ok: true }) : fail(c, 404, "not_found");
}

export async function addChild(c: Ctx, id: string, kind: "symptoms" | "exposures" | "treatments") {
  if (!uuid.safeParse(id).success) return fail(c, 404, "not_found");
  const schema = kind === "symptoms" ? symptomInput : kind === "exposures" ? exposureInput : treatmentInput;
  const body = await readBody(c, schema as ZodType<Record<string, unknown>>);
  if ("res" in body) return body.res;
  const d = body.data as never as Record<string, never>;

  const ok = await withDb(c.env, c.ec, async (db) => {
    const [ep] = await db
      .select({ id: flareEpisodes.id })
      .from(flareEpisodes)
      .where(and(eq(flareEpisodes.id, id), isNull(flareEpisodes.deletedAt)));
    if (!ep) return false;
    if (kind === "symptoms") {
      await db.insert(episodeSymptoms).values({ ...(d as never as typeof symptomInput._output), episodeId: id });
    } else if (kind === "exposures") {
      const e = d as never as typeof exposureInput._output;
      await db
        .insert(episodeExposures)
        .values({ ...e, episodeId: id, exposureTime: e.exposureTime ? new Date(e.exposureTime) : null });
    } else {
      const t = d as never as typeof treatmentInput._output;
      await db
        .insert(episodeTreatments)
        .values({ ...t, episodeId: id, administrationTime: new Date(t.administrationTime) });
    }
    return true;
  });
  if (!ok) return fail(c, 404, "not_found");
  const detail = await withDb(c.env, c.ec, (db) => getDetail(db, id));
  return json(c.request, c.env, detail, 201);
}
