import type { CarRecentItem } from "./carEntries.types";

import {
  formatCarDate,
  formatCarNumber,
} from "./carFormatters";

import {
  getDocumentStatus,
  getDocumentUrgencyTier,
  getMaintenanceUrgency,
} from "@/lib/spaces/car/calculations/dashboard.calculations";

import type {
  CarDocumentEntry,
  CarExpenseEntry,
  CarFuelEntry,
  CarMaintenanceEntry,
} from "@/lib/spaces/car/car.types";

type CarRecentEntries = {
  fuelEntries: CarFuelEntry[];
  maintenanceEntries: CarMaintenanceEntry[];
  documentEntries: CarDocumentEntry[];
  expenseEntries: CarExpenseEntry[];
  /** Needed for maintenance's status dot -- see getMaintenanceStatusDot
   * below (documents don't need this, they're date-only). */
  currentOdometer: number;
};

// Named + explicitly annotated so the literal union survives TS's
// inference inside the .map() callback below (an inline ternary there
// gets widened to `string | undefined` instead of the real 4-value union).
function getDocumentStatusDot(entry: CarDocumentEntry): CarRecentItem["statusDot"] {
  if (entry.archived) return undefined;
  return getDocumentUrgencyTier(entry) ?? "safe";
}

// Never true on an archived document -- archiving already resolves it.
function isDocumentOverdue(entry: CarDocumentEntry): boolean {
  if (entry.archived) return false;
  return getDocumentStatus(entry).status === "expired";
}

function getMaintenanceStatusDot(
  entry: CarMaintenanceEntry,
  currentOdometer: number,
): CarRecentItem["statusDot"] {
  if (entry.archived) return undefined;
  return getMaintenanceUrgency(entry, currentOdometer).tier ?? "safe";
}

function isMaintenanceOverdue(entry: CarMaintenanceEntry, currentOdometer: number): boolean {
  if (entry.archived) return false;
  return getMaintenanceUrgency(entry, currentOdometer).overdue;
}


export const buildCarRecentItems = ({
  fuelEntries,
  maintenanceEntries,
  documentEntries,
  expenseEntries,
  currentOdometer,
}: CarRecentEntries): CarRecentItem[] => {
  return [
    ...fuelEntries.map((entry) => {
      const subtitle =
        entry.odometer !== undefined
          ? `${formatCarDate(entry.date)}, ${formatCarNumber(
              entry.odometer,
            )} km`
          : formatCarDate(entry.date);

      const amount =
        entry.total_paid !== undefined
          ? `${formatCarNumber(entry.total_paid)} lei`
          : entry.liters !== undefined
            ? `${formatCarNumber(entry.liters)} l`
            : undefined;

      return {
        id: entry.id,
        type: "fuel" as const,
        icon: "water-outline" as const,
        title: "Alimentare",
        subtitle,
        amount,
        date: entry.date,
      };
    }),

    ...maintenanceEntries.map((entry) => ({
      id: entry.id,
      type: "maintenance" as const,
      icon: "construct-outline" as const,
      title: entry.service,
      subtitle:
        entry.odometer !== undefined
          ? `${formatCarDate(entry.date)}, ${formatCarNumber(entry.odometer)} km`
          : formatCarDate(entry.date),
      amount: `${formatCarNumber(entry.price)} lei`,
      date: entry.date,
      archived: entry.archived,
      statusDot: getMaintenanceStatusDot(entry, currentOdometer),
      overdue: isMaintenanceOverdue(entry, currentOdometer),
    })),

    ...documentEntries.map((entry) => ({
      id: entry.id,
      type: "document" as const,
      icon: "document-text-outline" as const,
      title: entry.title,
      subtitle: `${entry.documentType}${
        entry.expiryDate
          ? `, expiră pe ${formatCarDate(entry.expiryDate)}`
          : ""
      }`,
      amount:
        entry.price !== undefined
          ? `${formatCarNumber(entry.price)} lei`
          : undefined,
      date: entry.date,
      archived: entry.archived,
      statusDot: getDocumentStatusDot(entry),
      overdue: isDocumentOverdue(entry),
    })),

    ...expenseEntries.map((entry) => ({
      id: entry.id,
      type: "expense" as const,
      icon: "receipt-outline" as const,
      // Category and title are both optional now (only Amount is
      // required, see CarExpenseForm.tsx) -- fall back so a blank one
      // never renders as an empty title/subtitle.
      title: entry.title || entry.category || "Cheltuială",
      subtitle: [
        entry.category,
        entry.odometer ? `${formatCarNumber(entry.odometer)} km` : null,
      ]
        .filter(Boolean)
        .join(", "),
      amount: `${formatCarNumber(entry.amount)} lei`,
      date: entry.date,
    })),
  ];
};