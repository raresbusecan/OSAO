import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken, getToken } from "../lib/api";

type User = { id: string; email: string; name: string; created_at: string } | null;

// The backend's User model serializes `id` as a JSON number (Laravel
// doesn't know this app's User type promises a string) -- normalize it
// here, the one place a raw API user object becomes this app's `User`,
// so every comparison against it (e.g. Grocery's "is this me" checks
// against a list/item's createdBy/addedBy, both already strings) can
// rely on it actually being one instead of coincidentally working via
// each call site's own String(...) wrapping.
function normalizeUser(raw: any): User {
  if (!raw) return null;
  return { ...raw, id: String(raw.id) };
}
type Ctx = {
  user: User;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Merges a patch into the current user without a round-trip to
   * /user -- for a Settings edit (name, later email) that already got
   * the updated fields back in its own response. */
  updateUser: (patch: Partial<NonNullable<User>>) => void;
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
      setUser(normalizeUser(me));
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
    setUser(normalizeUser(r.user));
  }, []);
  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const r = await api.register(email, password, name);
    setUser(normalizeUser(r.user));
  }, []);
  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const updateUser = useCallback((patch: Partial<NonNullable<User>>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut, updateUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);