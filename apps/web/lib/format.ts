const pad = (n: number) => String(n).padStart(2, "0");

/** Value for <input type="datetime-local"> in the viewer's local time. */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (s: string) => new Date(s).toISOString();

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatDuration(startIso: string, endIso: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const mins = Math.max(Math.round((end - new Date(startIso).getTime()) / 60000), 0);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} h ${mins % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export const RELATIONSHIP_LABEL = {
  unknown: "Unknown",
  possible: "Possible",
  suspected: "Suspected",
  confirmed_by_clinician: "Confirmed by clinician",
} as const;

export const RESPONSE_LABEL = {
  none: "No response",
  partial: "Partial",
  significant: "Significant",
  complete: "Complete",
  unknown: "Unknown",
} as const;

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} h ${mins % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export const startOfDayIso = (d: string) => new Date(`${d}T00:00:00`).toISOString();
export const endOfDayIso = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

export const monthLabel = (ym: string) =>
  new Date(`${ym}-01T12:00:00`).toLocaleDateString(undefined, { month: "short" });

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Compact duration for chart labels: 45m, 2.5h, 3d. */
export function shortDuration(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = mins / 60;
  if (h < 48) return `${Number(h.toFixed(1))}h`;
  return `${Number((h / 24).toFixed(1))}d`;
}

export function bucketLabel(start: string, unit: "week" | "month" | "year", spansYears: boolean): string {
  const d = new Date(`${start}T12:00:00`);
  if (unit === "year") return String(d.getFullYear());
  if (unit === "week") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const m = d.toLocaleDateString(undefined, { month: "short" });
  return spansYears ? `${m} ’${String(d.getFullYear()).slice(2)}` : m;
}
