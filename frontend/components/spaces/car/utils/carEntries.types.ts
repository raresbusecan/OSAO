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
};