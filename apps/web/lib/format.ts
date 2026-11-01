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
