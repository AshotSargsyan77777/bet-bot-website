import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearTokens, setTokens } from "../api/client";

type User = { id: number; username: string; email: string; is_admin: boolean };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api<User>("/api/me/");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!localStorage.getItem("access_token")) {
        setLoading(false);
        return;
      }
      await refreshMe();
      setLoading(false);
    })();
  }, [refreshMe]);

  const login = async (username: string, password: string) => {
    const data = await api<{ access: string; refresh: string }>("/api/auth/token/", {
      method: "POST",
      json: { username, password },
    });
    setTokens(data.access, data.refresh);
    await refreshMe();
  };

  const register = async (username: string, email: string, password: string) => {
    await api("/api/auth/register/", {
      method: "POST",
      json: { username, email, password },
    });
    await login(username, password);
  };

  const logout = () => {
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
