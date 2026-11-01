"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import EpisodeRow from "@/components/EpisodeRow";
import { Card, Chip, btnSecondary, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { endOfDayIso, startOfDayIso } from "@/lib/format";
import type { EpisodeSummary } from "@/lib/types";

type StatusFilter = "all" | "active" | "resolved";
const PAGE = 20;

export default function HistoryView() {
  const initial = useSearchParams().get("status");
  const { session, clear } = useAuth();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>(initial === "active" || initial === "resolved" ? initial : "all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [items, setItems] = useState<EpisodeSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (debouncedQ.trim()) p.set("q", debouncedQ.trim());
      if (status !== "all") p.set("status", status);
      if (from) p.set("from", startOfDayIso(from));
      if (to) p.set("to", endOfDayIso(to));
      return `/api/episodes?${p}`;
    },
    [debouncedQ, status, from, to],
  );

  useEffect(() => {
    if (!session) return;
    let stale = false;
    setItems(null);
    setError(false);
    api<{ items: EpisodeSummary[]; hasMore: boolean }>(query(0), { token: session.token })
      .then((r) => {
        if (stale) return;
        setItems(r.items);
        setHasMore(r.hasMore);
      })
      .catch((e) => {
        if (stale) return;
        if (e instanceof ApiError && e.status === 401) return clear();
        setError(true);
      });
    return () => {
      stale = true;
    };
  }, [session, query, clear]);

  async function more() {
    if (!session || !items) return;
    setLoadingMore(true);
    try {
      const r = await api<{ items: EpisodeSummary[]; hasMore: boolean }>(query(items.length), { token: session.token });
      setItems([...items, ...r.items]);
      setHasMore(r.hasMore);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = Boolean(debouncedQ.trim() || status !== "all" || from || to);

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search symptoms, notes, exposures, medications"
        aria-label="Search episodes"
        className={inputCls}
      />

      <div className="flex flex-wrap gap-2">
        {(["all", "active", "resolved"] as const).map((s) => (
          <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>
            {s[0]!.toUpperCase() + s.slice(1)}
          </Chip>
        ))}
      </div>

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
      {(from || to) && (
        <button
          onClick={() => {
            setFrom("");
            setTo("");
          }}
          className="min-h-11 text-sm text-muted underline"
        >
          Clear dates
        </button>
      )}

      <Card>
        {error && <p className="text-sm text-danger">Couldn’t load episodes. Change a filter or reload to retry.</p>}
        {!error && items === null && <p className="text-sm text-muted">Loading…</p>}
        {items?.length === 0 && (
          <p className="text-sm text-muted">{filtered ? "No episodes match these filters." : "No episodes recorded yet."}</p>
        )}
        <ul className="divide-y divide-line">
          {items?.map((e) => (
            <EpisodeRow key={e.id} e={e} />
          ))}
        </ul>
        {hasMore && (
          <button onClick={more} disabled={loadingMore} className={`${btnSecondary} mt-3 w-full`}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </Card>
    </main>
  );
}
