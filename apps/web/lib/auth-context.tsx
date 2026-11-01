"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

interface Session {
  token: string;
  expiresAt: number;
}

interface AuthValue {
  session: Session | null;
  login: (passphrase: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Drops the in-memory token without calling the API (e.g. after a 401). */
  clear: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

// The token lives only in React state: never localStorage, sessionStorage, or cookies.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setSession(null);
  }, []);

  const login = useCallback(
    async (passphrase: string) => {
      const res = await api<{ token: string; expiresAt: number }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ passphrase }),
      });
      setSession({ token: res.token, expiresAt: res.expiresAt });
    },
    [],
  );

  const logout = useCallback(async () => {
    const token = session?.token;
    clear();
    if (token) await api("/api/auth/logout", { method: "POST", token }).catch(() => {});
  }, [session, clear]);

  useEffect(() => {
    if (!session) return;
    const ms = Math.max(session.expiresAt - Date.now(), 0);
    timer.current = setTimeout(clear, ms);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [session, clear]);

  const value = useMemo(() => ({ session, login, logout, clear }), [session, login, logout, clear]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
