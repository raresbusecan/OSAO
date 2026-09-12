import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken, getToken } from "../lib/api";

type User = { id: string; email: string; name: string; created_at: string } | null;
type Ctx = {
  user: User;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

 useEffect(() => {
  (async () => {
    try {
      const t = await getToken();

      if (!t) {
        return;
      }

      const me = await api.me();
      setUser(me);
    } catch (error: any) {
      // Only a real 401 means the token is actually invalid -- clear it and
      // send the user to /login. Anything else (no status at all: a timed
      // out fetch, a dropped tunnel connection, a 5xx) is the request not
      // making it through, not the session being invalid; wiping a perfectly
      // good token on a network hiccup silently logs the user out for no
      // reason. Leave the token in place so the next load/retry can still
      // use it -- `user` just stays null for this one render.
      if (error?.status === 401) {
        await clearToken();
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  })();
}, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    setUser(r.user);
  }, []);
  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const r = await api.register(email, password, name);
    setUser(r.user);
  }, []);
  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);