"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HBars, MonthBars } from "@/components/Charts";
import { Card, Chip, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { bucketLabel, endOfDayIso, formatMinutes, localTimeZone, shortDuration, startOfDayIso } from "@/lib/format";
import type { Analytics } from "@/lib/types";

const PRESETS = [
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "6m", label: "6 months", days: 182 },
  { key: "1y", label: "1 year", days: 365 },
  { key: "all", label: "All time", days: 0 },
] as const;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

const days = (n: number | null) => (n === null ? "—" : `${n} d`);

export default function TrendsView() {
  const { session, clear } = useAuth();
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["key"] | "custom">("6m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const path = useMemo(() => {
    const p = new URLSearchParams({ tz: localTimeZone() });
    if (preset === "custom") {
      if (from) p.set("from", startOfDayIso(from));
      if (to) p.set("to", endOfDayIso(to));
    } else {
      const days = PRESETS.find((x) => x.key === preset)!.days;
      if (days) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - days);
        p.set("from", d.toISOString());
      }
    }
    return `/api/analytics?${p}`;
  }, [preset, from, to]);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      setData(await api<Analytics>(path, { token: session.token }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return clear();
      setError(e instanceof ApiError && e.status === 400 ? "That date range isn’t valid." : "Couldn’t load trends.");
    }
  }, [session, path, clear]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const unit = data?.range.unit ?? "month";
  const spansYears = data ? new Date(data.range.from).getFullYear() !== new Date(data.range.to).getFullYear() : false;
  const t = data?.totals;
  const n = t?.episodes ?? 0;

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Trends</h1>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Chip key={p.key} selected={preset === p.key} onClick={() => setPreset(p.key)}>
            {p.label}
          </Chip>
        ))}
        <Chip selected={preset === "custom"} onClick={() => setPreset("custom")}>
          Custom
        </Chip>
      </div>
      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-muted">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="block text-xs text-muted">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
        </div>
      )}

      {error && (
        <p className="text-sm text-danger">
          {error}{" "}
          <button onClick={load} className="underline">
            Retry
          </button>
        </p>
      )}
      {!error && !data && <p className="text-sm text-muted">Loading…</p>}

      {data && t && (
        <>
          {n === 0 ? (
            <Card>
              <p className="text-sm text-muted">No episodes in this range. Try a longer range, or log a flare-up with the + button.</p>
            </Card>
          ) : (
            <>
              {n < 10 && (
                <p className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
                  Only {n} {n === 1 ? "episode" : "episodes"} in this range. Patterns from a small number of episodes are easy to over-read.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Stat label="Episodes" value={String(n)} />
                <Stat
                  label="Avg severity"
                  value={t.averageSeverity === null ? "—" : `${t.averageSeverity}/10`}
                  sub={t.episodesWithSeverity < n ? `${t.episodesWithSeverity} of ${n} rated` : undefined}
                />
                <Stat
                  label="Avg duration"
                  value={t.averageDurationMinutes === null ? "—" : formatMinutes(t.averageDurationMinutes)}
                  sub={t.episodesWithDuration ? `from ${t.episodesWithDuration} resolved` : "no resolved episodes"}
                />
                <Stat
                  label="Median duration"
                  value={t.medianDurationMinutes === null ? "—" : formatMinutes(t.medianDurationMinutes)}
                  sub={t.longestDurationMinutes === null ? undefined : `longest ${formatMinutes(t.longestDurationMinutes)}`}
                />
              </div>

              <Card title={`Flare-ups per ${unit}`}>
                <MonthBars
                  title={`Flare-ups per ${unit}`}
                  data={data.frequency.map((b) => ({ label: bucketLabel(b.start, unit, spansYears), value: b.episodes }))}
                />
              </Card>

              <Card title={`Average severity per ${unit}`}>
                <MonthBars
                  title={`Average severity per ${unit}`}
                  max={10}
                  data={data.frequency.map((b) => ({
                    label: bucketLabel(b.start, unit, spansYears),
                    value: b.averageSeverity,
                    display: b.averageSeverity === null ? undefined : String(b.averageSeverity),
                  }))}
                />
                <p className="mt-3 text-xs text-muted">Empty bars mean no rated episodes in that period.</p>
              </Card>

              <Card title={`Average duration per ${unit}`}>
                <MonthBars
                  title={`Average duration per ${unit}`}
                  data={data.frequency.map((b) => ({
                    label: bucketLabel(b.start, unit, spansYears),
                    value: b.averageDurationMinutes,
                    display: b.averageDurationMinutes === null ? undefined : shortDuration(b.averageDurationMinutes),
                  }))}
                />
                <p className="mt-3 text-xs text-muted">Only resolved episodes have a duration.</p>
              </Card>

              <Card title="Severity distribution">
                <MonthBars
                  title="Episodes by overall severity"
                  data={data.severityDistribution.map((d) => ({ label: String(d.severity), value: d.episodes }))}
                />
                <p className="mt-3 text-xs text-muted">Number of episodes at each overall severity, 1 to 10.</p>
              </Card>

              <Card title="Most frequent symptoms">
                {data.symptoms.length ? (
                  <HBars
                    total={n}
                    data={data.symptoms.map((s) => ({
                      label: s.name,
                      value: s.episodes,
                      note: `average severity ${s.averageSeverity}/10`,
                    }))}
                  />
                ) : (
                  <p className="text-sm text-muted">No symptoms recorded in this range.</p>
                )}
              </Card>

              <Card title="Swelling locations">
                {data.locations.length ? (
                  <HBars total={n} data={data.locations.map((l) => ({ label: l.name, value: l.episodes }))} />
                ) : (
                  <p className="text-sm text-muted">No locations recorded in this range.</p>
                )}
              </Card>

              <Card title="Time between episodes">
                {data.gaps.count === 0 ? (
                  <p className="text-sm text-muted">Needs at least two episodes.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Stat label="Average" value={days(data.gaps.averageDays)} />
                      <Stat label="Median" value={days(data.gaps.medianDays)} />
                      <Stat label="Shortest" value={days(data.gaps.shortestDays)} />
                      <Stat label="Longest" value={days(data.gaps.longestDays)} />
                    </div>
                    <div className="mt-4">
                      <MonthBars
                        title="Days since the previous episode"
                        data={data.gaps.recent.map((g) => ({ label: g.date.slice(5), value: g.days, display: String(Math.round(g.days)) }))}
                      />
                      <p className="mt-3 text-xs text-muted">Days since the previous episode, most recent {data.gaps.recent.length}.</p>
                    </div>
                  </>
                )}
              </Card>

              <Card title="Exposures you reported">
                {data.exposures.length ? (
                  <>
                    <HBars
                      total={n}
                      data={data.exposures.map((x) => {
                        const labels = [
                          x.possible ? `${x.possible} marked possible` : "",
                          x.suspected ? `${x.suspected} marked suspected` : "",
                          x.clinicianConfirmed ? `${x.clinicianConfirmed} confirmed by your clinician` : "",
                        ].filter(Boolean);
                        return { label: x.category, value: x.episodes, note: labels.length ? labels.join(" · ") : undefined };
                      })}
                    />
                    {data.exposureDetails.length > 0 && (
                      <div className="mt-5 border-t border-line pt-4">
                        <p className="text-sm font-medium">Most often described as</p>
                        <ul className="mt-2 space-y-1 text-sm text-muted">
                          {data.exposureDetails.map((d) => (
                            <li key={d.category + d.description}>
                              {d.description} <span className="text-xs">({d.category}, {d.episodes} {d.episodes === 1 ? "episode" : "episodes"})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-5 rounded-xl bg-bg p-3 text-xs text-muted">
                      <p className="font-medium text-ink">What this can and can’t tell you</p>
                      <p className="mt-1">
                        These are counts of what you noted alongside flare-ups. Because only flare-ups are logged, there is no record of how
                        often the same things happen when you <em>don’t</em> flare, so this cannot show that any of them caused an episode. Only
                        your clinician can confirm a trigger.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted">No exposures noted in this range.</p>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </main>
  );
}
