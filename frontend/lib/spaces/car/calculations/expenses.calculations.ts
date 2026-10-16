import { maintenanceLabel } from "@/lib/spaces/car/maintenanceLabels";
import type { CarData } from "@/components/spaces/car/car.data.types";
import type { CarDocumentEntry, CarMaintenanceEntry } from "@/lib/spaces/car/car.types";
import {
  getDocumentStatus,
  getDocumentUrgencyTier,
  getMaintenanceUrgency,
} from "./dashboard.calculations";

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
  /** Documents and maintenance -- the same status dot shown in RECENT/
   * ALL and History (see CarRecentItem.statusDot), PLUS "archived"
   * (gray), which only exists here: this is the one place archived
   * records are ever shown at all (the "Include archived" toggle), so
   * unlike everywhere else this needs a dot for that case too instead of
   * none. "safe" = outside the alert window; light/medium/critical
   * mirror DUE SOON. */
  statusDot?: "safe" | "light" | "medium" | "critical" | "archived";
  /** Documents and maintenance, never on an archived one -- true once
   * the entry has actually passed its trigger. Swaps the status dot for
   * a small "!". */
  overdue?: boolean;
  /** items.guilt_free -- the row shows a "Fără vină" chip. */
  guiltFree?: boolean;
};

function getDocumentStatusDot(entry: CarDocumentEntry): CarExpenseRecord["statusDot"] {
  if (entry.archived) return "archived";
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
): CarExpenseRecord["statusDot"] {
  if (entry.archived) return "archived";
  return getMaintenanceUrgency(entry, currentOdometer).tier ?? "safe";
}

function isMaintenanceOverdue(entry: CarMaintenanceEntry, currentOdometer: number): boolean {
  if (entry.archived) return false;
  return getMaintenanceUrgency(entry, currentOdometer).overdue;
}

export function getCarExpenseRecords(carData: CarData, currentOdometer: number): CarExpenseRecord[] {
  const records: CarExpenseRecord[] = [];

  carData.fuelEntries.forEach((entry) => {
    // A fill-up with no recorded price isn't a money record -- skip it
    // here (it still shows up in RECENT by liters, see carEntries.ts).
    if (entry.total_paid === undefined) return;

    records.push({
      id: entry.id,
      category: "fuel",
      icon: "water-outline",
      categoryLabel: "Alimentare",
      title: entry.station?.trim() || "Alimentare",
      subtitle: entry.liters !== undefined ? `${entry.liters} l` : undefined,
      date: entry.date,
      amount: entry.total_paid,
      guiltFree: entry.guiltFree,
    });
  });

  carData.maintenanceEntries.forEach((entry) => {
    records.push({
      id: entry.id,
      category: "maintenance",
      icon: "construct-outline",
      categoryLabel: "Service",
      title: maintenanceLabel(entry.service),
      subtitle: entry.provider,
      date: entry.date,
      amount: entry.price,
      archived: entry.archived,
      statusDot: getMaintenanceStatusDot(entry, currentOdometer),
      overdue: isMaintenanceOverdue(entry, currentOdometer),
      guiltFree: entry.guiltFree,
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
      statusDot: getDocumentStatusDot(entry),
      overdue: isDocumentOverdue(entry),
      guiltFree: entry.guiltFree,
    });
  });

  carData.expenseEntries.forEach((entry) => {
    records.push({
      id: entry.id,
      category: "expense",
      icon: "receipt-outline",
      categoryLabel: entry.category || "Cheltuială",
      // Category and title are both optional now (only Amount is
      // required, see CarExpenseForm.tsx) -- fall back so a blank one
      // never renders as an empty title.
      title: entry.title || entry.category || "Cheltuială",
      subtitle: entry.provider,
      date: entry.date,
      amount: entry.amount,
      guiltFree: entry.guiltFree,
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

/** The period label now lives with the shared picker (lib/period.ts). */
export { formatPeriodLabel } from "@/lib/period";

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
        // Validity dates, never the day it was entered in the app.
        subtitle: entry.issueDate && entry.expiryDate
          ? `${entry.issueDate} – ${entry.expiryDate}`
          : entry.expiryDate
            ? `expirat pe ${entry.expiryDate}`
            : undefined,
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
        categoryLabel: "Service",
        title: maintenanceLabel(entry.service),
        subtitle: entry.provider,
        date: entry.date,
        amount: entry.price,
        renewedByTitle: renewedBy ? maintenanceLabel(renewedBy.service) : undefined,
        renewedByDate: renewedBy?.date,
      });
    });

  return records.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}
