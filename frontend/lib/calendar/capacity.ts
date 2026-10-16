/**
 * Calendar capacity model (2026-10, user-approved): how full a day / a
 * month is, measured against how much free time that day has, instead of
 * a plain count of what falls on it. Every knob lives in this one file so
 * it's easy to tune.
 *
 *  - Day capacity, in effort units: COMFORTABLE (what fits easily) and MAX
 *    (what fits at all). A workday has less room than a weekend.
 *  - Item effort, by `items.type` (see backend/app/Models/Item.php and
 *    CalendarController for what the /calendar payload carries).
 *  - A day's heat = effort / that day's MAX, mapped onto the 8 heat shades
 *    (lib/statusColors.ts `heatLevel`). COMFORTABLE = MAX / 2, so the
 *    comfort level sits at exactly half of every scale.
 *  - A month's fill = its total effort / the sum of its days' MAX.
 *
 * Out of scope for now: a user-configurable work schedule (planned later),
 * vacations, learning capacity from history.
 */

/**
 * ASSUMPTION, hardcoded until the work-schedule setting exists: a 9-17 job
 * Monday to Friday. Weekends and Romanian public holidays are free days.
 */
export const WORKDAY_CAPACITY = { comfortable: 2, max: 4 } as const;
export const FREE_DAY_CAPACITY = { comfortable: 4, max: 8 } as const;

/** Things that need business hours (a garage, an ITP station, an office,
 * a technician at home) cost more on a workday -- you have to take time
 * off for them. */
export const BUSINESS_HOURS_WORKDAY_FACTOR = 1.5;

type EffortRule = { effort: number; businessHours?: boolean };

/** Effort per item type. Payments are quick (often online); a list or a
 * small chore takes a while; a service, an inspection or a renewal takes
 * a trip and part of a day. */
export const TYPE_EFFORT: Record<string, EffortRule> = {
  // A bill or an online payment.
  home_recurring: { effort: 0.5 },
  expense_credit: { effort: 0.5 }, // credit instalment reminders
  expense_item: { effort: 0.5 },
  home_expense: { effort: 0.5 },
  car_expense: { effort: 0.5 },
  // A shopping list or a small chore.
  grocery_list: { effort: 1 },
  grocery_trip: { effort: 1 },
  home_task: { effort: 1 },
  home_supply: { effort: 1 },
  car_fuel: { effort: 1 },
  custom_event: { effort: 1 },
  // A car service / repair, an inspection or a document renewal, or a
  // technician visit at home.
  car_maintenance: { effort: 3, businessHours: true },
  car_document: { effort: 3, businessHours: true },
  home_document: { effort: 3, businessHours: true },
  home_maintenance: { effort: 3, businessHours: true },
};
/** Anything not in the map above (a type added later). */
export const DEFAULT_EFFORT = 1;

/** Month fill thresholds (fill = effort / sum of MAX capacity). */
export const COMFORT_FILL = 0.5;

/* ---------------- Romanian public holidays ---------------- */

/** Orthodox Easter Sunday (Julian computus + 13 days, valid 1900-2099). */
export function orthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 = March, 4 = April (Julian)
  const day = ((d + e + 114) % 31) + 1;
  return new Date(year, month - 1, day + 13);
}

function key(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const holidayCache = new Map<number, Set<string>>();

/**
 * Legal public holidays (Codul muncii art. 139, list checked 2026-10:
 * 17 holidays, 6 and 7 January included; 16 dates in 2026, since
 * Rusalii Monday falls on 1 June that year): 1-2 Jan,
 * 6 Jan (Boboteaza), 7 Jan (Sf. Ioan), 24 Jan, Orthodox Good Friday,
 * Easter Sunday + Monday, 1 May, 1 June, Rusalii Sunday + Monday (Easter
 * + 49/50), 15 Aug, 30 Nov, 1 Dec, 25-26 Dec. Keys are "YYYY-MM-DD".
 */
export function roHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const easter = orthodoxEaster(year);
  const fromEaster = (n: number) => key(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + n));
  const fixed = ["01-01", "01-02", "01-06", "01-07", "01-24", "05-01", "06-01", "08-15", "11-30", "12-01", "12-25", "12-26"];
  const set = new Set<string>([
    ...fixed.map((md) => `${year}-${md}`),
    fromEaster(-2), // Vinerea Mare
    fromEaster(0),
    fromEaster(1),
    fromEaster(49), // Rusalii
    fromEaster(50),
  ]);
  holidayCache.set(year, set);
  return set;
}

/** A free day: Saturday, Sunday or a legal holiday. */
export function isFreeDay(d: Date): boolean {
  const wd = d.getDay();
  return wd === 0 || wd === 6 || roHolidays(d.getFullYear()).has(key(d));
}

export function dayCapacity(d: Date) {
  return isFreeDay(d) ? FREE_DAY_CAPACITY : WORKDAY_CAPACITY;
}

/* ---------------- effort ---------------- */

/** One item's effort on a given day. */
export function itemEffort(type: string | undefined, day: Date): number {
  const rule = (type && TYPE_EFFORT[type]) || null;
  if (!rule) return DEFAULT_EFFORT;
  return rule.businessHours && !isFreeDay(day) ? rule.effort * BUSINESS_HOURS_WORKDAY_FACTOR : rule.effort;
}

/** Total effort of a day's items. */
export function dayEffort(items: { type?: string }[] | undefined, day: Date): number {
  if (!items?.length) return 0;
  return items.reduce((sum, it) => sum + itemEffort(it.type, day), 0);
}

/** A day's load as a share of its MAX capacity (1 = completely full). */
export function dayShare(items: { type?: string }[] | undefined, day: Date): number {
  return dayEffort(items, day) / dayCapacity(day).max;
}

export type MonthStatus = "calm" | "full" | "over";

export function monthStatus(fill: number): MonthStatus {
  return fill > 1 ? "over" : fill > COMFORT_FILL ? "full" : "calm";
}

export const MONTH_STATUS_LABEL: Record<MonthStatus, string> = {
  calm: "Liniștită",
  full: "Plină",
  over: "Prea plină",
};
