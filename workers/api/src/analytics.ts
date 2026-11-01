import { sql } from "drizzle-orm";
import { z } from "zod";
import { safeTimeZone } from "./dashboard";
import { withDb } from "./db";
import type { Env } from "./env";
import { json } from "./http";

interface Ctx {
  request: Request;
  env: Env;
  ec: ExecutionContext;
}

export type Unit = "week" | "month" | "year";
const DAY = 86_400_000;

/** Bucket size for the frequency charts, chosen so a chart never has too many bars. */
export function pickUnit(from: Date, to: Date): Unit {
  const days = (to.getTime() - from.getTime()) / DAY;
  if (days <= 120) return "week";
  if (days <= 1100) return "month";
  return "year";
}

const iso = z.string().datetime({ offset: true });
const num = (v: unknown, digits = 0) => (v === null || v === undefined ? null : Number(Number(v).toFixed(digits)));

// Descriptive statistics only. Nothing here asserts that an exposure caused a flare-up.
export async function analytics(c: Ctx) {
  const url = new URL(c.request.url);
  const tz = safeTimeZone(url.searchParams.get("tz"));
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  if ((fromParam && !iso.safeParse(fromParam).success) || (toParam && !iso.safeParse(toParam).success)) {
    return json(c.request, c.env, { error: "validation", issues: [{ path: "range", message: "Invalid date" }] }, 400);
  }
  const to = toParam ? new Date(toParam) : new Date();

  const result = await withDb(c.env, c.ec, async (db) => {
    // No "from" means all time: start at the first recorded episode.
    let from: Date;
    if (fromParam) {
      from = new Date(fromParam);
    } else {
      const r = await db.execute(sql`select min(onset_at) as first from flare_episodes where deleted_at is null`);
      const first = (r.rows[0] as { first: string | Date | null }).first;
      from = first ? new Date(first) : new Date(to.getTime() - 180 * DAY);
    }
    if (from > to || (to.getTime() - from.getTime()) / DAY > 366 * 20) return null;

    const unit = pickUnit(from, to);
    const f = from.toISOString();
    const t = to.toISOString();
    const inRange = sql`e.deleted_at is null and e.onset_at >= ${f}::timestamptz and e.onset_at <= ${t}::timestamptz`;
    const mins = sql`extract(epoch from (e.resolution_at - e.onset_at)) / 60`;

    const [totals, buckets, sev, symptoms, locations, exposures, descriptions, gapStats, gapList] = await Promise.all([
      db.execute(sql`
        select count(*)::int as episodes,
               (count(*) filter (where e.resolution_at is not null))::int as with_duration,
               (avg(${mins}) filter (where e.resolution_at is not null))::float8 as avg_duration,
               (percentile_cont(0.5) within group (order by ${mins}) filter (where e.resolution_at is not null))::float8 as median_duration,
               (max(${mins}) filter (where e.resolution_at is not null))::float8 as max_duration,
               avg(e.overall_severity)::float8 as avg_severity,
               count(e.overall_severity)::int as with_severity
        from flare_episodes e where ${inRange}`),
      db.execute(sql`
        with b as (
          select generate_series(
            date_trunc(${unit}::text, ${f}::timestamptz at time zone ${tz}::text),
            date_trunc(${unit}::text, ${t}::timestamptz at time zone ${tz}::text),
            ('1 ' || ${unit}::text)::interval) as start)
        select to_char(b.start, 'YYYY-MM-DD') as start,
               count(e.id)::int as episodes,
               avg(e.overall_severity)::float8 as avg_severity,
               (avg(${mins}) filter (where e.resolution_at is not null))::float8 as avg_duration_minutes
        from b
        left join flare_episodes e
          on ${inRange}
         and date_trunc(${unit}::text, e.onset_at at time zone ${tz}::text) = b.start
        group by b.start order by b.start`),
      db.execute(sql`
        select g as severity, count(e.id)::int as episodes
        from generate_series(1, 10) g
        left join flare_episodes e on e.overall_severity = g and ${inRange}
        group by g order by g`),
      db.execute(sql`
        select s.symptom_type as name, count(distinct s.episode_id)::int as episodes,
               round(avg(s.severity)::numeric, 1)::float8 as avg_severity
        from episode_symptoms s join flare_episodes e on e.id = s.episode_id and ${inRange}
        group by s.symptom_type order by episodes desc, name limit 10`),
      db.execute(sql`
        select initcap(lower(trim(s.body_location))) as name, count(distinct s.episode_id)::int as episodes
        from episode_symptoms s join flare_episodes e on e.id = s.episode_id and ${inRange}
        where nullif(trim(s.body_location), '') is not null
        group by 1 order by episodes desc, name limit 10`),
      db.execute(sql`
        select x.exposure_category as category,
               count(distinct x.episode_id)::int as episodes,
               (count(*) filter (where x.suspected_relationship = 'possible'))::int as possible,
               (count(*) filter (where x.suspected_relationship = 'suspected'))::int as suspected,
               (count(*) filter (where x.suspected_relationship = 'confirmed_by_clinician'))::int as clinician_confirmed
        from episode_exposures x join flare_episodes e on e.id = x.episode_id and ${inRange}
        group by x.exposure_category order by episodes desc, category limit 10`),
      db.execute(sql`
        select x.exposure_category as category, lower(trim(x.exposure_description)) as description,
               count(distinct x.episode_id)::int as episodes
        from episode_exposures x join flare_episodes e on e.id = x.episode_id and ${inRange}
        where nullif(trim(x.exposure_description), '') is not null
        group by 1, 2 order by episodes desc, description limit 10`),
      // Gaps use the full history for the "previous" episode, so the first episode in the range still has a gap.
      db.execute(sql`
        with o as (select onset_at, lag(onset_at) over (order by onset_at) as prev
                   from flare_episodes where deleted_at is null),
             g as (select extract(epoch from (onset_at - prev)) / 86400 as days
                   from o where prev is not null and onset_at >= ${f}::timestamptz and onset_at <= ${t}::timestamptz)
        select count(*)::int as n, avg(days)::float8 as avg, 
               (percentile_cont(0.5) within group (order by days))::float8 as median,
               min(days)::float8 as min, max(days)::float8 as max
        from g`),
      db.execute(sql`
        with o as (select onset_at, lag(onset_at) over (order by onset_at) as prev
                   from flare_episodes where deleted_at is null)
        select to_char(onset_at at time zone ${tz}::text, 'YYYY-MM-DD') as date,
               (extract(epoch from (onset_at - prev)) / 86400)::float8 as days
        from o where prev is not null and onset_at >= ${f}::timestamptz and onset_at <= ${t}::timestamptz
        order by onset_at desc limit 24`),
    ]);

    const tot = totals.rows[0] as Record<string, unknown>;
    const gs = gapStats.rows[0] as Record<string, unknown>;
    return {
      range: { from: f, to: t, unit, timeZone: tz },
      totals: {
        episodes: tot.episodes,
        episodesWithDuration: tot.with_duration,
        averageDurationMinutes: num(tot.avg_duration),
        medianDurationMinutes: num(tot.median_duration),
        longestDurationMinutes: num(tot.max_duration),
        averageSeverity: num(tot.avg_severity, 1),
        episodesWithSeverity: tot.with_severity,
      },
      frequency: buckets.rows.map((r) => ({
        start: r.start,
        episodes: r.episodes,
        averageSeverity: num(r.avg_severity, 1),
        averageDurationMinutes: num(r.avg_duration_minutes),
      })),
      severityDistribution: sev.rows.map((r) => ({ severity: Number(r.severity), episodes: r.episodes })),
      symptoms: symptoms.rows.map((r) => ({ name: r.name, episodes: r.episodes, averageSeverity: r.avg_severity })),
      locations: locations.rows.map((r) => ({ name: r.name, episodes: r.episodes })),
      // Counts of what was *reported* alongside episodes. Not evidence of cause.
      exposures: exposures.rows.map((r) => ({
        category: r.category,
        episodes: r.episodes,
        possible: r.possible,
        suspected: r.suspected,
        clinicianConfirmed: r.clinician_confirmed,
      })),
      exposureDetails: descriptions.rows.map((r) => ({
        category: r.category,
        description: r.description,
        episodes: r.episodes,
      })),
      gaps: {
        count: gs.n,
        averageDays: num(gs.avg, 1),
        medianDays: num(gs.median, 1),
        shortestDays: num(gs.min, 1),
        longestDays: num(gs.max, 1),
        recent: gapList.rows.map((r) => ({ date: r.date, days: num(r.days, 1) })).reverse(),
      },
    };
  });

  if (!result) {
    return json(c.request, c.env, { error: "validation", issues: [{ path: "range", message: "Invalid date range" }] }, 400);
  }
  return json(c.request, c.env, result);
}
