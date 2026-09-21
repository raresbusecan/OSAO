import type { CarMaintenanceEntry } from "../car.types";
import { isValidDateInput } from "../utils/dateInput";

export type MaintenanceValidationResult = {
  valid: boolean;
  error?: string;
};

export function validateMaintenanceEntry(
  entry: Omit<CarMaintenanceEntry, "id" | "date">,
): MaintenanceValidationResult {
  if (!entry.service.trim()) {
    return {
      valid: false,
      error: "Please enter the service type.",
    };
  }

  // Warranty/recall work genuinely costs 0 -- only require a positive
  // price for a normal, paid-for entry.
  if (!entry.underWarranty && entry.price <= 0) {
    return {
      valid: false,
      error: "Please enter a valid price.",
    };
  }

  // Odometer itself is optional for everything except Oil Change: any
  // other entry's odometer doesn't add information getCurrentOdometer
  // doesn't already have from fuel/other entries, so requiring it here
  // too would just be redundant re-entry. Oil Change is the one type
  // whose own km-based interval genuinely needs to know where the
  // odometer stood right now.
  if (entry.service === "Oil Change" && (entry.odometer === undefined || entry.odometer <= 0)) {
    return {
      valid: false,
      error: "Please enter the odometer reading.",
    };
  }

  if (entry.odometer !== undefined && entry.odometer <= 0) {
    return {
      valid: false,
      error: "Please enter a valid odometer value.",
    };
  }

  if (
    entry.nextServiceOdometer !== undefined &&
    entry.odometer !== undefined &&
    entry.nextServiceOdometer <= entry.odometer
  ) {
    return {
      valid: false,
      error:
        "Next service mileage must be greater than the current odometer.",
    };
  }

  if (entry.nextServiceDate && !isValidDateInput(entry.nextServiceDate)) {
    return {
      valid: false,
      error: "Next service date must use the format DD.MM.YYYY.",
    };
  }

  return { valid: true };
}