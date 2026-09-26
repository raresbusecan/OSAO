import type { HomeData } from "@/components/spaces/home/home.data.types";

/**
 * The single place that knows how to turn Home's separate category
 * tables into one unified list of "money spent in this space" records --
 * same idea as Car's own expenses.calculations.ts (getCarExpenseRecords).
 * Built so HomeDashboard's "This month" stat card and the detail page it
 * opens (HomeSpendPage) both read from exactly this, instead of two
 * slightly different definitions of "spend" drifting apart.
 *
 * Deliberately matches getThisMonthHomeExpenses's existing 3 sources
 * exactly (Expenses, Maintenance's price, and a resolved purchase
 * Task's price) -- Recurring bills are NOT included here, same as they
 * never were in that calculation; a recurring bill's own cost isn't
 * currently tracked as "spend" anywhere in the app, this page doesn't
 * change that.
 */

export type HomeSpendCategory = "expense" | "maintenance" | "task";

export type HomeSpendRecord = {
  id: string;
  category: HomeSpendCategory;
  categoryLabel: string;
  icon: "receipt-outline" | "construct-outline" | "cart-outline";
  title: string;
  subtitle?: string;
  date: string;
  amount: number;
};

export function getHomeSpendRecords(homeData: HomeData): HomeSpendRecord[] {
  const records: HomeSpendRecord[] = [];

  homeData.expenseEntries.forEach((entry) => {
    records.push({
      id: entry.id,
      category: "expense",
      categoryLabel: "Cheltuieli",
      icon: "receipt-outline",
      title: entry.title,
      date: entry.date,
      amount: entry.amount,
    });
  });

  // Every Maintenance entry counts by its own `date` (when the service
  // happened), same as getThisMonthHomeExpenses -- not filtered by
  // completed/isRecurring, since the money was spent regardless of
  // whether that entry is still active today.
  homeData.maintenanceEntries.forEach((entry) => {
    records.push({
      id: entry.id,
      category: "maintenance",
      categoryLabel: "Mentenanță",
      icon: "construct-outline",
      title: entry.service,
      subtitle: entry.provider,
      date: entry.date,
      amount: entry.price,
    });
  });

  // Only a resolved purchase task with a real price counts, keyed off
  // completedAt (when it was actually paid) -- same guard
  // getThisMonthHomeExpenses already uses.
  homeData.taskEntries.forEach((entry) => {
    if (!entry.isPurchase || !entry.price || !entry.completedAt) return;

    records.push({
      id: entry.id,
      category: "task",
      categoryLabel: "Task",
      icon: "cart-outline",
      title: entry.title,
      date: entry.completedAt,
      amount: entry.price,
    });
  });

  return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getTotalHomeSpend(records: HomeSpendRecord[]): number {
  return records.reduce((sum, record) => sum + record.amount, 0);
}

// -------------------------------------------------------------------
// Period filter -- simpler than Car's own (no custom weeks/months
// stepper, no "archived" concept) but the same shape otherwise.
// -------------------------------------------------------------------

export type HomeSpendPeriod =
  | { kind: "all" }
  | { kind: "thisMonth" }
  | { kind: "months"; count: number }
  | { kind: "years"; count: number };

export function filterSpendByPeriod(
  records: HomeSpendRecord[],
  period: HomeSpendPeriod,
  referenceDate: Date = new Date(),
): HomeSpendRecord[] {
  if (period.kind === "all") return records;

  if (period.kind === "thisMonth") {
    return records.filter((record) => {
      const d = new Date(record.date);
      return d.getMonth() === referenceDate.getMonth() && d.getFullYear() === referenceDate.getFullYear();
    });
  }

  const cutoff = new Date(referenceDate);
  if (period.kind === "months") cutoff.setMonth(cutoff.getMonth() - period.count);
  else cutoff.setFullYear(cutoff.getFullYear() - period.count);

  return records.filter((record) => new Date(record.date).getTime() >= cutoff.getTime());
}

export function formatSpendPeriodLabel(period: HomeSpendPeriod): string {
  if (period.kind === "all") return "Tot timpul";
  if (period.kind === "thisMonth") return "Luna aceasta";
  if (period.kind === "months") return period.count === 1 ? "Ultima lună" : `Ultimele ${period.count} luni`;
  return period.count === 1 ? "Ultimul an" : `Ultimii ${period.count} ani`;
}

/** Same total the "This month" stat card shows -- kept as a thin
 * wrapper over getHomeSpendRecords/filterSpendByPeriod so the card and
 * the detail page it opens (HomeSpendPage) can never quietly disagree,
 * same reasoning as Car's own getThisMonthCarExpenses. */
export function getThisMonthHomeSpend(homeData: HomeData): number {
  return getTotalHomeSpend(filterSpendByPeriod(getHomeSpendRecords(homeData), { kind: "thisMonth" }));
}
