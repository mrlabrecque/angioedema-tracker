"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { HBars, MonthBars } from "@/components/Charts";
import EpisodeRow from "@/components/EpisodeRow";
import { Card } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatMinutes, localTimeZone, monthLabel } from "@/lib/format";
import type { EpisodeSummary, Summary, Trends } from "@/lib/types";

function Metric({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function Overview() {
  const { session, clear } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [recent, setRecent] = useState<EpisodeSummary[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setError(false);
    const token = session.token;
    try {
      const [s, t, r] = await Promise.all([
        api<Summary>("/api/dashboard/summary", { token }),
        api<Trends>(`/api/dashboard/trends?months=6&tz=${encodeURIComponent(localTimeZone())}`, { token }),
        api<{ items: EpisodeSummary[] }>("/api/episodes?limit=5", { token }),
      ]);
      setSummary(s);
      setTrends(t);
      setRecent(r.items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return clear();
      setError(true);
    }
  }, [session, clear]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error)
    return (
      <p className="text-sm text-danger">
        Couldn’t load your overview.{" "}
        <button onClick={load} className="underline">
          Retry
        </button>
      </p>
    );
  if (!summary || !trends || !recent) return <p className="text-sm text-muted">Loading…</p>;

  const empty = summary.total === 0;

  return (
    <main className="space-y-4">
      {summary.active > 0 && (
        <Link
          href="/history/?status=active"
          className="flex min-h-12 items-center justify-between rounded-2xl border border-danger/40 bg-danger/10 px-4 text-sm"
        >
          <span>
            {summary.active} active {summary.active === 1 ? "episode" : "episodes"}
          </span>
          <span className="text-muted">View →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Total flare-ups" value={String(summary.total)} />
        <Metric label="Last 30 days" value={String(summary.last30Days)} />
        <Metric label="Active now" value={String(summary.active)} href="/history/?status=active" />
        <Metric
          label="Avg duration"
          value={summary.averageDurationMinutes === null ? "—" : formatMinutes(summary.averageDurationMinutes)}
          sub={
            summary.episodesWithDuration
              ? `from ${summary.episodesWithDuration} resolved`
              : "needs a resolved episode"
          }
        />
      </div>
      <Metric
        label="Most recent"
        value={summary.mostRecent ? formatDateTime(summary.mostRecent.onsetAt) : "—"}
        href={summary.mostRecent ? `/episode/?id=${summary.mostRecent.id}` : undefined}
      />

      {empty ? (
        <Card title="Get started">
          <p className="text-sm text-muted">No episodes yet. Tap + to log your first flare-up; charts appear as you add data.</p>
        </Card>
      ) : (
        <>
          <Card title="Flare-ups per month">
            <MonthBars title="Flare-ups per month" data={trends.episodesByMonth.map((m) => ({ label: monthLabel(m.month), value: m.episodes }))} />
          </Card>

          <Card title="Most reported symptoms">
            {trends.symptomFrequency.length ? (
              <HBars data={trends.symptomFrequency.map((s) => ({ label: s.name, value: s.episodes }))} total={summary.total} />
            ) : (
              <p className="text-sm text-muted">No symptoms recorded yet.</p>
            )}
          </Card>

          <Card title="Reported exposures">
            {trends.exposureReports.length ? (
              <>
                <HBars data={trends.exposureReports.map((x) => ({ label: x.category, value: x.episodes }))} total={summary.total} />
                <p className="mt-4 text-xs text-muted">
                  How often each was noted alongside an episode. This is not evidence that any of them caused a flare-up.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">No exposures noted yet.</p>
            )}
          </Card>
        </>
      )}

      <Card
        title="Recent episodes"
        action={
          <Link href="/history/" className="flex min-h-11 items-center px-2 text-sm font-medium text-accent">
            See all
          </Link>
        }
      >
        {recent.length === 0 && <p className="text-sm text-muted">Nothing here yet.</p>}
        <ul className="divide-y divide-line">
          {recent.map((e) => (
            <EpisodeRow key={e.id} e={e} />
          ))}
        </ul>
      </Card>

    </main>
  );
}
