"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface DbCheck {
  database: "ok";
  tablesExpected: number;
  tablesFound: number;
  migrationsApplied: number | null;
  schemaComplete: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: DbCheck }
  | { kind: "error"; message: string };

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span>{label}</span>
      <span className={ok ? "text-accent" : "text-danger"}>
        {ok ? "OK" : "Problem"}
        {detail ? ` · ${detail}` : ""}
      </span>
    </li>
  );
}

// Phase 1 stand-in for the dashboard: proves auth + API + database work end to end.
export default function SystemStatus() {
  const { session, logout, clear } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  const run = useCallback(async () => {
    if (!session) return;
    setState({ kind: "loading" });
    try {
      const data = await api<DbCheck>("/api/system/db-check", { token: session.token });
      setState({ kind: "ok", data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return clear();
      setState({ kind: "error", message: "Could not verify the database connection." });
    }
  }, [session, clear]);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Foundation status</h1>
      <p className="mt-2 text-muted">
        Setup check only. Episode logging arrives in the next phase.
      </p>

      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface px-4">
        <Row
          label="Signed in"
          ok
          detail={session ? `until ${new Date(session.expiresAt).toLocaleTimeString()}` : undefined}
        />
        {state.kind === "loading" && <li className="py-3 text-muted">Checking database…</li>}
        {state.kind === "error" && <Row label="Database" ok={false} detail={state.message} />}
        {state.kind === "ok" && (
          <>
            <Row label="Database connection" ok />
            <Row
              label="Schema"
              ok={state.data.schemaComplete}
              detail={`${state.data.tablesFound}/${state.data.tablesExpected} tables`}
            />
            <Row
              label="Migrations"
              ok={(state.data.migrationsApplied ?? 0) > 0}
              detail={state.data.migrationsApplied === null ? "unknown" : String(state.data.migrationsApplied)}
            />
          </>
        )}
      </ul>

      <div className="mt-6 flex gap-3">
        <button onClick={run} className="h-12 flex-1 rounded-xl border border-line bg-surface font-medium">
          Re-check
        </button>
        <button onClick={() => void logout()} className="h-12 flex-1 rounded-xl bg-accent font-semibold text-accent-ink">
          Lock
        </button>
      </div>
    </main>
  );
}
