import type { CarFuelEntry } from "../car.types";

export type FuelValidationResult = {
  valid: boolean;
  error?: string;
};

/**
 * Only the price is actually required -- everything else (liters,
 * odometer, tank levels, station) is only validated when the user
 * actually provided it, since not everyone cares about tracking
 * consumption in liters, or logging every reading -- some just want to
 * log what they spent.
 */
export function validateFuelEntry(
  entry: Omit<CarFuelEntry, "id" | "date">,
  previousEntry: CarFuelEntry | null,
): FuelValidationResult {
  const hasLiters = entry.liters !== undefined;
  const hasPrice = entry.total_paid !== undefined;
  const hasOdometer = entry.odometer !== undefined;
  const hasLevelBefore = entry.level_before !== undefined;
  const hasLevelAfter = entry.level_after !== undefined;

  if (!hasPrice) {
    return {
      valid: false,
      error: "Introdu prețul.",
    };
  }

  if (hasLiters && entry.liters! <= 0) {
    return {
      valid: false,
      error: "Introdu un număr valid de litri.",
    };
  }

  if (hasPrice && entry.total_paid! <= 0) {
    return {
      valid: false,
      error: "Introdu o sumă plătită validă.",
    };
  }

  if (hasOdometer) {
    if (entry.odometer! <= 0) {
      return {
        valid: false,
        error: "Introdu un kilometraj valid.",
      };
    }

    if (
      previousEntry?.odometer !== undefined &&
      entry.odometer! < previousEntry.odometer
    ) {
      return {
        valid: false,
        error: `Kilometrajul nu poate fi mai mic decât cel anterior (${previousEntry.odometer} km).`,
      };
    }
  }

  if (
    hasLevelBefore &&
    (entry.level_before! < 0 || entry.level_before! > 100)
  ) {
    return {
      valid: false,
      error: "Nivelul de dinainte trebuie să fie între 0% și 100%.",
    };
  }

  if (
    hasLevelAfter &&
    (entry.level_after! < 0 || entry.level_after! > 100)
  ) {
    return {
      valid: false,
      error: "Nivelul de după trebuie să fie între 0% și 100%.",
    };
  }

  if (
    hasLevelBefore &&
    hasLevelAfter &&
    entry.level_after! < entry.level_before!
  ) {
    return {
      valid: false,
      error:
        "Nivelul după alimentare nu poate fi mai mic decât cel de dinainte.",
    };
  }

  if (
    hasLevelBefore &&
    previousEntry?.level_after !== undefined &&
    entry.level_before! > previousEntry.level_after
  ) {
    return {
      valid: false,
      error:
        "Nivelul de dinainte nu poate fi mai mare decât nivelul de după, de la alimentarea anterioară.",
    };
  }

  return { valid: true };
}