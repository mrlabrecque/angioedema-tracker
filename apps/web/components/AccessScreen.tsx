"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function formatWait(seconds: number) {
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 5400) return `${Math.ceil(seconds / 60)} minutes`;
  return `${Math.ceil(seconds / 3600)} hours`;
}

export default function AccessScreen() {
  const { login } = useAuth();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const remaining = lockedUntil ? Math.max(Math.ceil((lockedUntil - now) / 1000), 0) : 0;
  const locked = remaining > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || locked || !passphrase) return;
    setBusy(true);
    setError(null);
    try {
      await login(passphrase);
      setPassphrase("");
    } catch (err) {
      setPassphrase("");
      if (err instanceof ApiError && err.status === 429) {
        setLockedUntil(Date.now() + (err.retryAfterSeconds ?? 900) * 1000);
        setNow(Date.now());
        setError("Too many attempts.");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("That passphrase wasn’t recognized.");
      } else if (err instanceof ApiError && err.status === 0) {
        setError("Can’t reach the server. Check your connection and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Angioedema Tracker</h1>
      <p className="mt-2 text-muted">Private health log. Enter your passphrase to continue.</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Passphrase</span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy || locked}
            className="mt-1 h-12 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent disabled:opacity-60"
          />
        </label>

        <button
          type="submit"
          disabled={busy || locked || !passphrase}
          className="h-12 w-full rounded-xl bg-accent text-base font-semibold text-accent-ink disabled:opacity-50"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>

        <p role="alert" aria-live="polite" className="min-h-6 text-sm text-danger">
          {error}
          {locked && ` Try again in ${formatWait(remaining)}.`}
        </p>
      </form>

      <p className="mt-6 text-xs text-muted">
        Your passphrase is sent only to the private API and is never stored on this device.
      </p>
    </main>
  );
}
