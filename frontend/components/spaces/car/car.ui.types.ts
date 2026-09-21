import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export type CarIcon = ComponentProps<typeof Ionicons>["name"];

export type CarNextItem = {
  id: string | number;
  icon: CarIcon;
  title: string;
  subtitle: string;
  right?: string;
  /** Documents and maintenance -- which of the 3 severity bands this
   * item falls into: for a document, days until expiryDate (see
   * getDocumentUrgencyTier); for maintenance, whichever of km-remaining
   * or days-until-nextServiceDate is more urgent (see
   * getMaintenanceUrgency), both in dashboard.calculations.ts.
   * Undefined only when an item somehow has neither (shouldn't happen --
   * getUpcomingItems doesn't push items without a tier). */
  urgencyTier?: "light" | "medium" | "critical";
  /** True once the entry has actually passed its trigger -- expiryDate
   * for a document, or (whichever decided the tier) nextServiceOdometer/
   * nextServiceDate for maintenance -- not just "critical", which also
   * covers still being within the last stretch before that happens.
   * Swaps the badge's dot for a small "!" -- see InfoRow in
   * CarDashboard.tsx. */
  overdue?: boolean;
  /** The document/maintenance entry this alert came from -- tapping the
   * row starts a NEW entry pre-filled from it (a renewal), not an edit of
   * this one. See CarDashboard.tsx's handleNextItemPress. */
  sourceType: "document" | "maintenance";
  sourceId: string;
};

export type CarQuickActionKey =
  | "fuel"
  | "maintenance"
  | "document"
  | "expense";

export type CarQuickAction = {
  key: CarQuickActionKey;
  icon: CarIcon;
  label: string;
};

export type CarSection =
  | "overview"
  | "fuel"
  | "maintenance"
  | "documents"
  | "expenses"
  | "mileage";

export type CarSectionConfig = {
  key: CarSection;
  title: string;
};