import { Suspense } from "react";
import HistoryView from "@/components/HistoryView";

export default function HistoryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <HistoryView />
    </Suspense>
  );
}
