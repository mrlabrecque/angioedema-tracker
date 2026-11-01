"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";

interface DbCheck {
  tablesFound: number;
  tablesExpected: number;
  migrationsApplied: number | null;
  schemaComplete: boolean;
}

// Compact connection check (Phase 1 foundation status).
export default function SystemStatus() {
  const { session, clear } = useAuth();
  const [state, setState] = useState<"loading" | "error" | DbCheck>("loading");

  const run = useCallback(async () => {
    if (!session) return;
    setState("loading");
    try {
      setState(await api<DbCheck>("/api/system/db-check", { token: session.token }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return clear();
      setState("error");
    }
  }, [session, clear]);

  useEffect(() => {
    void run();
  }, [run]);

  const ok = typeof state === "object" && state.schemaComplete;
  return (
    <Card
      title="Connection"
      action={
        <button onClick={run} className="min-h-11 px-2 text-sm text-muted">
          Re-check
        </button>
      }
    >
      <p className={`text-sm ${state === "error" || (typeof state === "object" && !ok) ? "text-danger" : "text-muted"}`}>
        {state === "loading" && "Checking…"}
        {state === "error" && "Could not verify the database connection."}
        {typeof state === "object" &&
          `Database connected · ${state.tablesFound}/${state.tablesExpected} tables · ${state.migrationsApplied ?? "?"} migrations`}
      </p>
    </Card>
  );
}
