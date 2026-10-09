import React from "react";
import { SpaceQuickActions } from "@/components/spaces/SpaceQuickActions";

export type CarQuickAction = {
  key: string;
  icon: string;
  label: string;
};

export type CarQuickActionsProps = {
  // Widened to plain string/SpaceCategory[] rather than a narrow key
  // union -- this reuses the exact same array CarDashboard already
  // builds (carCategories), so the two never drift out of sync.
  actions: CarQuickAction[];
  onAction?: (key: string) => void;
};

/**
 * The one way into each Car form: the shared SpaceQuickActions row
 * (Alimentare, Service, Cheltuială, Document -- most frequent first, all
 * alike; a filled first one read as "selected"). testIDs stay
 * `car-action-<key>`.
 */
export function CarQuickActions({ actions, onAction }: CarQuickActionsProps) {
  return <SpaceQuickActions kind="car" actions={actions} onAction={onAction} />;
}
