import type { CarFuelEntry } from "../car.types";

export type FuelValidationResult = {
  valid: boolean;
  error?: string;
};

/**
 * All fuel fields are optional except one thing: the entry has to
 * record SOMETHING — either how much fuel went in, or how much was
 * paid. Everything else (odometer, tank levels, station) is only
 * validated when the user actually provided it, since not everyone
 * cares about tracking consumption — some just want to log spend.
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

  if (!hasLiters && !hasPrice) {
    return {
      valid: false,
      error: "Please enter at least the liters or the price.",
    };
  }

  if (hasLiters && entry.liters! <= 0) {
    return {
      valid: false,
      error: "Please enter a valid number of liters.",
    };
  }

  if (hasPrice && entry.total_paid! <= 0) {
    return {
      valid: false,
      error: "Please enter a valid total amount paid.",
    };
  }

  if (hasOdometer) {
    if (entry.odometer! <= 0) {
      return {
        valid: false,
        error: "Please enter a valid odometer value.",
      };
    }

    if (
      previousEntry?.odometer !== undefined &&
      entry.odometer! < previousEntry.odometer
    ) {
      return {
        valid: false,
        error: `Odometer cannot be lower than the previous value (${previousEntry.odometer} km).`,
      };
    }
  }

  if (
    hasLevelBefore &&
    (entry.level_before! < 0 || entry.level_before! > 100)
  ) {
    return {
      valid: false,
      error: "Tank level before must be between 0% and 100%.",
    };
  }

  if (
    hasLevelAfter &&
    (entry.level_after! < 0 || entry.level_after! > 100)
  ) {
    return {
      valid: false,
      error: "Tank level after must be between 0% and 100%.",
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
        "Tank level after refueling cannot be lower than the level before refueling.",
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
        "Tank level before refueling cannot be higher than the previous recorded level after refueling.",
    };
  }

  return { valid: true };
}