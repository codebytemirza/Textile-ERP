import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi, type SessionUser } from "../api";
import { getToken, setToken } from "../api/client";

interface AuthContextType {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  demoCreds: { email: string; password: string };
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoCreds, setDemoCreds] = useState({ email: "admin@textileerp.com", password: "admin123" });

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await authApi.me();
        if (!cancelled) setUser(user);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const onUnauthorized = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener("erp:unauthorized", onUnauthorized);

    restore();
    authApi.demo().then((d) => {
      if (!cancelled) setDemoCreds(d);
    }).catch(() => {});

    return () => {
      cancelled = true;
      window.removeEventListener("erp:unauthorized", onUnauthorized);
    };
  }, []);

  const login = useCallback(async (email: string, pass: string) => {
    const res = await authApi.login(email, pass);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, pass: string, name: string) => {
    const res = await authApi.register(email, pass, name);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, demoCreds }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
