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

export function SpaceThemeProvider({ color, children }: { color: unknown; children: React.ReactNode }) {
  return <SpaceThemeContext.Provider value={paletteKey(color)}>{children}</SpaceThemeContext.Provider>;
}

export function useSpaceColors(kind: "car" | "home" | "grocery" | "expenses"): SpaceColors {
  const picked = useContext(SpaceThemeContext);
  const { isDark } = useTheme();
  return useMemo(() => spaceColors(picked ?? kind, isDark)!, [picked, kind, isDark]);
}
