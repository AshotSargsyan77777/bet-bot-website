import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, clearTokens, getRefreshToken, getToken, setTokens } from "../api/client";

export type User = {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  is_vip: boolean;
  date_joined?: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      setUser(await api<User>("/api/me/"));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (getToken() || getRefreshToken()) await refreshMe();
      setLoading(false);
    })();
    const onForcedLogout = () => {
      setUser(null);
      qc.clear();
    };
    window.addEventListener("auth:logout", onForcedLogout);
    return () => window.removeEventListener("auth:logout", onForcedLogout);
  }, [refreshMe, qc]);

  const login = async (username: string, password: string) => {
    const data = await api<{ access: string; refresh: string }>("/api/auth/token/", {
      method: "POST",
      json: { username: username.trim(), password },
      auth: false,
    });
    setTokens(data.access, data.refresh);
    qc.clear();
    await refreshMe();
  };

  const register = async (username: string, email: string, password: string) => {
    await api("/api/auth/register/", {
      method: "POST",
      json: { username: username.trim(), email: email.trim(), password },
      auth: false,
    });
    await login(username, password);
  };

  const logout = async () => {
    const refresh = getRefreshToken();
    clearTokens();
    setUser(null);
    qc.clear();
    if (refresh) {
      await api("/api/auth/logout/", { method: "POST", json: { refresh }, auth: false }).catch(() => undefined);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
