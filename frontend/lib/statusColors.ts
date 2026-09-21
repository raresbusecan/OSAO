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
 * Calendar's month-grid heat scale -- explicitly requested as its own
 * fixed palette (yellow/orange/purple/red), separate from the urgency
 * scale above: this colors a day by how MANY things are due, not by how
 * soon any one of them is. Kept here (not calendar.tsx) so it has the
 * same single-source-of-truth home as everything else in this file, even
 * though today it's only consumed by the calendar screen.
 */
const DENSITY_TIERS = [
  { bg: "#FBBF24", text: "#111111" }, // 1 -- yellow
  { bg: "#F97316", text: "#111111" }, // 2 -- orange
  { bg: "#8B5CF6", text: "#FFFFFF" }, // 3 -- purple
  { bg: "#EF4444", text: "#FFFFFF" }, // 4+ -- red
];

export function densityColor(count: number, colors: ThemeColors): { bg: string; text: string } {
  if (count <= 0) return { bg: "transparent", text: colors.onSurface };
  return DENSITY_TIERS[Math.min(count, DENSITY_TIERS.length) - 1];
}
