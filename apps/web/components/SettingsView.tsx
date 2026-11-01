"use client";

import SystemStatus from "@/components/SystemStatus";
import { Card, btnSecondary } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

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
