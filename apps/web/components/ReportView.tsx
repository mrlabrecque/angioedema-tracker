"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { btnPrimary } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { RELATIONSHIP_LABEL, RESPONSE_LABEL, formatDateTime, formatDuration, formatMinutes } from "@/lib/format";
import type { EpisodeDetail } from "@/lib/types";

interface Report {
  generatedAt: string;
  range: { from: string | null; to: string | null; id: string | null };
  episodes: EpisodeDetail[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

export default function ReportView() {
  const params = useSearchParams();
  const { session, clear } = useAuth();
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState(false);

  const query = params.toString();
  useEffect(() => {
    if (!session) return;
    setData(null);
    setError(false);
    api<Report>(`/api/export/report${query ? `?${query}` : ""}`, { token: session.token })
      .then(setData)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) return clear();
        setError(true);
      });
  }, [session, query, clear]);

  if (error) return <p className="text-sm text-danger">Couldn’t load the report. Go back and try again.</p>;
  if (!data) return <p className="text-sm text-muted">Preparing report…</p>;

  const eps = data.episodes;
  const resolved = eps.filter((e) => e.resolutionAt);
  const avg = resolved.length
    ? Math.round(resolved.reduce((n, e) => n + (Date.parse(e.resolutionAt!) - Date.parse(e.onsetAt)) / 60000, 0) / resolved.length)
    : null;
  const range = data.range.id
    ? "Single episode"
    : eps.length
      ? `${day(eps[0]!.onsetAt)} – ${day(eps[eps.length - 1]!.onsetAt)}`
      : "No episodes in range";

  return (
    <main className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/settings/" className="inline-flex min-h-11 items-center text-sm text-muted">
          ← Back
        </Link>
        <button onClick={() => window.print()} className={`${btnPrimary} px-4`}>
          Print / Save as PDF
        </button>
      </div>
      <p className="text-xs text-muted print:hidden">
        On iPhone: tap Share, then Print, then pinch the preview open to save it as a PDF.
      </p>

      <header className="border-b border-line pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Angioedema log</h1>
        <p className="mt-1 text-sm text-muted">
          {range} · {eps.length} {eps.length === 1 ? "episode" : "episodes"}
          {avg !== null && ` · average duration ${formatMinutes(avg)} (${resolved.length} resolved)`}
        </p>
        <p className="mt-1 text-xs text-muted">Generated {formatDateTime(data.generatedAt)}</p>
      </header>

      {eps.map((e) => (
        <article key={e.id} className="break-inside-avoid space-y-2 border-b border-line pb-4 text-sm">
          <h2 className="text-base font-semibold">
            {formatDateTime(e.onsetAt)}
            <span className="ml-2 text-xs font-normal capitalize text-muted">{e.status}</span>
          </h2>
          <p className="text-muted">
            {e.resolutionAt ? `Resolved ${formatDateTime(e.resolutionAt)} · ${formatDuration(e.onsetAt, e.resolutionAt)}` : "No resolution recorded"}
            {e.overallSeverity !== null && ` · overall severity ${e.overallSeverity}/10`}
          </p>
          {e.symptoms.length > 0 && (
            <div>
              <p className="font-medium">Symptoms</p>
              <ul className="list-disc pl-5">
                {e.symptoms.map((s) => (
                  <li key={s.id}>
                    {s.symptomType}
                    {s.bodyLocation && ` — ${s.bodyLocation}`}, severity {s.severity}/10{s.notes && ` (${s.notes})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {e.exposures.length > 0 && (
            <div>
              <p className="font-medium">Reported exposures</p>
              <ul className="list-disc pl-5">
                {e.exposures.map((x) => (
                  <li key={x.id}>
                    {x.exposureCategory}
                    {x.exposureDescription && `: ${x.exposureDescription}`} — {RELATIONSHIP_LABEL[x.suspectedRelationship].toLowerCase()}
                    {x.exposureTime && ` (${formatDateTime(x.exposureTime)})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {e.treatments.length > 0 && (
            <div>
              <p className="font-medium">Treatments</p>
              <ul className="list-disc pl-5">
                {e.treatments.map((t) => (
                  <li key={t.id}>
                    {t.medicationName}
                    {t.dosage && ` ${t.dosage}`} — {formatDateTime(t.administrationTime)}, response: {RESPONSE_LABEL[t.response].toLowerCase()}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {e.generalNotes && <p className="whitespace-pre-wrap text-muted">{e.generalNotes}</p>}
        </article>
      ))}

      <footer className="text-xs text-muted">
        Personal tracking record, not a medical document. Exposures are what was reported alongside an episode; they are not confirmed
        causes unless marked “confirmed by clinician”.
      </footer>
    </main>
  );
}
