import type { ExpensesData } from "@/components/spaces/expenses/expenses.data.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";

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

export type MonthlyExpenseTotal = {
  year: number;
  /** 0-11, same as Date#getMonth. */
  month: number;
  /** "Sep", "Aug", ... -- the trend chart's bar label. */
  label: string;
  total: number;
};

/** Oldest to newest, always `monthCount` entries ending on the current
 * month, even for a month with nothing spent (total: 0) -- a gap in the
 * chart would misread as a rendering bug, not "no expenses that month".
 */
export function getMonthlyExpenseTotals(
  data: ExpensesData,
  monthCount: number,
  referenceDate: Date = new Date(),
): MonthlyExpenseTotal[] {
  const months: MonthlyExpenseTotal[] = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleDateString("en-US", { month: "short" }),
      total: 0,
    });
  }

  data.entries.forEach((entry) => {
    const entryDate = new Date(entry.date);
    const bucket = months.find(
      (m) => m.year === entryDate.getFullYear() && m.month === entryDate.getMonth(),
    );
    if (bucket) bucket.total += entry.price;
  });

  return months;
}

/** Every entry recorded in one specific {year, month} -- what the trend
 * chart's tapped bar filters the list down to. */
export function getEntriesForMonth(
  data: ExpensesData,
  year: number,
  month: number,
): ExpenseEntry[] {
  return data.entries.filter((entry) => {
    const d = new Date(entry.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}
