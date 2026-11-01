import { Suspense } from "react";
import EpisodeView from "@/components/EpisodeView";

// Static export cannot render runtime UUID routes, so the id is a query parameter.
export default function EpisodePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <EpisodeView />
    </Suspense>
  );
}
