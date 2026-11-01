"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CsvExport from "@/components/CsvExport";
import SystemStatus from "@/components/SystemStatus";
import { endOfDayIso, startOfDayIso } from "@/lib/format";
import { btnSecondary as secondary, inputCls } from "@/components/ui";
import { Card, btnSecondary } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

function InstallCard() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
  }, []);
  return (
    <Card title="Install on your iPhone">
      {installed ? (
        <p className="text-sm text-muted">Installed: you’re using the home-screen app.</p>
      ) : (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Open this page in Safari.</li>
          <li>Tap the Share button, then “Add to Home Screen”.</li>
          <li>Open the new icon. It runs full-screen like an app.</li>
        </ol>
      )}
      <p className="mt-3 text-xs text-muted">
        Only the app’s screens are stored for offline use. Your records are never saved on the phone, so without a connection you can open
        the app but not see or save entries.
      </p>
    </Card>
  );
}

function ExportCard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const p = new URLSearchParams();
  if (from) p.set("from", startOfDayIso(from));
  if (to) p.set("to", endOfDayIso(to));
  const q = p.toString();
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <Card title="Export your history">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-muted">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className="block text-xs text-muted">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">Leave both blank to export everything.</p>
      <div className="mt-3 space-y-3">
        <CsvExport query={q} filename={`angioedema-log-${stamp}.csv`} label="Export spreadsheet (CSV)" />
        <Link href={`/report/${q ? `?${q}` : ""}`} className={`${secondary} w-full`}>
          Open printable report
        </Link>
      </div>
    </Card>
  );
}

export default function SettingsView() {
  const { session, logout } = useAuth();
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card title="Session">
        <p className="text-sm text-muted">
          You’re signed in until {session ? new Date(session.expiresAt).toLocaleString() : "—"}. The sign-in lives only in memory, so
          closing or reloading the app locks it.
        </p>
        <button onClick={() => void logout()} className={`${btnSecondary} mt-3 w-full`}>
          Lock now
        </button>
      </Card>

      <ExportCard />

      <InstallCard />

      <SystemStatus />

      <Card title="Privacy">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Your records live only in your private database and are never cached on this device.</li>
          <li>Changing the passphrase or signing out every device is done from the project’s setup docs (docs/security.md).</li>
        </ul>
      </Card>

      <Card title="About">
        <p className="text-sm text-muted">
          This is a personal tracking tool. It does not diagnose, treat, or recommend treatment. Patterns shown here are descriptive and are
          not proof that anything caused a flare-up. Share your history with your clinician for medical advice.
        </p>
      </Card>
    </main>
  );
}
