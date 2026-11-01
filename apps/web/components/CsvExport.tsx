"use client";

import { useEffect, useState } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PreparedFile, prepareFile, saveFile } from "@/lib/download";
import { localTimeZone } from "@/lib/format";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/**
 * Two steps on purpose: fetch the CSV (using the in-memory sign-in), then a second tap saves/shares it.
 * iPhone only allows sharing straight from a tap, and the fetch in between would use that up.
 */
export default function CsvExport({ query, filename, label = "Export CSV" }: { query: string; filename: string; label?: string }) {
  const { session, clear } = useAuth();
  const [state, setState] = useState<"idle" | "working" | "ready" | "error">("idle");
  const [file, setFile] = useState<PreparedFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // The prepared file reflects the query it was made with; drop it if the filters change.
  useEffect(() => {
    setFile((f) => {
      if (f) URL.revokeObjectURL(f.url);
      return null;
    });
    setState("idle");
    setMessage(null);
  }, [query]);

  async function prepare() {
    if (!session) return;
    setState("working");
    setMessage(null);
    try {
      const sep = query ? "&" : "";
      const res = await fetch(`${API_URL}/api/export/csv?${query}${sep}tz=${encodeURIComponent(localTimeZone())}`, {
        headers: { Authorization: `Bearer ${session.token}` },
        cache: "no-store",
        credentials: "omit",
      });
      if (res.status === 401) return clear();
      if (!res.ok) throw new ApiError(res.status, "export");
      setFile(prepareFile(await res.blob(), filename));
      setState("ready");
    } catch {
      setState("error");
      setMessage("Couldn’t prepare the export. Check your connection and try again.");
    }
  }

  async function save() {
    if (!file) return;
    const how = await saveFile(file);
    setMessage(how === "shared" ? "Choose “Save to Files” in the share sheet." : "Download started.");
  }

  return (
    <div className="space-y-2">
      {state !== "ready" ? (
        <button onClick={prepare} disabled={state === "working"} className={`${btnSecondary} w-full`}>
          {state === "working" ? "Preparing…" : label}
        </button>
      ) : (
        <button onClick={save} className={`${btnPrimary} w-full`}>
          Save {file?.name}
        </button>
      )}
      {message && (
        <p role="status" className={`text-xs ${state === "error" ? "text-danger" : "text-muted"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
