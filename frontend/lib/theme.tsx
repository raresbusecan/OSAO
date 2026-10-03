import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

export type ThemeColors = {
  /** Page background -- the lowest of the 3 surface layers. */
  surface: string;
  onSurface: string;
  /** Card layer -- one step up from the page (cards, list groups). */
  surfaceSecondary: string;
  onSurfaceSecondary: string;
  /** Raised layer -- inputs, chips, icon wells, active segment. */
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
  /** Unchecked checkbox rings / radio outlines -- a control boundary,
   * so it must clear WCAG 1.4.11's 3:1 against the card layer, which
   * `borderStrong` (a decorative hairline) doesn't. */
  control: string;
  /** Segmented filter: the track, and the selected segment on it. */
  segmentTrack: string;
  segmentActive: string;
};

/* 2026-10 redesign (see DESIGN.md): three distinct surface layers instead
 * of one flat color with hairline outlines -- page -> card -> raised --
 * on a blue-graphite base rather than pure black. Color itself comes
 * from each Space's identity color (SPACE_IDENTITY_COLORS), not from a
 * single app-wide accent; the semantic gain/loss pair is the green/red
 * convention from finance apps. Every value stays 6-digit hex: several
 * call sites append a 2-digit alpha suffix (`${color}1A`). Light-mode
 * semantic colors are the deeper shades that still pass 4.5:1 as text
 * on white (and on their own 12% chip tint). Rules: frontend/CLAUDE.md
 * "Theme (2026-10 redesign)"; mockup: the "orgOS redesign" canvas. */

const light: ThemeColors = {
  surface: "#F3F5F8",
  onSurface: "#12161D",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#3D4553",
  surfaceTertiary: "#E9EDF2",
  onSurfaceTertiary: "#5B6474",
  surfaceInverse: "#12161D",
  onSurfaceInverse: "#FFFFFF",
  brandPrimary: "#12161D",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#5B6474",
  brandTertiary: "#E9EDF2",
  success: "#047857",
  caution: "#A16207",
  warning: "#C2410C",
  error: "#C81E3A",
  info: "#5B6474",
  border: "#E1E5EB",
  borderStrong: "#C9CFD8",
  control: "#8B93A3",
  segmentTrack: "#E9EDF2",
  segmentActive: "#FFFFFF",
};

const dark: ThemeColors = {
  surface: "#0F1218",
  onSurface: "#EDF0F5",
  surfaceSecondary: "#171B23",
  onSurfaceSecondary: "#B9C0CD",
  surfaceTertiary: "#20252F",
  onSurfaceTertiary: "#8B93A3",
  surfaceInverse: "#EDF0F5",
  onSurfaceInverse: "#0F1218",
  brandPrimary: "#EDF0F5",
  onBrandPrimary: "#0F1218",
  brandSecondary: "#8B93A3",
  brandTertiary: "#20252F",
  success: "#2EBD85",
  caution: "#E3B341",
  warning: "#F7A14A",
  error: "#F6465D",
  info: "#8B93A3",
  border: "#232834",
  borderStrong: "#2F3542",
  control: "#646C7D",
  segmentTrack: "#171B23",
  segmentActive: "#262C38",
};

/** `gutter` = page side padding, `section` = gap between a page's
 * sections (the redesign's two layout constants). */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, section: 20, xl: 24, "2xl": 32, "3xl": 48 };
/** `card` = list groups/tiles, `control` = inputs and buttons, `inner` =
 * a segment inside a 12-radius track (concentric with 4px padding). */
export const radius = { sm: 6, inner: 8, md: 12, control: 14, card: 16, lg: 20, pill: 999 };

/** IBM Plex Sans, one file per weight (loaded in app/_layout.tsx). A
 * custom font on native doesn't pick a weight from `fontWeight` -- each
 * weight is its own family name. lib/globalFont.*.ts maps every Text's
 * fontWeight onto the right file automatically, so components keep
 * writing plain `fontWeight`; fw() is only for a style that must name
 * its family explicitly. */
export const fonts = {
  "400": "IBMPlexSans_400Regular",
  "500": "IBMPlexSans_500Medium",
  "600": "IBMPlexSans_600SemiBold",
} as const;

export type FontWeight = keyof typeof fonts;

/** `{ fontFamily }` for a weight -- spread into a Text style:
 * `style={{ fontSize: 15, ...fw("600") }}`. The redesign uses only
 * 400/500/600, so every heavier legacy weight ("700"/"800"/"900") lands
 * on SemiBold -- older screens get the lighter hierarchy for free. */
export function fw(weight: string | number = "400"): { fontFamily: string } {
  const w = Number(weight);
  const key: FontWeight = w >= 600 ? "600" : w >= 500 ? "500" : "400";
  return { fontFamily: fonts[key] };
}

/**
 * A fixed set of text styles, so a new component picks one of these
 * instead of inventing its own fontSize/fontWeight pair. Spread directly
 * into a Text style, e.g. `style={{ ...typography.title, color:
 * colors.onSurface }}` -- color is deliberately NOT included here (that
 * always comes from the theme's color tokens instead, so the same
 * typography role still works against any surface).
 *
 * Weight is spent on the biggest text only: numbers and titles are
 * SemiBold, row text Medium, everything secondary Regular.
 */
export const typography = {
  /** The one headline number on a page (Home's month total). */
  hero: { fontSize: 40, fontWeight: "600" as const, letterSpacing: -1.2 },
  /** Big numeric readouts -- a hero card's value (odometer, a total). */
  display: { fontSize: 36, fontWeight: "600" as const, letterSpacing: -1 },
  /** Page titles and Space names. */
  largeTitle: { fontSize: 28, fontWeight: "600" as const, letterSpacing: -0.6 },
  /** Greeting / sub-page headers. */
  title: { fontSize: 24, fontWeight: "600" as const, letterSpacing: -0.4 },
  /** Section headers, sheet titles one size down. */
  subtitle: { fontSize: 17, fontWeight: "600" as const },
  /** Primary row/list content -- a product name, a task title. */
  body: { fontSize: 15, fontWeight: "500" as const },
  /** Section headers and field labels -- sentence case, not caps. */
  label: { fontSize: 13, fontWeight: "500" as const },
  /** Secondary/muted text under a body line -- a subtitle, a date. */
  caption: { fontSize: 13, fontWeight: "400" as const },
  /** Urgency/status chips. */
  chip: { fontSize: 12, fontWeight: "600" as const },
  /** Smallest text -- badge counts, tiny inline hints. */
  micro: { fontSize: 11, fontWeight: "500" as const },
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
