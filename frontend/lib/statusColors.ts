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

/** Mașină's 3 urgency bands (documents by days, services by km or days --
 * lib/spaces/car/calculations: "light" 45-31 days, "medium" 30-16,
 * "critical" 15 or less incl. expired/overdue) on the scale below:
 * caution / warning / critical. Shared by Complet's CarDashboard and
 * Simplu's Mașină so the two always color the same record the same. */
export function urgencyTierColor(tier: "light" | "medium" | "critical", colors: ThemeColors): string {
  if (tier === "critical") return severityColor("critical", colors);
  if (tier === "medium") return severityColor("warning", colors);
  return severityColor("caution", colors);
}

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
 * as a red tint ramp, 8 shades. `error` at 9 / 17 / 26 / 35 / 44 / 54 /
 * 65 / 75% over the card (surfaceSecondary), baked to exact hex per theme;
 * the day number (onSurface) stays >= 4.5:1 on every shade. Load = the
 * day's effort as a share of its MAX capacity (lib/calendar/capacity.ts,
 * 2026-10: a weekend holds more than a workday): each shade is 1/8 of the
 * day, the comfortable half ends at shade 4, a full (or overfull) day is
 * the darkest. Only today / future days are heated: overdue is a STATUS,
 * shown as full-strength red text or a red dot on past days, so "busy"
 * and "late" never share a tile.
 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const HEAT_MAX: HeatLevel = 8;
export const HEAT_LEVELS: readonly HeatLevel[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** A share of the day's max capacity (0..1+) -> a shade: anything at all
 * is at least shade 1, 100% or more is the darkest. */
export function heatLevel(share: number): HeatLevel {
  if (!(share > 0)) return 0;
  return Math.max(1, Math.min(Math.ceil(share * HEAT_MAX - 1e-9), HEAT_MAX)) as HeatLevel;
}

const HEAT_DARK = ["transparent", "#2B1F28", "#3D222D", "#512632", "#652A37", "#792E3D", "#8F3242", "#A83749", "#BE3B4E"];
const HEAT_LIGHT = ["transparent", "#FAEBED", "#F6D9DE", "#F1C4CC", "#ECB0BA", "#E79CA8", "#E18695", "#DB6D7F", "#D6566B"];

export function heatColor(level: HeatLevel, isDark: boolean): string {
  return (isDark ? HEAT_DARK : HEAT_LIGHT)[level];
}
