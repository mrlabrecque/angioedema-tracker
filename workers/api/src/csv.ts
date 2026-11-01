// CSV building for exports. Kept free of runtime dependencies so it can be unit-tested.

/**
 * Quotes a cell for CSV. Values that start with a formula character (= + - @ tab CR) are prefixed
 * with an apostrophe so spreadsheet apps show them as text instead of running them as formulas.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(header: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 correctly; CRLF per RFC 4180.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** "2026-03-13 18:00" in the given IANA zone. */
export function localStamp(iso: Date | string | null, timeZone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

export const CSV_HEADER = [
  "Episode ID",
  "Onset (local)",
  "Resolved (local)",
  "Status",
  "Duration (minutes)",
  "Overall severity",
  "Symptoms",
  "Reported exposures",
  "Treatments",
  "Notes",
  "Onset (UTC)",
  "Resolved (UTC)",
  "Created (UTC)",
  "Updated (UTC)",
];
