import type { CarRecentItem } from "./carEntries.types";

import {
  formatCarDate,
  formatCarNumber,
} from "./carFormatters";

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
};


export const buildCarRecentItems = ({
  fuelEntries,
  maintenanceEntries,
  documentEntries,
  expenseEntries,
}: CarRecentEntries): CarRecentItem[] => {
  return [
    ...fuelEntries.map((entry) => {
      const subtitle =
        entry.odometer !== undefined
          ? `${formatCarDate(entry.date)} · ${formatCarNumber(
              entry.odometer,
            )} km`
          : formatCarDate(entry.date);

      const amount =
        entry.total_paid !== undefined
          ? `${formatCarNumber(entry.total_paid)} RON`
          : entry.liters !== undefined
            ? `${formatCarNumber(entry.liters)} L`
            : undefined;

      return {
        id: entry.id,
        type: "fuel" as const,
        icon: "water-outline" as const,
        title: "Fuel",
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
      subtitle: `${formatCarDate(entry.date)} · ${formatCarNumber(
        entry.odometer,
      )} km`,
      amount: `${formatCarNumber(entry.price)} RON`,
      date: entry.date,
      archived: entry.archived,
    })),

    ...documentEntries.map((entry) => ({
      id: entry.id,
      type: "document" as const,
      icon: "document-text-outline" as const,
      title: entry.title,
      subtitle: `${entry.documentType}${
        entry.expiryDate
          ? ` · Expires ${entry.expiryDate}`
          : ""
      }`,
      amount:
        entry.price !== undefined
          ? `${formatCarNumber(entry.price)} RON`
          : undefined,
      date: entry.date,
      archived: entry.archived,
    })),

    ...expenseEntries.map((entry) => ({
      id: entry.id,
      type: "expense" as const,
      icon: "receipt-outline" as const,
      title: entry.title,
      subtitle: `${entry.category}${
        entry.odometer
          ? ` · ${formatCarNumber(entry.odometer)} km`
          : ""
      }`,
      amount: `${formatCarNumber(entry.amount)} RON`,
      date: entry.date,
    })),
  ];
};