"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AccessScreen from "@/components/AccessScreen";
import { AuthProvider, useAuth } from "@/lib/auth-context";

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-14 flex-1 items-center justify-center text-sm font-medium ${active ? "text-accent" : "text-muted"}`}
    >
      {label}
    </Link>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { session, logout } = useAuth();
  const path = usePathname() ?? "/";
  if (!session) return <AccessScreen />;
  const at = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-32">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Angioedema Tracker
        </Link>
        <button onClick={() => void logout()} className="h-11 rounded-xl px-3 text-sm font-medium text-muted">
          Lock
        </button>
      </header>
      {children}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-lg items-center px-2">
          <NavLink href="/" label="Overview" active={at("/")} />
          <NavLink href="/history/" label="History" active={at("/history")} />
          <Link
            href="/log/"
            className="mx-1 -mt-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-3xl font-light leading-none text-accent-ink shadow-lg"
            aria-label="Log a flare-up"
          >
            +
          </Link>
          <NavLink href="/trends/" label="Trends" active={at("/trends")} />
          <NavLink href="/settings/" label="Settings" active={at("/settings")} />
        </div>
      </nav>
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
