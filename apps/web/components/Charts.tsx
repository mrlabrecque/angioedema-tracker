// Simple, accessible bar charts. Every bar also shows its number as text.

export function MonthBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div role="img" aria-label={`Episodes per month: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
      <div className="flex h-32 items-end gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs text-muted">{d.value}</span>
            <div
              className="w-full rounded-t-md bg-accent"
              style={{ height: `${Math.max((d.value / max) * 100, d.value ? 6 : 2)}%`, opacity: d.value ? 1 : 0.25 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-xs text-muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HBars({ data, total }: { data: { label: string; value: number }[]; total: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="flex justify-between text-sm">
            <span>{d.label}</span>
            <span className="text-muted">
              {d.value} of {total}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-line" aria-hidden>
            <div className="h-2 rounded-full bg-accent" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
