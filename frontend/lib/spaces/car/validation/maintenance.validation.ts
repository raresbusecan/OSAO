import type { CarMaintenanceEntry } from "../car.types";

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

  if (entry.price <= 0) {
    return {
      valid: false,
      error: "Please enter a valid price.",
    };
  }

  if (entry.odometer <= 0) {
    return {
      valid: false,
      error: "Please enter a valid odometer value.",
    };
  }

  if (
    entry.nextServiceOdometer !== undefined &&
    entry.nextServiceOdometer <= entry.odometer
  ) {
    return {
      valid: false,
      error:
        "Next service mileage must be greater than the current odometer.",
    };
  }

  return { valid: true };
}