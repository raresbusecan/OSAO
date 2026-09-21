import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

export type ThemeColors = {
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
  onSurfaceSecondary: string;
  surfaceTertiary: string;
  onSurfaceTertiary: string;
  surfaceInverse: string;
  onSurfaceInverse: string;
  brandPrimary: string;
  onBrandPrimary: string;
  brandSecondary: string;
  brandTertiary: string;
  success: string;
  /** A step below `warning` -- currently only the "45-31 days left"
   * document urgency tier (see CarDashboard.tsx's tierColor). Yellow,
   * where `warning` is already amber/orange. */
  caution: string;
  warning: string;
  error: string;
  info: string;
  border: string;
  borderStrong: string;
};

const light: ThemeColors = {
  surface: "#FFFFFF",
  onSurface: "#111111",
  surfaceSecondary: "#F7F7F7",
  onSurfaceSecondary: "#111111",
  surfaceTertiary: "#EAEAEA",
  onSurfaceTertiary: "#444444",
  surfaceInverse: "#111111",
  onSurfaceInverse: "#FFFFFF",
  brandPrimary: "#111111",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#444444",
  brandTertiary: "#EAEAEA",
  success: "#10B981",
  caution: "#FFD600",
  warning: "#F97316",
  error: "#DC2626",
  info: "#6B7280",
  border: "#E5E5E5",
  borderStrong: "#CCCCCC",
};

const dark: ThemeColors = {
  surface: "#0A0A0A",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1A1A1A",
  onSurfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#262626",
  onSurfaceTertiary: "#A3A3A3",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#111111",
  brandPrimary: "#FFFFFF",
  onBrandPrimary: "#111111",
  brandSecondary: "#A3A3A3",
  brandTertiary: "#262626",
  success: "#059669",
  caution: "#CCAB00",
  warning: "#EA580C",
  error: "#B91C1C",
  info: "#9CA3AF",
  border: "#262626",
  borderStrong: "#404040",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

/**
 * A fixed set of text styles, so a new component picks one of these
 * instead of inventing its own fontSize/fontWeight pair -- before this,
 * near-identical text (a row title here, a page title there) drifted to
 * slightly different sizes (13 vs 13.5 vs 14) purely because each
 * component was written separately, with no shared scale to pull from.
 * Spread directly into a Text style, e.g. `style={{ ...typography.title,
 * color: colors.onSurface }}` -- color is deliberately NOT included here
 * (that always comes from the theme's color tokens instead, so the same
 * typography role still works against any surface).
 */
export const typography = {
  /** Big numeric readouts -- a stat card's value, a total. */
  display: { fontSize: 26, fontWeight: "800" as const, letterSpacing: -0.5 },
  /** Page/space headers (e.g. "Documents", "Add Supply"). */
  title: { fontSize: 22, fontWeight: "800" as const, letterSpacing: -0.4 },
  /** Modal/sheet headers -- one size down from a full page title. */
  subtitle: { fontSize: 17, fontWeight: "800" as const },
  /** Primary row/list content -- a product name, a task title. */
  body: { fontSize: 14.5, fontWeight: "700" as const },
  /** Section headers ("DUE SOON", "RECENT") and field labels. */
  label: { fontSize: 12, fontWeight: "800" as const, letterSpacing: 0.4 },
  /** Secondary/muted text under a body line -- a subtitle, a date. */
  caption: { fontSize: 12, fontWeight: "500" as const },
  /** Smallest text -- badge counts, tiny inline hints. */
  micro: { fontSize: 11, fontWeight: "600" as const },
};

type Ctx = { colors: ThemeColors; isDark: boolean; spacing: typeof spacing; radius: typeof radius; typography: typeof typography };
const ThemeCtx = createContext<Ctx>({ colors: light, isDark: false, spacing, radius, typography });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const value = useMemo<Ctx>(
    () => ({ colors: isDark ? dark : light, isDark, spacing, radius, typography }),
    [isDark],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}