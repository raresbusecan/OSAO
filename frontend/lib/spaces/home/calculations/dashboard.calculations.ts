import type { HomeData } from "@/components/spaces/home/home.data.types";
import type { HomeNextItem } from "@/components/spaces/home/home.ui.types";
import type { SupplyRestockEvent } from "@/lib/spaces/home/home.types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DOC_ALERT_DAYS = 45;
const DUE_ALERT_DAYS = 14;

export function getThisMonthHomeExpenses(homeData: HomeData): number {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const isCurrentMonth = (dateString: string) => {
    const d = new Date(dateString);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  };

  let total = 0;

  homeData.expenseEntries.forEach((entry) => {
    if (isCurrentMonth(entry.date)) {
      total += entry.amount;
    }
  });

  homeData.maintenanceEntries.forEach((entry) => {
    if (isCurrentMonth(entry.date)) {
      total += entry.price;
    }
  });

  // A resolved purchase task -- keyed off completedAt (when it was
  // actually paid), not dueDate. dueDate can't double as "payment date"
  // anymore now that a recurring task repoints it to its NEXT
  // occurrence on resolve (see nextTaskOccurrence/resolveTask) -- that's
  // a future date, the opposite of what a spend total wants.
  homeData.taskEntries.forEach((entry) => {
    if (entry.isPurchase && entry.price && entry.completedAt && isCurrentMonth(entry.completedAt)) {
      total += entry.price;
    }
  });

  return total;
}

function daysUntil(dateString: string, now: Date): number {
  return Math.ceil(
    (new Date(dateString).getTime() - now.getTime()) / MS_PER_DAY,
  );
}

function dueSubtitle(daysRemaining: number, verb: "Expires" | "Due"): string {
  if (daysRemaining < 0) {
    const overdueVerb = verb === "Expires" ? "Expired" : "Overdue by";
    const days = Math.abs(daysRemaining);
    return verb === "Expires"
      ? `${overdueVerb} ${days} day${days !== 1 ? "s" : ""} ago`
      : `${overdueVerb} ${days} day${days !== 1 ? "s" : ""}`;
  }

  return `${verb} in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
}

export function getUpcomingHomeItems(
  homeData: HomeData,
  limit?: number,
): HomeNextItem[] {
  const now = new Date();
  const items: Array<HomeNextItem & { urgency: number }> = [];

  homeData.documentEntries.forEach((entry) => {
    if (!entry.expiryDate) return;

    const remaining = daysUntil(entry.expiryDate, now);
    if (remaining > DOC_ALERT_DAYS) return;

    items.push({
      id: `doc-${entry.id}`,
      icon: "document-text-outline",
      title: entry.title,
      subtitle: dueSubtitle(remaining, "Expires"),
      urgency: remaining,
    });
  });

  homeData.maintenanceEntries.forEach((entry) => {
    if (entry.completed) return;
    if (!entry.nextDueDate) return;

    const remaining = daysUntil(entry.nextDueDate, now);
    if (remaining > DUE_ALERT_DAYS) return;

    items.push({
      id: `maint-${entry.id}`,
      icon: "construct-outline",
      title: entry.service,
      subtitle: dueSubtitle(remaining, "Due"),
      urgency: remaining,
    });
  });

  homeData.recurringEntries.forEach((entry) => {
    const remaining = daysUntil(entry.nextDueDate, now);
    if (remaining > DUE_ALERT_DAYS) return;

    items.push({
      id: `rec-${entry.id}`,
      icon: "repeat-outline",
      title: entry.title,
      subtitle: dueSubtitle(remaining, "Due"),
      urgency: remaining,
    });
  });

  items.sort((a, b) => a.urgency - b.urgency);

  return limit !== undefined ? items.slice(0, limit) : items;
}

// -------------------------------------------------------------------
// Tasks -- overdue/due-today counts for the dashboard's stat card, and
// the DUE SOON / RECENT / ALL grouping for HomeTasksPage. Kept local to
// Home for now (see PLAN.md Faza 3: extract a shared urgency helper
// with Car once a second real consumer justifies it).
// -------------------------------------------------------------------

/** Where a recurring task's dueDate lands after being resolved --
 * advances from its existing dueDate (keeps a fixed schedule, e.g.
 * every Monday, instead of drifting whenever it happens to get done
 * late), or from today if it never had one. */
export function nextTaskOccurrence(
  fromDate: string | undefined,
  frequency: "daily" | "weekly" | "monthly" | undefined,
): string {
  const base = fromDate ? new Date(fromDate) : new Date();
  const next = new Date(base);

  if (frequency === "daily") next.setDate(next.getDate() + 1);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + 7); // weekly, and the fallback if unset

  return next.toISOString();
}

// -------------------------------------------------------------------
// Recurring-task warnings -- the Restanțe card's 4-state breakdown and
// the detail list it opens. Scoped to recurring tasks only (a
// non-recurring task just archives once resolved, so there's nothing
// to warn about ahead of time the way there is for a task that keeps
// coming back).
// -------------------------------------------------------------------

export type RecurringWarningTier = "yellow" | "orangeDays" | "orangeToday" | "red";

export type RecurringWarningRow = {
  id: string;
  title: string;
  tier: RecurringWarningTier;
  daysRemaining: number;
  /** Which list this row actually resolves through -- a task opens
   * HomeTaskResolveSheet (price + next-date), a maintenance or
   * recurring entry goes through the same resolveEntry/confirmAction
   * flow HomeCategoryPage's own checkbox already uses. See
   * HomeDashboard's onResolvePress. */
  kind: "task" | "maintenance" | "recurring";
};

/** The one place "how urgent is N days remaining" turns into a tier --
 * shared by getRecurringTaskWarnings (Restanțe) and getHomeTasksView
 * (the main Tasks page's DUE SOON section) below, so a task reads the
 * same urgency color wherever it's shown instead of two independent
 * (and previously inconsistent) classifications. undefined means "not
 * urgent enough to color" -- more than 4 days out. */
export function classifyTaskUrgencyTier(remaining: number): RecurringWarningTier | undefined {
  if (remaining < 0) return "red";
  if (remaining === 0) return "orangeToday";
  if (remaining <= 2) return "orangeDays";
  if (remaining <= 4) return "yellow";
  return undefined;
}

export function getRecurringTaskWarnings(homeData: HomeData): {
  counts: Record<RecurringWarningTier, number>;
  rows: RecurringWarningRow[];
} {
  const now = new Date();
  const rows: RecurringWarningRow[] = [];

  homeData.taskEntries.forEach((task) => {
    if (!task.isRecurring || task.completed || !task.dueDate) return;

    const remaining = daysUntil(task.dueDate, now);
    const tier = classifyTaskUrgencyTier(remaining);

    if (tier) rows.push({ id: task.id, title: task.title, tier, daysRemaining: remaining, kind: "task" });
  });

  // Maintenance -- same 4-day/overdue window, keyed off nextDueDate
  // instead of dueDate. A resolved (completed:true) entry never has a
  // meaningful nextDueDate left to warn about; a non-recurring one that
  // hasn't been resolved yet has no nextDueDate at all (see
  // homeCategoryConfig.ts's buildEntry), so both are naturally excluded
  // by the `!entry.nextDueDate` guard.
  homeData.maintenanceEntries.forEach((entry) => {
    if (entry.completed || !entry.nextDueDate) return;

    const remaining = daysUntil(entry.nextDueDate, now);
    const tier = classifyTaskUrgencyTier(remaining);

    if (tier) rows.push({ id: entry.id, title: entry.service, tier, daysRemaining: remaining, kind: "maintenance" });
  });

  // Recurring -- always recurring by definition (no on/off toggle), so
  // unlike Maintenance there's no completed/nextDueDate-less state to
  // guard against; every entry always has a nextDueDate.
  homeData.recurringEntries.forEach((entry) => {
    const remaining = daysUntil(entry.nextDueDate, now);
    const tier = classifyTaskUrgencyTier(remaining);

    if (tier) rows.push({ id: entry.id, title: entry.title, tier, daysRemaining: remaining, kind: "recurring" });
  });

  // Ascending by daysRemaining -- most negative (furthest overdue, most
  // urgent) first, descending in urgency from there (today, then 2
  // days out, then 4) down to "can still wait a little."
  rows.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const counts: Record<RecurringWarningTier, number> = { yellow: 0, orangeDays: 0, orangeToday: 0, red: 0 };
  rows.forEach((row) => {
    counts[row.tier] += 1;
  });

  return { counts, rows };
}

export type HomeTaskRow = {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
  notes?: string;
  isPurchase?: boolean;
  price?: number;
  isRecurring?: boolean;
  /** Set (via classifyTaskUrgencyTier) for any incomplete task within 4
   * days of -- or past -- its due date, same tier vocabulary/colors
   * Restanțe already uses, regardless of isRecurring: a plain task
   * getting urgent is just as worth coloring as a recurring one. */
  tier?: RecurringWarningTier;
  /** Only meaningful alongside `tier` -- negative once past due. */
  daysRemaining?: number;
  overdue?: boolean;
};

function isToday(dateString: string, now: Date): boolean {
  const d = new Date(dateString);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function getHomeTaskStats(homeData: HomeData): { overdue: number; dueToday: number } {
  const now = new Date();
  let overdue = 0;
  let dueToday = 0;

  homeData.taskEntries.forEach((task) => {
    if (task.completed || !task.dueDate) return;
    const remaining = daysUntil(task.dueDate, now);
    if (remaining < 0) overdue += 1;
    else if (remaining === 0) dueToday += 1;
  });

  return { overdue, dueToday };
}

/** Splits tasks into the 3 sections HomeTasksPage renders: overdue/due
 * today first (DUE SOON), everything else not yet done (ALL, soonest
 * first, no-date tasks last), and whatever was completed today (RECENT). */
export function getHomeTasksView(homeData: HomeData): {
  dueSoon: HomeTaskRow[];
  upcoming: HomeTaskRow[];
  recentDone: HomeTaskRow[];
} {
  const now = new Date();
  const dueSoon: HomeTaskRow[] = [];
  const upcoming: HomeTaskRow[] = [];
  const recentDone: HomeTaskRow[] = [];

  homeData.taskEntries.forEach((task) => {
    if (task.completed) {
      if (task.completedAt && isToday(task.completedAt, now)) {
        recentDone.push({ ...task });
      }
      return;
    }

    if (!task.dueDate) {
      upcoming.push({ ...task });
      return;
    }

    const remaining = daysUntil(task.dueDate, now);
    const tier = classifyTaskUrgencyTier(remaining);

    if (tier) {
      // Widened from "overdue or due today only" to the same 4-day
      // window Restanțe warns about -- a task with the same urgency
      // reads with the same color/label wherever it shows up, not just
      // on the recurring-only warnings page.
      dueSoon.push({ ...task, tier, daysRemaining: remaining, overdue: remaining < 0 });
    } else {
      upcoming.push({ ...task });
    }
  });

  dueSoon.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  upcoming.sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  return { dueSoon, upcoming, recentDone };
}

/** Every resolved task, newest first -- HomeTaskArchivePage's list.
 * Resolved tasks are never deleted, only marked completed, so this is
 * the one place to see all of them, not just today's (see recentDone
 * above, which is just this list's newest slice). */
export function getHomeTaskArchive(homeData: HomeData): {
  rows: HomeTaskRow[];
  spentThisMonth: number;
} {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const rows = homeData.taskEntries
    .filter((task) => task.completed)
    .map((task) => ({ ...task }))
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());

  let spentThisMonth = 0;
  rows.forEach((row) => {
    if (!row.isPurchase || !row.price || !row.completedAt) return;
    const d = new Date(row.completedAt);
    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      spentThisMonth += row.price;
    }
  });

  return { rows, spentThisMonth };
}

// -------------------------------------------------------------------
// Supply restock pattern -- how fast a tracked supply actually gets
// consumed. A raw day-gap between restocks isn't reliable on its own,
// since buying 1 unit vs. 5 units of the same product naturally lasts
// different lengths of time -- so this learns a consumption RATE
// (units/day) from every logged {date, quantity} pair instead, and
// projects it forward from however much was bought last time. Unlimited
// restocks can be logged; every interval refines the average. Only
// starts estimating after the 2nd logged restock (1 real interval), per
// the user's own rule -- a single restockHistory entry has nothing to
// measure a rate against yet.
// -------------------------------------------------------------------

export type SupplyRestockEstimate = {
  /** Units consumed per day, averaged across every logged interval. */
  averageDailyConsumption: number;
  daysSinceLastRestock: number;
  /** How many days the most recent restock's quantity is projected to
   * last, at the learned consumption rate. */
  predictedDaysUntilEmpty: number;
  /** True once daysSinceLastRestock has caught up to (or passed) the
   * predicted days-until-empty -- "probably running low by now". */
  isLow: boolean;
};

export function getSupplyRestockEstimate(entry: {
  restockHistory?: SupplyRestockEvent[];
  lastRestockedDate?: string;
}): SupplyRestockEstimate | null {
  const history = (entry.restockHistory ?? []).filter((e) => e && e.date && e.quantity > 0);
  if (history.length < 2) return null;

  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Each interval's consumption is the quantity bought at the START of
  // that interval (that's the stock that had to last until the next
  // restock), divided by how many days it took to run out.
  const rates: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / MS_PER_DAY;
    if (days > 0) rates.push(sorted[i - 1].quantity / days);
  }
  if (rates.length === 0) return null;

  const averageDailyConsumption = rates.reduce((a, b) => a + b, 0) / rates.length;
  const last = sorted[sorted.length - 1];
  const daysSinceLastRestock = (Date.now() - new Date(last.date).getTime()) / MS_PER_DAY;
  const predictedDaysUntilEmpty = last.quantity / averageDailyConsumption;

  return {
    averageDailyConsumption,
    daysSinceLastRestock,
    predictedDaysUntilEmpty,
    isLow: daysSinceLastRestock >= predictedDaysUntilEmpty,
  };
}
