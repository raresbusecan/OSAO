import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export type CarIcon = ComponentProps<typeof Ionicons>["name"];

export type CarNextItem = {
  id: string | number;
  icon: CarIcon;
  title: string;
  subtitle: string;
  right?: string;
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