"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export interface AuthState {
  authed: boolean;
  uid?: string;
  email?: string | null;
  githubLogin?: string | null;
  hasInstallation?: boolean;
}

interface AuthContextValue {
  state: AuthState | null; // null while loading
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ state: null, refresh: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) {
        setState({ authed: false });
        return;
      }
      const data = (await res.json()) as AuthState;
      setState(data);
    } catch {
      setState({ authed: false });
    }
  }, []);

  useEffect(() => {
    // Fetch-in-effect is the correct pattern here — we want to sync from
    // an external system (our /api/me endpoint) into React state on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ state, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
