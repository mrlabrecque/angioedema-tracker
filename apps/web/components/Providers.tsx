"use client";

import Link from "next/link";
import AccessScreen from "@/components/AccessScreen";
import { AuthProvider, useAuth } from "@/lib/auth-context";

function Frame({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuth();
  if (!session) return <AccessScreen />;
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-16">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Angioedema Tracker
        </Link>
        <button onClick={() => void logout()} className="h-11 rounded-xl px-3 text-sm font-medium text-muted">
          Lock
        </button>
      </header>
      {children}
    </div>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Frame>{children}</Frame>
    </AuthProvider>
  );
}
