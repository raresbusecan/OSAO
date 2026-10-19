import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken, getToken, setToken } from "../lib/api";
import { sessionVersion } from "@/lib/sessionCache";

/** email_verified_at: ISO string, or null while the registration email
 * hasn't been confirmed yet (see components/auth/VerifyEmailBanner.tsx).
 * Unverified users are NOT blocked -- the banner is only a reminder. */
type User = {
  id: string;
  email: string;
  name: string;
  created_at: string;
  email_verified_at?: string | null;
  /** Linked social providers ("apple" | "google" | "facebook"), read-only
   * list in Settings. Absent on older backends. */
  providers?: string[];
  /** false = social-only account (no usable password yet): Settings offers
   * "Setează o parolă" instead of the change-password sheet. */
  has_password?: boolean;
  /** First-use tours finished/skipped, by key (lib/tours.ts); null/absent = none. */
  tours?: Record<string, { status: "done" | "skipped"; v: number; at?: string }> | null;
} | null;

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
  /** Social login (lib/socialAuth.ts): the server already issued the
   * token -- store it and become that user. */
  signInWithToken: (user: any, token: string) => Promise<void>;
  /** Merges a patch into the current user without a round-trip to
   * /user -- for a Settings edit (name, later email) that already got
   * the updated fields back in its own response. */
  updateUser: (patch: Partial<NonNullable<User>>) => void;
  /** Re-reads GET /user (e.g. the email was verified on another device). */
  refreshUser: () => Promise<void>;
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
  const signInWithToken = useCallback(async (rawUser: any, token: string) => {
    await setToken(token);
    setUser(normalizeUser(rawUser));
  }, []);
  // The local session ends even when POST /logout fails (offline, or the
  // token was already revoked server-side -- a password reset revokes
  // every token, see app/(auth)/reset-password.tsx). api.logout() clears
  // the stored token after the request. A newer sign-in must also survive
  // a delayed native token deletion and the await before setUser(null).
  const signOut = useCallback(async () => {
    const version = sessionVersion();
    if (await api.logout() && sessionVersion() === version + 1) setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api.me();
    setUser(normalizeUser(me));
  }, []);

  const updateUser = useCallback((patch: Partial<NonNullable<User>>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  return (
    <AuthCtx.Provider key={user?.id ?? "signed-out"} value={{ user, loading, signIn, signUp, signOut, signInWithToken, updateUser, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
