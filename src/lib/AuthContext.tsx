import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { base44, CurrentUser } from "@/api/base44Client";

type AuthCtx = {
  user: CurrentUser;
  loading: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(u => { setUser(u); setLoading(false); });
    const unsub = base44.auth.subscribe(() => { base44.auth.me().then(setUser); });
    return () => { unsub(); };
  }, []);

  const login = async (email: string, password: string) => {
    const u = await base44.auth.loginViaEmailPassword(email, password);
    setUser(u);
    return u;
  };
  const logout = async () => { await base44.auth.logout(); setUser(null); };
  const refresh = async () => { setUser(await base44.auth.me()); };

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
