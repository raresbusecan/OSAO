/**
 * The km reminder window of a car service -- the ONE place these numbers
 * live (Mașină's "Urmează", Acasă's Mașină card and "De făcut", Simplu's
 * header). The backend mirrors MAINT_TIER_LIGHT_KM in
 * DashboardController::carServiceDue (keep both in sync).
 */
export const MAINT_TIER_LIGHT_KM = 2000; // entry point of the window
export const MAINT_TIER_MEDIUM_KM = 1000;
export const MAINT_TIER_CRITICAL_KM = 500;

export type KmUrgencyTier = "light" | "medium" | "critical";

/** km left (negative = past it) -> its tier; null outside the window. */
export function kmUrgencyTier(remainingKm: number): KmUrgencyTier | null {
  if (remainingKm > MAINT_TIER_LIGHT_KM) return null;
  if (remainingKm <= MAINT_TIER_CRITICAL_KM) return "critical";
  if (remainingKm <= MAINT_TIER_MEDIUM_KM) return "medium";
  return "light";
}
