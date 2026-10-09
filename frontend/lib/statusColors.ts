import type { ThemeColors } from "@/lib/theme";

/**
 * The one urgency scale used everywhere something is "how soon/overdue" --
 * Car document expiry, Home tasks/recurring bills/supplies restock, the
 * dashboard's per-space "De făcut" counts. Every feature used to define
 * its own near-identical red/orange/yellow/green locally (sometimes
 * matching the theme's colors.error/warning/caution/success by
 * coincidence, sometimes not, and never adapting to dark mode since the
 * hex was hardcoded). Routing all of them through this one mapping means
 * "critical" is the same red everywhere, and it flips with the theme.
 */
export type SeverityTier = "safe" | "caution" | "warning" | "critical";

export function severityColor(tier: SeverityTier, colors: ThemeColors): string {
  switch (tier) {
    case "critical":
      return colors.error;
    case "warning":
      return colors.warning;
    case "caution":
      return colors.caution;
    default:
      return colors.success;
  }
}

/** Same tiers as the day-based scale above, for a spent/limit ratio
 * (Budget's per-category and total rings) instead of a days-until count --
 * >=100% is critical, >=80% is a warning, anything less is safe. Only 3 of
 * the 4 tiers: budget never needed a separate "caution" step before
 * "warning" the way document/task urgency does. */
export function budgetSeverity(ratio: number): SeverityTier {
  if (ratio >= 1) return "critical";
  if (ratio >= 0.8) return "warning";
  return "safe";
}

/** A translucent tint of a severity color, for a badge/row background --
 * same "hex + alpha suffix" trick several Home pages already used ad hoc,
 * centralized so it always tints the current (theme-correct) color. */
export function severityTint(tier: SeverityTier, colors: ThemeColors, alpha: string = "11"): string {
  return `${severityColor(tier, colors)}${alpha}`;
}

/**
 * Calendar heat (2026-10 redesign, design-lead spec): how FULL a day is,
 * as a red tint ramp -- one shade per thing on the day, 8 shades, 8+ keeps
 * the darkest (user, 2026-10-05). `error` at 9 / 17 / 26 / 35 / 44 / 54 /
 * 65 / 75% over the card (surfaceSecondary), baked to exact hex per theme;
 * the day number (onSurface) stays >= 4.5:1 on every shade. Load = a plain count
 * of what falls on the day (every item and projected occurrence, custom
 * events included), and only today / future days are heated: overdue is
 * a STATUS, shown as full-strength red text or a red dot on past days,
 * so "busy" and "late" never share a tile.
 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const HEAT_MAX: HeatLevel = 8;
export const HEAT_LEVELS: readonly HeatLevel[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** The count itself, capped at 8 (8 or more = the darkest shade). */
export function heatLevel(count: number): HeatLevel {
  if (!(count > 0)) return 0;
  return Math.min(Math.floor(count), HEAT_MAX) as HeatLevel;
}

const HEAT_DARK = ["transparent", "#2B1F28", "#3D222D", "#512632", "#652A37", "#792E3D", "#8F3242", "#A83749", "#BE3B4E"];
const HEAT_LIGHT = ["transparent", "#FAEBED", "#F6D9DE", "#F1C4CC", "#ECB0BA", "#E79CA8", "#E18695", "#DB6D7F", "#D6566B"];

export function heatColor(level: HeatLevel, isDark: boolean): string {
  return (isDark ? HEAT_DARK : HEAT_LIGHT)[level];
}
