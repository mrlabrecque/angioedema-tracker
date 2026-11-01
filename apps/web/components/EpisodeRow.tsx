import Link from "next/link";
import { StatusBadge } from "@/components/ui";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { EpisodeSummary } from "@/lib/types";

export default function EpisodeRow({ e }: { e: EpisodeSummary }) {
  return (
    <li>
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
  );
}
