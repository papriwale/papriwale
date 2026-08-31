import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ServerAuthSession = {
  role: string;
  name: string;
  avatar?: string | null;
  employee_id?: string;
  customer_id?: string;
  phone?: string;
  permissions?: Record<string, string>;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  session: ServerAuthSession | null;
  refreshAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function hasStoredSessionHint() {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("customerRole") || !!localStorage.getItem("adminRole");
}

async function fetchSession(): Promise<ServerAuthSession | null> {
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.role) return null;
    return data as ServerAuthSession;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<ServerAuthSession | null>(null);

  const refreshAuth = useCallback(async () => {
    setStatus("loading");
    const nextSession = await fetchSession();
    setSession(nextSession);
    setStatus(nextSession ? "authenticated" : "unauthenticated");
  }, []);

  useEffect(() => {
    if (!hasStoredSessionHint()) {
      setSession(null);
      setStatus("unauthenticated");
      return;
    }

    let alive = true;
    (async () => {
      const nextSession = await fetchSession();
      if (!alive) return;
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "unauthenticated");
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ status, session, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthSession() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuthSession must be used inside AuthProvider");
  }
  return value;
}
