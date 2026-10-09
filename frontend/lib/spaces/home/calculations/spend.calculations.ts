import type { HomeData } from "@/components/spaces/home/home.data.types";

/**
 * The single place that knows how to turn Home's separate category
 * tables into one unified list of "money spent in this space" records --
 * same idea as Car's own expenses.calculations.ts (getCarExpenseRecords).
 * Built so HomeDashboard's "This month" stat card and the detail page it
 * opens (HomeSpendPage) both read from exactly this, instead of two
 * slightly different definitions of "spend" drifting apart.
 *
 * 4 sources: Expenses (always one-off, unchanged), Maintenance,
 * resolved purchase Tasks, and Recurring bills. The latter 3 can each
 * be resolved more than once -- Maintenance/Recurring on their own
 * recurrence, a Task if it's isRecurring too -- so each one produces a
 * record PER `spendHistory` event (see home.types.ts) when it has any,
 * instead of one record for whatever its CURRENT price/amount snapshot
 * happens to be. An entry with no history yet (created before
 * spendHistory existed, or never resolved since) falls back to its
 * single price/date snapshot so nothing already showing a total
 * silently drops to zero -- it just starts accumulating properly from
 * its next resolve onward. Recurring bills have no legacy fallback:
 * they were never counted as spend at all before spendHistory existed,
 * so an entry with none yet simply contributes nothing, same as always.
 */

export type HomeSpendCategory = "expense" | "maintenance" | "task" | "recurring";

export type HomeSpendRecord = {
  /** Unique per RECORD (one entry can now produce several, one per
   * spendHistory event) -- for React keys/testIDs, never for looking
   * the underlying entry back up. */
  id: string;
  /** The underlying entry's own id -- always this, regardless of how
   * many records that one entry produced. What onRecordPress should
   * navigate with. */
  entryId: string;
  category: HomeSpendCategory;
  categoryLabel: string;
  icon: "receipt-outline" | "construct-outline" | "cart-outline" | "repeat-outline";
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
      entryId: entry.id,
      category: "expense",
      categoryLabel: "Cheltuieli",
      icon: "receipt-outline",
      title: entry.title,
      date: entry.date,
      amount: entry.amount,
    });
  });

  // Every Maintenance entry counts -- not filtered by completed/
  // isRecurring, since the money was spent regardless of whether that
  // entry is still active today. One record per `spendHistory` event
  // when it has any (a recurring entry resolved N times this month
  // shows N records); otherwise the single `date`/`price` snapshot,
  // same as before spendHistory existed.
  homeData.maintenanceEntries.forEach((entry) => {
    if (entry.spendHistory?.length) {
      entry.spendHistory.forEach((event, index) => {
        records.push({
          id: `${entry.id}-${index}`,
          entryId: entry.id,
          category: "maintenance",
          categoryLabel: "Mentenanță",
          icon: "construct-outline",
          title: entry.service,
          subtitle: entry.provider,
          date: event.date,
          amount: event.amount,
        });
      });
      return;
    }

    records.push({
      id: entry.id,
      entryId: entry.id,
      category: "maintenance",
      categoryLabel: "Mentenanță",
      icon: "construct-outline",
      title: entry.service,
      subtitle: entry.provider,
      date: entry.date,
      amount: entry.price,
    });
  });

  // A purchase task with any resolve history counts once per event
  // (same reasoning as Maintenance above); otherwise falls back to its
  // single completedAt/price snapshot, same guard getThisMonthHomeExpenses
  // always used.
  homeData.taskEntries.forEach((entry) => {
    if (!entry.isPurchase) return;

    if (entry.spendHistory?.length) {
      entry.spendHistory.forEach((event, index) => {
        records.push({
          id: `${entry.id}-${index}`,
          entryId: entry.id,
          category: "task",
          categoryLabel: "Sarcină",
          icon: "cart-outline",
          title: entry.title,
          date: event.date,
          amount: event.amount,
        });
      });
      return;
    }

    if (!entry.price || !entry.completedAt) return;
    records.push({
      id: entry.id,
      entryId: entry.id,
      category: "task",
      categoryLabel: "Sarcină",
      icon: "cart-outline",
      title: entry.title,
      date: entry.completedAt,
      amount: entry.price,
    });
  });

  // Recurring bills -- one record per resolve ("paid this cycle"), from
  // spendHistory only (no legacy snapshot fallback: an unresolved
  // recurring bill was never spend, just an upcoming due date -- see
  // getUpcomingHomeItems).
  homeData.recurringEntries.forEach((entry) => {
    entry.spendHistory?.forEach((event, index) => {
      records.push({
        id: `${entry.id}-${index}`,
        entryId: entry.id,
        category: "recurring",
        categoryLabel: "Facturi",
        icon: "repeat-outline",
        title: entry.title,
        date: event.date,
        amount: event.amount,
      });
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
