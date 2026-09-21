import type { CarIcon } from "../car.ui.types";

export type CarRecentItemType =
  | "fuel"
  | "maintenance"
  | "document"
  | "expense";

export type CarRecentItem = {
  id: string | number;
  type: CarRecentItemType;
  icon: CarIcon;
  title: string;
  subtitle: string;
  amount?: string;
  currency?: string;
  /** Raw ISO date, kept alongside the already-formatted subtitle so
   * callers can group/sort without re-parsing it -- see
   * lib/spaces/car/utils/recency.ts's isRecentToday. */
  date: string;
  /** Only meaningful for maintenance/document (fuel/expense never set it)
   * -- superseded by a renewal, see dashboard.calculations.ts. CarHistoryPage
   * tags these; CarDashboard's RECENT/ALL already filter them out entirely. */
  archived?: boolean;
  /** Documents and maintenance, and never on an archived one -- the small
   * status dot shown everywhere EXCEPT the DUE SOON section (which
   * already has its own colored badge for this). "safe" = not yet inside
   * the alert window; the other 3 mirror DUE SOON's own tiers -- see
   * getDocumentUrgencyTier / getMaintenanceUrgency in
   * dashboard.calculations.ts. */
  statusDot?: "safe" | "light" | "medium" | "critical";
  /** Documents and maintenance, never on an archived one -- true once the
   * entry has actually passed its trigger (expiry date, or whichever of
   * km/date decided it for maintenance). Swaps the status dot for a
   * small "!". */
  overdue?: boolean;
};