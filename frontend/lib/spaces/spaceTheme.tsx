import React, { createContext, useContext, useMemo } from "react";

import { useTheme } from "@/lib/theme";
import { paletteKey, spaceColors, type SpaceColorKey, type SpaceColors } from "@/lib/spaces/spaceProfile";

/**
 * The colour of the space currently on screen. `[id].tsx` wraps the
 * whole space (dashboard, every sub-page, form and sheet -- RN Modals
 * keep React context) in a SpaceThemeProvider with the space's stored
 * `color`; the Car/Home profile forms wrap themselves with the colour
 * being picked, so the form previews it live.
 *
 * Inside a space, every identity-colour lookup is `useSpaceColors(kind)`:
 * the provider's picked colour if there is one, else that kind's default.
 * Outside any provider it is simply the kind default.
 */
const SpaceThemeContext = createContext<SpaceColorKey | null>(null);
type SpaceKind = "car" | "home" | "grocery" | "expenses";
const SpaceKindContext = createContext<SpaceKind | null>(null);

/** `kind` (optional) lets code that doesn't know which space it's in --
 * the screen background -- still find its colour when `color` is null
 * (= the kind's default). */
export function SpaceThemeProvider({ color, kind, children }: { color: unknown; kind?: string | null; children: React.ReactNode }) {
  const k = kind === "car" || kind === "home" || kind === "grocery" || kind === "expenses" ? kind : null;
  return (
    <SpaceThemeContext.Provider value={paletteKey(color)}>
      <SpaceKindContext.Provider value={k}>{children}</SpaceKindContext.Provider>
    </SpaceThemeContext.Provider>
  );
}

/** The current space's identity colour, or null outside any space. */
export function useSpaceTint(): string | null {
  const picked = useContext(SpaceThemeContext);
  const kind = useContext(SpaceKindContext);
  const { isDark } = useTheme();
  return useMemo(() => {
    const key = picked ?? kind;
    return key ? spaceColors(key, isDark)?.color ?? null : null;
  }, [picked, kind, isDark]);
}

export function useSpaceColors(kind: "car" | "home" | "grocery" | "expenses"): SpaceColors {
  const picked = useContext(SpaceThemeContext);
  const { isDark } = useTheme();
  return useMemo(() => spaceColors(picked ?? kind, isDark)!, [picked, kind, isDark]);
}
