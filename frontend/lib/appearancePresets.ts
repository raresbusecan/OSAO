import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { DEFAULT_CARD_STYLE, DEFAULT_LAYOUT, type CardStyle, type Layout } from "./theme";

/**
 * Settings > Aspect > Stiluri: one tap sets every appearance option at
 * once (card style + layout -- not the theme, which stays its own
 * choice so any style works on any of the 4 themes). Built-in styles
 * below; the user can also save the current combination on this device.
 */
export type Appearance = { cardStyle: CardStyle; layout: Layout };
export type Preset = { id: string; label: string; description?: string; appearance: Appearance };

const look = (cardStyle: Partial<CardStyle>, layout: Partial<Layout>): Appearance => ({
  cardStyle: { ...DEFAULT_CARD_STYLE, ...cardStyle },
  layout: { ...DEFAULT_LAYOUT, ...layout },
});

export const BUILT_IN_PRESETS: Preset[] = [
  { id: "classic", label: "Clasic", description: "Aspectul implicit", appearance: look({}, {}) },
  {
    id: "glass",
    label: "Sticlă",
    description: "Carduri transparente peste pete de culoare",
    appearance: look({ bulge: 0.4, opacity: 0.7, liquid: 0.8 }, { roundness: 0.75, background: "blobs", backgroundStrength: 0.8, palette: "ocean", buttonShape: "pill" }),
  },
  {
    id: "compact",
    label: "Compact",
    description: "Mai mult pe ecran, colțuri mai drepte",
    appearance: look({ bulge: 0 }, { roundness: 0.25, density: "compact", textSize: "small" }),
  },
  {
    id: "comfort",
    label: "Confort",
    description: "Text mare, mult spațiu, carduri ridicate",
    appearance: look({ bulge: 0.8 }, { roundness: 0.6, density: "airy", textSize: "large" }),
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Plat, cu butoane contur",
    appearance: look({ bulge: 0 }, { roundness: 0.4, buttonStyle: "outline" }),
  },
];

/** SecureStore values over ~2 KB are refused on iOS; a few presets fit. */
export const MAX_SAVED_PRESETS = 5;
const STORAGE_KEY = "orgos_appearance_presets";

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  const eq = <T extends object>(x: T, y: T) => (Object.keys(x) as (keyof T)[]).every((k) => x[k] === y[k]);
  return eq(a.cardStyle, b.cardStyle) && eq(a.layout, b.layout);
}

export function readSavedPresets(): Preset[] {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(STORAGE_KEY) : SecureStore.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    // Fill in fields added after a preset was saved.
    return list
      .filter((p) => p && typeof p.id === "string" && typeof p.label === "string" && p.appearance)
      .map((p) => ({ id: p.id, label: p.label, appearance: look(p.appearance.cardStyle ?? {}, p.appearance.layout ?? {}) }));
  } catch {
    return [];
  }
}

export function writeSavedPresets(list: Preset[]) {
  try {
    const raw = JSON.stringify(list.map(({ id, label, appearance }) => ({ id, label, appearance })));
    if (Platform.OS === "web") globalThis.localStorage?.setItem(STORAGE_KEY, raw);
    else SecureStore.setItemAsync(STORAGE_KEY, raw).catch(() => {});
  } catch {}
}
