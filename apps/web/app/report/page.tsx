import { Suspense } from "react";
import ReportView from "@/components/ReportView";

export default function ReportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <ReportView />
    </Suspense>
  );
}
