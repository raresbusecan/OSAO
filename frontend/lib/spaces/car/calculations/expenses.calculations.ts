import type { CarData } from "@/components/spaces/car/car.data.types";

/**
 * The single place that knows how to turn Car's 4 category tables (Fuel,
 * Maintenance, Documents, Expenses -- each its own shape, see car.types.ts)
 * into one unified list of "money spent on this car" records. Built so the
 * money-spent breakdown behind CarDashboard's "This month" stat card (see
 * getThisMonthExpenses below) and the Expenses page it opens into both read
 * from exactly this, instead of two slightly different definitions of "an
 * expense" drifting apart -- and so anything elsewhere in the app that
 * later needs "what has this car cost" (a cross-space finance view, a
 * yearly report, whatever) has one function to call instead of reaching
 * into 4 entry arrays itself.
 */

export type CarExpenseCategory = "fuel" | "maintenance" | "document" | "expense";

export type CarExpenseRecord = {
  id: string;
  category: CarExpenseCategory;
  icon: "water-outline" | "construct-outline" | "document-text-outline" | "receipt-outline";
  categoryLabel: string;
  title: string;
  subtitle?: string;
  date: string;
  amount: number;
  /** True for a document/maintenance entry superseded by a renewal (see
   * dashboard.calculations.ts). Still counted in every total below --
   * the money was still spent -- just tagged so the list can show it's
   * historical, not current. */
  archived?: boolean;
};

export function getCarExpenseRecords(carData: CarData): CarExpenseRecord[] {
  const records: CarExpenseRecord[] = [];

  carData.fuelEntries.forEach((entry) => {
    // A fill-up with no recorded price isn't a money record -- skip it
    // here (it still shows up in RECENT by liters, see carEntries.ts).
    if (entry.total_paid === undefined) return;

    records.push({
      id: entry.id,
      category: "fuel",
      icon: "water-outline",
      categoryLabel: "Fuel",
      title: entry.station?.trim() || "Fuel fill-up",
      subtitle: entry.liters !== undefined ? `${entry.liters} L` : undefined,
      date: entry.date,
      amount: entry.total_paid,
    });
  });

  carData.maintenanceEntries.forEach((entry) => {
    records.push({
      id: entry.id,
      category: "maintenance",
      icon: "construct-outline",
      categoryLabel: "Maintenance",
      title: entry.service,
      subtitle: entry.provider,
      date: entry.date,
      amount: entry.price,
      archived: entry.archived,
    });
  });

  carData.documentEntries.forEach((entry) => {
    // Most documents (registration, ITP) have no cost of their own --
    // only count the ones that actually cost something (insurance, a
    // renewal fee, ...).
    if (entry.price === undefined) return;

    records.push({
      id: entry.id,
      category: "document",
      icon: "document-text-outline",
      categoryLabel: "Document",
      title: entry.title,
      subtitle: entry.documentType,
      date: entry.date,
      amount: entry.price,
      archived: entry.archived,
    });
  });

  carData.expenseEntries.forEach((entry) => {
    records.push({
      id: entry.id,
      category: "expense",
      icon: "receipt-outline",
      categoryLabel: entry.category || "Expense",
      title: entry.title,
      subtitle: entry.provider,
      date: entry.date,
      amount: entry.amount,
    });
  });

  return records.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function getTotalCarExpenses(records: CarExpenseRecord[]): number {
  return records.reduce((sum, record) => sum + record.amount, 0);
}

/** Same total the "This month" stat card shows -- kept here so the card
 * and the Expenses page it opens can never quietly disagree. */
export function getThisMonthCarExpenses(records: CarExpenseRecord[]): number {
  const now = new Date();

  return records
    .filter((record) => {
      const d = new Date(record.date);
      return (
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    })
    .reduce((sum, record) => sum + record.amount, 0);
}

// -------------------------------------------------------------------
// Period filter -- shared by the Expenses page AND CarDashboard/History
// (see filterRecordsByPeriod's generic signature below), so "how far
// back" means exactly the same thing everywhere in the Car space instead
// of each screen inventing its own cutoff math. "all" (no cutoff), a
// week count (dashboard's "last 7 days" window and History's finer-
// grained presets), any month count from 1-12 (covers the fixed 3/6/12
// presets AND an arbitrary custom count like "last 2 months" or "last
// 4"), or a whole number of years for anything beyond a year.
// -------------------------------------------------------------------

export type CarExpensePeriod =
  | { kind: "all" }
  | { kind: "weeks"; count: number }
  | { kind: "months"; count: number }
  | { kind: "years"; count: number };

export function periodCutoffDate(
  period: CarExpensePeriod,
  referenceDate: Date = new Date(),
): Date | null {
  if (period.kind === "all") return null;

  const cutoff = new Date(referenceDate);

  if (period.kind === "weeks") {
    cutoff.setDate(cutoff.getDate() - period.count * 7);
  } else if (period.kind === "months") {
    cutoff.setMonth(cutoff.getMonth() - period.count);
  } else {
    cutoff.setFullYear(cutoff.getFullYear() - period.count);
  }

  return cutoff;
}

/** Generic over anything dated -- CarExpenseRecord on the Expenses page,
 * CarRecentItem on CarDashboard/CarHistoryPage. One cutoff rule, reused
 * instead of re-implemented per screen. */
export function filterRecordsByPeriod<T extends { date: string }>(
  records: T[],
  period: CarExpensePeriod,
  referenceDate: Date = new Date(),
): T[] {
  const cutoff = periodCutoffDate(period, referenceDate);
  if (!cutoff) return records;

  return records.filter((record) => new Date(record.date).getTime() >= cutoff.getTime());
}

export function filterRecordsByArchived(
  records: CarExpenseRecord[],
  includeArchived: boolean,
): CarExpenseRecord[] {
  return includeArchived ? records : records.filter((record) => !record.archived);
}

/** Short label for the period chip/heading -- "All time", "Last week",
 * "Last 3 months", "Last 1 month", "Last 2 years". */
export function formatPeriodLabel(period: CarExpensePeriod): string {
  if (period.kind === "all") return "All time";
  if (period.kind === "weeks") {
    return period.count === 1 ? "Last week" : `Last ${period.count} weeks`;
  }
  if (period.kind === "months") {
    return period.count === 1 ? "Last month" : `Last ${period.count} months`;
  }
  return period.count === 1 ? "Last year" : `Last ${period.count} years`;
}

// -------------------------------------------------------------------
// Archive -- every document/maintenance entry a renewal has superseded
// (see CarDashboard.tsx's "renew" flow), with a pointer to whatever
// replaced it. Unlike getCarExpenseRecords this is NOT money-filtered --
// a document with no price archived still belongs here, the archive is
// about "what used to be current", not "what cost something".
// -------------------------------------------------------------------

export type CarArchivedRecord = {
  id: string;
  category: "document" | "maintenance";
  icon: "document-text-outline" | "construct-outline";
  categoryLabel: string;
  title: string;
  subtitle?: string;
  date: string;
  amount?: number;
  /** What replaced it, if that record is still around (it can only ever
   * have been deleted, never itself archived by this one). */
  renewedByTitle?: string;
  renewedByDate?: string;
};

export function getArchivedCarRecords(carData: CarData): CarArchivedRecord[] {
  const records: CarArchivedRecord[] = [];

  carData.documentEntries
    .filter((entry) => entry.archived)
    .forEach((entry) => {
      const renewedBy = carData.documentEntries.find(
        (other) => other.renewedFromId === entry.id,
      );

      records.push({
        id: entry.id,
        category: "document",
        icon: "document-text-outline",
        categoryLabel: entry.documentType,
        title: entry.title,
        subtitle: entry.expiryDate ? `Expired ${entry.expiryDate}` : undefined,
        date: entry.date,
        amount: entry.price,
        renewedByTitle: renewedBy?.title,
        renewedByDate: renewedBy?.expiryDate,
      });
    });

  carData.maintenanceEntries
    .filter((entry) => entry.archived)
    .forEach((entry) => {
      const renewedBy = carData.maintenanceEntries.find(
        (other) => other.renewedFromId === entry.id,
      );

      records.push({
        id: entry.id,
        category: "maintenance",
        icon: "construct-outline",
        categoryLabel: "Maintenance",
        title: entry.service,
        subtitle: entry.provider,
        date: entry.date,
        amount: entry.price,
        renewedByTitle: renewedBy?.service,
        renewedByDate: renewedBy?.date,
      });
    });

  return records.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}
