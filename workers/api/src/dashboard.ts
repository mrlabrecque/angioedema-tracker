import { sql } from "drizzle-orm";
import { withDb } from "./db";
import type { Env } from "./env";
import { json } from "./http";

interface Ctx {
  request: Request;
  env: Env;
  ec: ExecutionContext;
}

/** Returns a valid IANA zone name, else "UTC". The value is also bound as a parameter, never interpolated. */
export function safeTimeZone(tz: string | null): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

// All figures are computed from the stored episodes (soft-deleted rows excluded).
export async function summary(c: Ctx) {
  const row = await withDb(c.env, c.ec, async (db) => {
    const r = await db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where status = 'active')::int as active,
        count(*) filter (where onset_at >= now() - interval '30 days')::int as last30,
        avg(extract(epoch from (resolution_at - onset_at)) / 60)
          filter (where resolution_at is not null)::float8 as avg_duration_minutes,
        count(*) filter (where resolution_at is not null)::int as resolved_with_duration,
        max(onset_at) as most_recent_onset,
        (array_agg(id order by onset_at desc))[1] as most_recent_id
      from flare_episodes
      where deleted_at is null`);
    return r.rows[0] as Record<string, unknown>;
  });
  return json(c.request, c.env, {
    total: row.total,
    active: row.active,
    last30Days: row.last30,
    averageDurationMinutes: row.avg_duration_minutes === null ? null : Math.round(Number(row.avg_duration_minutes)),
    episodesWithDuration: row.resolved_with_duration,
    mostRecent: row.most_recent_id ? { id: row.most_recent_id, onsetAt: row.most_recent_onset } : null,
  });
}

export async function trends(c: Ctx) {
  const url = new URL(c.request.url);
  const months = Math.min(Math.max(Number(url.searchParams.get("months")) || 6, 1), 24);
  const tz = safeTimeZone(url.searchParams.get("tz"));

  const out = await withDb(c.env, c.ec, async (db) => {
    const byMonth = await db.execute(sql`
      with m as (
        select generate_series(
          date_trunc('month', now() at time zone ${tz}::text) - (${months - 1}::int * interval '1 month'),
          date_trunc('month', now() at time zone ${tz}::text),
          interval '1 month') as month)
      select to_char(m.month, 'YYYY-MM') as month, count(e.id)::int as episodes
      from m
      left join flare_episodes e
        on e.deleted_at is null
       and date_trunc('month', e.onset_at at time zone ${tz}::text) = m.month
      group by m.month
      order by m.month`);

    const symptoms = await db.execute(sql`
      select s.symptom_type as name, count(distinct s.episode_id)::int as episodes
      from episode_symptoms s
      join flare_episodes e on e.id = s.episode_id and e.deleted_at is null
      group by s.symptom_type
      order by episodes desc, name
      limit 8`);

    const exposures = await db.execute(sql`
      select x.exposure_category as category,
             count(distinct x.episode_id)::int as episodes,
             (count(*) filter (where x.suspected_relationship = 'confirmed_by_clinician'))::int as clinician_confirmed
      from episode_exposures x
      join flare_episodes e on e.id = x.episode_id and e.deleted_at is null
      group by x.exposure_category
      order by episodes desc, category
      limit 8`);

    return { byMonth: byMonth.rows, symptoms: symptoms.rows, exposures: exposures.rows };
  });

  return json(c.request, c.env, {
    timeZone: tz,
    episodesByMonth: out.byMonth,
    symptomFrequency: out.symptoms,
    // Counts of what was *reported* alongside episodes. Not evidence of cause.
    exposureReports: out.exposures.map((r) => ({
      category: r.category,
      episodes: r.episodes,
      clinicianConfirmed: r.clinician_confirmed,
    })),
  });
}
