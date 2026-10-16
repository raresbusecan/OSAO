import type { ExpensesData } from "@/components/spaces/expenses/expenses.data.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { roCount } from "@/lib/format";

export function getThisMonthExpensesTotal(data: ExpensesData): number {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return data.entries.reduce((total, entry) => {
    const entryDate = new Date(entry.date);
    const isCurrentMonth =
      entryDate.getMonth() === currentMonth &&
      entryDate.getFullYear() === currentYear;

    return isCurrentMonth ? total + entry.price : total;
  }, 0);
}

/** The card on the space's own screen shows this now, not just the
 * current month -- "everything that does not fit another space" reads
 * oddly if its own total quietly resets every 1st of the month. Tapping
 * the card is what opens the real, filterable breakdown (see
 * ExpensesDetailPage). */
export function getAllTimeExpensesTotal(data: ExpensesData): number {
  return data.entries.reduce((total, entry) => total + entry.price, 0);
}

// -------------------------------------------------------------------
// Period filter -- same rolling-window model as Car's CarExpensePeriod
// (expenses.calculations.ts) and Home's HomeSpendPeriod
// (spend.calculations.ts): a trigger row opening a modal with a fixed
// preset list, not the old trend-chart's "pick one specific past
// calendar month" -- replaced per explicit user request for
// consistency across every Space's own Expenses section.
// -------------------------------------------------------------------

export type ExpensesPeriod =
  | { kind: "all" }
  | { kind: "thisMonth" }
  | { kind: "weeks"; count: number }
  | { kind: "months"; count: number }
  | { kind: "years"; count: number };

export function filterExpensesByPeriod(
  entries: ExpenseEntry[],
  period: ExpensesPeriod,
  referenceDate: Date = new Date(),
): ExpenseEntry[] {
  if (period.kind === "all") return entries;

  if (period.kind === "thisMonth") {
    return entries.filter((entry) => {
      const d = new Date(entry.date);
      return d.getMonth() === referenceDate.getMonth() && d.getFullYear() === referenceDate.getFullYear();
    });
  }

  const cutoff = new Date(referenceDate);
  if (period.kind === "weeks") cutoff.setDate(cutoff.getDate() - period.count * 7);
  else if (period.kind === "months") cutoff.setMonth(cutoff.getMonth() - period.count);
  else cutoff.setFullYear(cutoff.getFullYear() - period.count);

  return entries.filter((entry) => new Date(entry.date).getTime() >= cutoff.getTime());
}

export function formatExpensesPeriodLabel(period: ExpensesPeriod): string {
  if (period.kind === "all") return "Tot timpul";
  if (period.kind === "thisMonth") return "Luna asta";
  if (period.kind === "weeks") return period.count === 1 ? "Ultima săptămână" : `Ultimele ${roCount(period.count, "săptămână", "săptămâni")}`;
  if (period.kind === "months") return period.count === 1 ? "Ultima lună" : `Ultimele ${roCount(period.count, "lună", "luni")}`;
  return period.count === 1 ? "Ultimul an" : `Ultimii ${period.count} ani`;
}
