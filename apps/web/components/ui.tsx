"use client";

import type { ReactNode } from "react";

export const inputCls =
  "h-12 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent disabled:opacity-60";
export const btnPrimary =
  "inline-flex h-12 items-center justify-center rounded-xl bg-accent px-5 text-base font-semibold text-accent-ink disabled:opacity-50";
export const btnSecondary =
  "inline-flex h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-base font-medium disabled:opacity-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-2 text-xs text-muted">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
        selected ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

export function SeverityPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2" role="group" aria-label="Severity 1 to 10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={`h-12 rounded-xl border text-base font-medium ${
            value === n ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: "active" | "resolved" | "unknown" }) {
  const cls =
    status === "active"
      ? "bg-danger/15 text-danger"
      : status === "resolved"
        ? "bg-accent/15 text-accent"
        : "bg-line text-muted";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${cls}`}>{status}</span>;
}
