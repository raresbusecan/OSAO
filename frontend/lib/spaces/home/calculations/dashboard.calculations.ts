import type { HomeData } from "@/components/spaces/home/home.data.types";
import { roCount } from "@/lib/format";
import type { HomeNextItem } from "@/components/spaces/home/home.ui.types";
import type { SupplyRestockEvent } from "@/lib/spaces/home/home.types";
import type { SeverityTier } from "@/lib/statusColors";
import type { ThemeColors } from "@/lib/theme";
import { getThisMonthHomeSpend } from "./spend.calculations";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DOC_ALERT_DAYS = 45;
const DUE_ALERT_DAYS = 14;
// DUE SOON's own outer window (see getHomeTasksView) -- classifyTaskUrgencyTier
// already colors anything within 0-4 days/overdue, this just extends the
// same section a bit further (5-10 days) uncolored, instead of a task
// vanishing from the page entirely between "4 days" and "ALL".
const DUE_SOON_MAX_DAYS = 10;

/** Kept as the existing public name (used by HomeDashboard's stat card
 * and lib/dashboard/monthlyExpenses.ts's cross-space aggregator) --
 * the actual 3-source definition now lives in spend.calculations.ts's
 * getHomeSpendRecords, shared with HomeSpendPage so the two can never
 * quietly disagree on what counts as "this month's spend". */
export function getThisMonthHomeExpenses(homeData: HomeData): number {
  return getThisMonthHomeSpend(homeData);
}

export function daysUntil(dateString: string, now: Date): number {
  return Math.ceil(
    (new Date(dateString).getTime() - now.getTime()) / MS_PER_DAY,
  );
}

export function dueSubtitle(daysRemaining: number, verb: "Expires" | "Due"): string {
  const days = Math.abs(daysRemaining);
  if (verb === "Expires") {
    if (daysRemaining < 0) return `a expirat acum ${roCount(days, "zi", "zile")}`;
    if (daysRemaining === 0) return "expiră azi";
    return `expiră în ${roCount(days, "zi", "zile")}`;
  }
  if (daysRemaining < 0) return `restant de ${roCount(days, "zi", "zile")}`;
  if (daysRemaining === 0) return "azi";
  return `în ${roCount(days, "zi", "zile")}`;
}

const DOC_TIER_WARNING_DAYS = 30;
const DOC_TIER_CRITICAL_DAYS = 15;

/**
 * Documents' own 3-band urgency split -- same day thresholds as Car's
 * own document tiers (its DOC_TIER_MEDIUM_DAYS/DOC_TIER_CRITICAL_DAYS),
 * expressed directly in the shared SeverityTier language (lib/statusColors.ts)
 * so a Documents row colors the same red/orange/yellow way everything
 * else severity-based in the app does. A document's own alert window
 * (DOC_ALERT_DAYS, 45 days -- already used by getUpcomingHomeItems above)
 * is much wider than a task's 4-day one, so this can't just reuse
 * classifyTaskUrgencyTier below. undefined outside the window --
 * expired (negative days) still counts as "critical", never undefined.
 */
export function classifyDocumentUrgencyTier(remaining: number): SeverityTier | undefined {
  if (remaining > DOC_ALERT_DAYS) return undefined;
  if (remaining <= DOC_TIER_CRITICAL_DAYS) return "critical";
  if (remaining <= DOC_TIER_WARNING_DAYS) return "warning";
  return "caution";
}

/** Dedicated 4-stop color gradient for task/maintenance/recurring
 * urgency -- pulled out here so the Task-uri tile's dots,
 * HomeTasksPage, and HomeRecurringWarningsPage all read the same color
 * for the same tier instead of independent copies. Per explicit user
 * request, `error`/red is reserved STRICTLY for genuinely overdue
 * ("red"/restant) -- an earlier version of this collapsed "orangeToday"
 * onto the same red (to fix Azi/2-zile looking identical), but that then
 * made two DIFFERENT tiers (restant, azi) render as indistinguishable
 * same-color dots with no text label to tell them apart. Settled on a
 * plain red/orange/yellow/neutral gradient instead -- restant -> azi ->
 * 2 zile -> 4 zile, most to least urgent -- `onSurfaceTertiary` standing
 * in for "alb" (white): a literal #FFFFFF would vanish against this
 * app's near-white light-mode cards, so this reuses the same neutral
 * gray already used everywhere else in the app for "de-emphasized, not
 * really an alert" (e.g. WarningCount's own labels), which stays
 * visible in both themes since it already flips dark-on-light/light-on-
 * dark like every other theme token here. */
export function recurringWarningTierColor(tier: RecurringWarningTier, colors: ThemeColors): string {
  switch (tier) {
    case "red":
      return colors.error;
    case "orangeToday":
      return colors.warning;
    case "orangeDays":
      return colors.caution;
    case "yellow":
      return colors.onSurfaceTertiary;
  }
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
  /** Always true for "maintenance"/"recurring" (both only ever appear
   * here when they genuinely recur -- see the guards below), only
   * sometimes true for "task" now that a plain, non-recurring task can
   * show up here too. Lets the page pick a "this repeats" vs. "this is
   * just urgent" icon instead of a blanket repeat glyph on every row. */
  isRecurring: boolean;
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

/** Tasks only (not maintenance/recurring, unlike getRecurringTaskWarnings
 * below) -- one count per urgency tier, for HomeDashboard's "Task-uri"
 * category tile: a dot per tier next to the tile's own label, per
 * explicit user request ("unde exista deja bulina de restante rosii sa
 * punem bulina si pentru celelalte stari"), scoped to tasks since that's
 * what the tile itself represents (Maintenance/Recurring already have
 * their own separate tiles/badges). */
export function getTaskTierCounts(homeData: HomeData): Record<RecurringWarningTier, number> {
  const now = new Date();
  const counts: Record<RecurringWarningTier, number> = { yellow: 0, orangeDays: 0, orangeToday: 0, red: 0 };

  homeData.taskEntries.forEach((task) => {
    if (task.completed || !task.dueDate) return;
    const tier = classifyTaskUrgencyTier(daysUntil(task.dueDate, now));
    if (tier) counts[tier] += 1;
  });

  return counts;
}

/** Same idea as getTaskTierCounts, for Mentenanță's own tile -- per
 * explicit user request, every category tile gets its OWN dots from its
 * OWN entries now (not a combined Task+Maintenance+Recurring total),
 * so a dot always traces back to exactly one tile/category, never a
 * mix. Same nextDueDate/completed guards as getRecurringTaskWarnings'
 * own Maintenance loop. */
export function getMaintenanceTierCounts(homeData: HomeData): Record<RecurringWarningTier, number> {
  const now = new Date();
  const counts: Record<RecurringWarningTier, number> = { yellow: 0, orangeDays: 0, orangeToday: 0, red: 0 };

  homeData.maintenanceEntries.forEach((entry) => {
    if (entry.completed || !entry.nextDueDate) return;
    const tier = classifyTaskUrgencyTier(daysUntil(entry.nextDueDate, now));
    if (tier) counts[tier] += 1;
  });

  return counts;
}

/** Same idea as getTaskTierCounts, for Recurente's own tile. */
export function getRecurringTierCounts(homeData: HomeData): Record<RecurringWarningTier, number> {
  const now = new Date();
  const counts: Record<RecurringWarningTier, number> = { yellow: 0, orangeDays: 0, orangeToday: 0, red: 0 };

  homeData.recurringEntries.forEach((entry) => {
    const tier = classifyTaskUrgencyTier(daysUntil(entry.nextDueDate, now));
    if (tier) counts[tier] += 1;
  });

  return counts;
}

export function getRecurringTaskWarnings(homeData: HomeData): {
  counts: Record<RecurringWarningTier, number>;
  rows: RecurringWarningRow[];
} {
  const now = new Date();
  const rows: RecurringWarningRow[] = [];

  // Any urgent task, recurring or not -- widened per explicit user
  // request to match getHomeTasksView's own DUE SOON population below,
  // which already shows both. A non-recurring task still disappears
  // for good once resolved (archives instead of advancing), it just
  // also gets a heads-up here while it's still open and urgent, same
  // as it already does on the main Tasks page.
  homeData.taskEntries.forEach((task) => {
    if (task.completed || !task.dueDate) return;

    const remaining = daysUntil(task.dueDate, now);
    const tier = classifyTaskUrgencyTier(remaining);

    if (tier) rows.push({ id: task.id, title: task.title, tier, daysRemaining: remaining, kind: "task", isRecurring: !!task.isRecurring });
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

    if (tier) rows.push({ id: entry.id, title: entry.service, tier, daysRemaining: remaining, kind: "maintenance", isRecurring: true });
  });

  // Recurring -- always recurring by definition (no on/off toggle), so
  // unlike Maintenance there's no completed/nextDueDate-less state to
  // guard against; every entry always has a nextDueDate.
  homeData.recurringEntries.forEach((entry) => {
    const remaining = daysUntil(entry.nextDueDate, now);
    const tier = classifyTaskUrgencyTier(remaining);

    if (tier) rows.push({ id: entry.id, title: entry.title, tier, daysRemaining: remaining, kind: "recurring", isRecurring: true });
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
  /** See HomeTaskEntry.sortOrder -- carried through via the `{...task}`
   * spread below, declared here too so getHomeTasksView's `upcoming`
   * sort (and HomeTasksPage's drag-reorder) can read it. */
  sortOrder?: number | null;
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

/** Splits tasks into the 3 sections HomeTasksPage renders: everything
 * due within 10 days or already overdue (DUE SOON -- colored by tier
 * when within 0-4 days/overdue, same as Restanțe, plain otherwise for
 * the 5-10 day window), everything else not yet done (ALL, soonest
 * first, no-date tasks last), and whatever was completed today
 * (RECENT). Restanțe (on Home's main page) also shows 0-4 day/overdue
 * tasks, combined with Maintenance/Recurring -- that's a deliberate
 * duplication, not a bug: Restanțe is reachable without opening Tasks
 * at all, so a task page that hid its own urgent tasks would leave
 * nothing to actually resolve them from while already on this page. */
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
      dueSoon.push({ ...task, tier, daysRemaining: remaining, overdue: remaining < 0 });
    } else if (remaining <= DUE_SOON_MAX_DAYS) {
      dueSoon.push({ ...task, daysRemaining: remaining });
    } else {
      upcoming.push({ ...task });
    }
  });

  dueSoon.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  // Manually dragged rows (HomeTasksPage's own drag-reorder) come
  // first, in the order they were dropped -- everything never touched
  // falls back to the pre-existing due-date sort, same "manual order
  // first, then the old fallback" split SpaceController::index() uses
  // server-side for Spaces.
  const manuallyOrdered = upcoming
    .filter((t) => t.sortOrder != null)
    .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number));
  const dateOrdered = upcoming
    .filter((t) => t.sortOrder == null)
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  return { dueSoon, upcoming: [...manuallyOrdered, ...dateOrdered], recentDone };
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

export type HomeMaintenanceArchiveRow = {
  id: string;
  title: string;
  completedAt?: string;
  price: number;
};

/** Every resolved (non-recurring, completed:true) Maintenance entry,
 * newest first -- HomeMaintenanceArchivePage's list. A recurring entry
 * never appears here at all (it never sets `completed`, see
 * homeCategoryConfig.ts's resolveEntry -- resolving one just advances
 * nextDueDate and keeps it active). Mirrors getHomeTaskArchive's own
 * shape so both archives read the same way. */
export function getHomeMaintenanceArchive(homeData: HomeData): {
  rows: HomeMaintenanceArchiveRow[];
  spentThisMonth: number;
} {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const rows: HomeMaintenanceArchiveRow[] = homeData.maintenanceEntries
    .filter((entry) => entry.completed)
    .map((entry) => ({ id: entry.id, title: entry.service, completedAt: entry.completedAt, price: entry.price }))
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());

  let spentThisMonth = 0;
  rows.forEach((row) => {
    if (!row.price || !row.completedAt) return;
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
