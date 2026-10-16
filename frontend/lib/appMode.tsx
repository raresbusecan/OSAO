import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * App mode: "full" = today's orgOS (every tab, card and page), "simple" =
 * orgOS Simplu, the future free tier (Acasă · + · Calendar, one simple
 * screen per space, a quick-add sheet). Every Simplu screen lives under
 * components/simple/ and is mounted by a branch at the top of its route
 * (home.tsx, calendar.tsx, [id].tsx) -- turning the mode off renders the
 * full app exactly as before.
 *
 * Where the mode comes from, in order:
 *  1. `entitlement` -- reserved for a server-side plan (e.g. user.plan from
 *     /user). Nothing sets it yet; when plans exist, AuthProvider (or this
 *     provider, reading useAuth) passes it in and it wins over the local
 *     test switch.
 *  2. the local test switch (Settings > "Mod Simplu (test)"), persisted on
 *     this device (SecureStore on native, localStorage on web -- the same
 *     storage lib/api.ts keeps the token in).
 *  3. default "full", so nothing changes until someone flips it.
 *
 * Read it with useAppMode(); never read the storage key directly.
 */
export type AppMode = "simple" | "full";

const STORAGE_KEY = "orgos_app_mode";

function readStored(): AppMode | null {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(STORAGE_KEY) : SecureStore.getItem(STORAGE_KEY);
    return raw === "simple" || raw === "full" ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(mode: AppMode) {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(STORAGE_KEY, mode);
    else SecureStore.setItemAsync(STORAGE_KEY, mode).catch(() => {});
  } catch {}
}

type AppModeValue = {
  mode: AppMode;
  isSimple: boolean;
  /** "plan" once a server entitlement drives the mode (then the local switch is ignored). */
  source: "plan" | "local" | "default";
  /** The local test switch. No-op for the effective mode while a plan decides it. */
  setMode: (mode: AppMode) => void;
};

const AppModeContext = createContext<AppModeValue>({
  mode: "full",
  isSimple: false,
  source: "default",
  setMode: () => {},
});

export function AppModeProvider({ entitlement, children }: { entitlement?: AppMode | null; children: React.ReactNode }) {
  // Read synchronously so a saved "simple" never flashes the full app first.
  const [local, setLocal] = useState<AppMode | null>(() => readStored());

  const setMode = useCallback((next: AppMode) => {
    setLocal(next);
    writeStored(next);
  }, []);

  const value = useMemo<AppModeValue>(() => {
    const mode: AppMode = entitlement ?? local ?? "full";
    return { mode, isSimple: mode === "simple", source: entitlement ? "plan" : local ? "local" : "default", setMode };
  }, [entitlement, local, setMode]);

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeValue {
  return useContext(AppModeContext);
}
