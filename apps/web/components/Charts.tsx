// Simple, accessible charts. Every bar also shows its number as text.
import type { ReactNode } from "react";

export interface BarDatum {
  label: string;
  value: number | null;
  display?: string;
}

export function MonthBars({
  data,
  max: fixedMax,
  title = "Value",
}: {
  data: BarDatum[];
  max?: number;
  title?: string;
}) {
  const max = fixedMax ?? Math.max(...data.map((d) => d.value ?? 0), 1);
  // Thin the axis labels so a long series stays readable on a phone.
  const dense = data.length > 12;
  // Space the axis labels by how much room they need (~36 characters fit across a phone).
  const longest = Math.max(...data.map((d) => d.label.length), 1);
  const step = Math.max(1, Math.ceil((data.length * longest) / 36));
  return (
    <div role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.display ?? d.value ?? "none"}`).join(", ")}`}>
      <div className={`flex h-32 items-end ${dense ? "gap-1" : "gap-2"}`}>
        {data.map((d, i) => (
          <div key={`${i}-${d.label}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            {!dense && <span className="text-xs text-muted">{d.value === null ? "—" : (d.display ?? d.value)}</span>}
            <div
              className="w-full rounded-t-md bg-accent"
              style={{
                height: d.value === null ? "2%" : `${Math.max((d.value / max) * 100, d.value ? 6 : 2)}%`,
                opacity: d.value ? 1 : 0.25,
              }}
              title={`${d.label}: ${d.display ?? d.value ?? "none"}`}
            />
          </div>
        ))}
      </div>
      <div className={`mt-1 flex ${dense ? "gap-1" : "gap-2"}`}>
        {data.map((d, i) => (
          <span key={`${i}-${d.label}`} className="flex min-w-0 flex-1 justify-center text-xs text-muted">
            <span className="shrink-0 whitespace-nowrap">{i % step === 0 ? d.label : ""}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function HBars({
  data,
  total,
  noun = "episodes",
}: {
  data: { label: string; value: number; note?: ReactNode }[];
  total: number;
  noun?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex justify-between gap-3 text-sm">
            <span>{d.label}</span>
            <span className="shrink-0 text-muted">
              {d.value} of {total}
              {noun === "episodes" ? "" : ` ${noun}`}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-line" aria-hidden>
            <div className="h-2 rounded-full bg-accent" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          {d.note && <p className="mt-1 text-xs text-muted">{d.note}</p>}
        </li>
      ))}
    </ul>
  );
}
