"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import SystemStatus from "@/components/SystemStatus";
import { Card, StatusBadge, btnPrimary } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { EpisodeSummary } from "@/lib/types";

export default function Home() {
  const { session, clear } = useAuth();
  const [items, setItems] = useState<EpisodeSummary[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setError(false);
    try {
      const r = await api<{ items: EpisodeSummary[] }>("/api/episodes?limit=20", { token: session.token });
      setItems(r.items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return clear();
      setError(true);
    }
  }, [session, clear]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="space-y-4">
      <Link href="/log/" className={`${btnPrimary} h-16 w-full text-lg`}>
        Log a flare-up
      </Link>

      <Card title="Recent episodes">
        {error && (
          <p className="text-sm text-danger">
            Couldn’t load episodes.{" "}
            <button onClick={load} className="underline">
              Retry
            </button>
          </p>
        )}
        {!error && items === null && <p className="text-sm text-muted">Loading…</p>}
        {items?.length === 0 && <p className="text-sm text-muted">No episodes recorded yet.</p>}
        <ul className="divide-y divide-line">
          {items?.map((e) => (
            <li key={e.id}>
              <Link href={`/episode/?id=${e.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{formatDateTime(e.onsetAt)}</p>
                  <p className="truncate text-sm text-muted">
                    {e.symptoms.length ? e.symptoms.map((s) => s.symptomType).join(", ") : "No symptoms recorded"}
                    {" · "}
                    {formatDuration(e.onsetAt, e.resolutionAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {e.overallSeverity !== null && <span className="text-sm text-muted">{e.overallSeverity}/10</span>}
                  <StatusBadge status={e.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <SystemStatus />
    </main>
  );
}
