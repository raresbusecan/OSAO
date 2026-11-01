import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Platform, type ViewStyle } from "react-native";
import * as SecureStore from "expo-secure-store";

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

/* "Miez de noapte": pure black for OLED screens, same semantics as dark. */
const midnight: ThemeColors = {
  ...dark,
  surface: "#000000",
  onSurface: "#F2F2F5",
  surfaceSecondary: "#0E0E12",
  onSurfaceSecondary: "#B8B8C2",
  surfaceTertiary: "#1A1A20",
  onSurfaceTertiary: "#8E8E99",
  surfaceInverse: "#F2F2F5",
  onSurfaceInverse: "#000000",
  brandPrimary: "#F2F2F5",
  onBrandPrimary: "#000000",
  brandSecondary: "#8E8E99",
  brandTertiary: "#1A1A20",
  info: "#8E8E99",
  border: "#1C1C22",
  borderStrong: "#2A2A32",
  control: "#64646F",
  segmentTrack: "#0E0E12",
  segmentActive: "#222229",
};

/* "Nisip": a warm light theme. onSurfaceTertiary is one step deeper than
 * the obvious taupe so it still clears 4.5:1 on surfaceTertiary. */
const sand: ThemeColors = {
  ...light,
  surface: "#F4EFE6",
  onSurface: "#2A2117",
  surfaceSecondary: "#FFFDF8",
  onSurfaceSecondary: "#4A3F31",
  surfaceTertiary: "#EAE2D3",
  onSurfaceTertiary: "#645847",
  surfaceInverse: "#2A2117",
  onSurfaceInverse: "#FFFDF8",
  brandPrimary: "#2A2117",
  onBrandPrimary: "#FFFDF8",
  brandSecondary: "#645847",
  brandTertiary: "#EAE2D3",
  info: "#645847",
  border: "#E6DDCC",
  borderStrong: "#D3C7B1",
  control: "#8E816D",
  segmentTrack: "#EAE2D3",
  segmentActive: "#FFFDF8",
};

/** Every selectable theme (Settings > Temă). A new theme = one entry
 * here; `isDark` decides the Space colour variants and the status bar. */
export const THEMES = [
  { id: "graphite", label: "Grafit", description: "Întunecat", isDark: true, colors: dark },
  { id: "paper", label: "Hârtie", description: "Deschis, tema implicită", isDark: false, colors: light },
  { id: "midnight", label: "Miez de noapte", description: "Negru pur, pentru ecrane OLED", isDark: true, colors: midnight },
  { id: "sand", label: "Nisip", description: "Deschis și cald", isDark: false, colors: sand },
] as const satisfies readonly { id: string; label: string; description: string; isDark: boolean; colors: ThemeColors }[];

export type ThemeId = (typeof THEMES)[number]["id"];
/** Hârtie unless the user picked another one. The app does NOT follow the
 * phone's light/dark setting (the old "Automat" option was removed). */
export const DEFAULT_THEME: ThemeId = "paper";

const STORAGE_KEY = "orgos_theme";

function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

// Read synchronously (like lib/i18n's language) so the first frame is
// already in the chosen theme. A stored "auto" from before falls back here.
function readStored(): ThemeId {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(STORAGE_KEY) : SecureStore.getItem(STORAGE_KEY);
    return isThemeId(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function writeStored(pref: ThemeId) {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(STORAGE_KEY, pref);
    else SecureStore.setItemAsync(STORAGE_KEY, pref).catch(() => {});
  } catch {}
}

/** How cards look, set with three sliders in Settings > Carduri. Each 0..1:
 * `bulge` = light edge on top + soft drop shadow (the card looks raised),
 * `opacity` = how solid the card fill is (1 = fully opaque),
 * `liquid` = glass look: a bright rim, a lighter tint, a dark lower edge. */
export type CardStyle = { bulge: number; opacity: number; liquid: number };
export const DEFAULT_CARD_STYLE: CardStyle = { bulge: 0.5, opacity: 1, liquid: 0 };

const CARD_STORAGE_KEY = "orgos_card_style";
const clamp01 = (n: unknown, fallback: number) => (typeof n === "number" && isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback);

function readCardStyle(): CardStyle {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(CARD_STORAGE_KEY) : SecureStore.getItem(CARD_STORAGE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return {
      bulge: clamp01(v?.bulge, DEFAULT_CARD_STYLE.bulge),
      opacity: Math.max(0.4, clamp01(v?.opacity, DEFAULT_CARD_STYLE.opacity)),
      liquid: clamp01(v?.liquid, DEFAULT_CARD_STYLE.liquid),
    };
  } catch {
    return DEFAULT_CARD_STYLE;
  }
}

function writeCardStyle(s: CardStyle) {
  try {
    const raw = JSON.stringify(s);
    if (Platform.OS === "web") globalThis.localStorage?.setItem(CARD_STORAGE_KEY, raw);
    else SecureStore.setItemAsync(CARD_STORAGE_KEY, raw).catch(() => {});
  } catch {}
}

/** Shape of the whole app, set in Settings > Aspect. `roundness` 0..1
 * scales every `radius` token (0.5 = the designed values); `density`
 * scales every `spacing` token. Both reach every screen through
 * useTheme(), since no file imports spacing/radius directly. */
export type Density = "compact" | "normal" | "airy";
export type Layout = { roundness: number; density: Density };
export const DEFAULT_LAYOUT: Layout = { roundness: 0.5, density: "normal" };
const DENSITY_SCALE: Record<Density, number> = { compact: 0.8, normal: 1, airy: 1.2 };

const LAYOUT_STORAGE_KEY = "orgos_layout";

function readLayout(): Layout {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(LAYOUT_STORAGE_KEY) : SecureStore.getItem(LAYOUT_STORAGE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return {
      roundness: clamp01(v?.roundness, DEFAULT_LAYOUT.roundness),
      density: v?.density in DENSITY_SCALE ? v.density : DEFAULT_LAYOUT.density,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function writeLayout(l: Layout) {
  try {
    const raw = JSON.stringify(l);
    if (Platform.OS === "web") globalThis.localStorage?.setItem(LAYOUT_STORAGE_KEY, raw);
    else SecureStore.setItemAsync(LAYOUT_STORAGE_KEY, raw).catch(() => {});
  } catch {}
}

/** 0 -> a quarter of each designed radius, 0.5 -> as designed, 1 -> 1.75x.
 * `pill` stays fully round. */
export function scaledRadius(roundness: number): typeof radius {
  const f = 0.25 + 1.5 * roundness;
  const out = { ...radius };
  for (const k of Object.keys(radius) as (keyof typeof radius)[]) if (k !== "pill") out[k] = Math.round(radius[k] * f);
  return out;
}

export function scaledSpacing(density: Density): typeof spacing {
  const f = DENSITY_SCALE[density];
  const out = { ...spacing };
  for (const k of Object.keys(spacing) as (keyof typeof spacing)[]) out[k] = Math.round(spacing[k] * f);
  return out;
}

const rgbOf = (hex: string) => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The fill, rim and shadows of one card for a CardStyle. No border and
 * no padding -- everything is drawn with boxShadow (inset for the rim and
 * the light edge), so moving a slider never shifts a card's layout. */
export function cardSurface(colors: ThemeColors, isDark: boolean, s: CardStyle, base: string = colors.surfaceSecondary): ViewStyle {
  const { bulge: b, liquid: l } = s;
  // Glass lifts a dark card toward white a little; a light one is white already.
  const glassLift = isDark ? 0.07 * l : 0;
  const [br, bg, bb] = rgbOf(base).map((c) => Math.round(c + (255 - c) * glassLift));
  const shadows: string[] = [];
  const edge = isDark ? 0.08 * b + 0.14 * l : 0.6 * b + 0.9 * l;
  if (edge > 0) shadows.push(`inset 0 1px 0 rgba(255,255,255,${r3(Math.min(1, edge))})`);
  if (l > 0) {
    shadows.push(`inset 0 0 0 1px rgba(255,255,255,${r3(isDark ? 0.03 + 0.09 * l : 0.3 + 0.5 * l)})`);
    shadows.push(`inset 0 -1px 0 rgba(0,0,0,${r3((isDark ? 0.3 : 0.05) * l)})`);
  }
  if (b > 0) {
    const ink = isDark ? "0,0,0" : "16,24,40";
    if (!isDark) shadows.push(`0 1px 2px rgba(${ink},${r3(0.06 * b)})`);
    shadows.push(`0 ${Math.round(2 + 10 * b)}px ${Math.round(6 + 26 * b)}px rgba(${ink},${r3(isDark ? 0.15 + 0.35 * b : 0.03 + 0.1 * b)})`);
  }
  return {
    backgroundColor: `rgba(${br},${bg},${bb},${r3(s.opacity)})`,
    ...(shadows.length ? { boxShadow: shadows.join(", ") } : null),
  };
}

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

type Ctx = {
  colors: ThemeColors;
  isDark: boolean;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  cardStyle: CardStyle;
  setCardStyle: (s: CardStyle) => void;
  /** cardSurface() for the current theme + cardStyle: spread it into any
   * card container on the page (`style={{ ...card, borderRadius: ... }}`)
   * instead of `backgroundColor: colors.surfaceSecondary`. */
  card: ViewStyle;
  layout: Layout;
  setLayout: (l: Layout) => void;
  /** Already scaled by `layout.density`. */
  spacing: typeof spacing;
  /** Already scaled by `layout.roundness`. */
  radius: typeof radius;
  typography: typeof typography;
};
const ThemeCtx = createContext<Ctx>({
  colors: light,
  isDark: false,
  themeId: DEFAULT_THEME,
  setThemeId: () => {},
  cardStyle: DEFAULT_CARD_STYLE,
  setCardStyle: () => {},
  card: { backgroundColor: light.surfaceSecondary },
  layout: DEFAULT_LAYOUT,
  setLayout: () => {},
  spacing,
  radius,
  typography,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(readStored);
  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    writeStored(id);
  }, []);
  const [cardStyle, setCardStyleState] = useState<CardStyle>(readCardStyle);
  const setCardStyle = useCallback((s: CardStyle) => {
    setCardStyleState(s);
    writeCardStyle(s);
  }, []);
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const setLayout = useCallback((l: Layout) => {
    setLayoutState(l);
    writeLayout(l);
  }, []);
  const scaled = useMemo(
    () => ({ spacing: scaledSpacing(layout.density), radius: scaledRadius(layout.roundness) }),
    [layout.density, layout.roundness],
  );
  const value = useMemo<Ctx>(() => {
    const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[1];
    return {
      colors: theme.colors,
      isDark: theme.isDark,
      themeId,
      setThemeId,
      cardStyle,
      setCardStyle,
      card: cardSurface(theme.colors, theme.isDark, cardStyle),
      layout,
      setLayout,
      spacing: scaled.spacing,
      radius: scaled.radius,
      typography,
    };
  }, [themeId, setThemeId, cardStyle, setCardStyle, layout, setLayout, scaled]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
