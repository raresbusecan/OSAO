/**
 * Obiectiv de economii (Buget's Economii card): how much to save per
 * day / week / month to reach `target` by `targetDate`. Pure, so it is
 * tested directly (tests/budget-goal.test.cjs).
 *
 * Dates are local calendar days ("YYYY-MM-DD"); the server's
 * `target_date` may come as a full ISO timestamp, only its first 10
 * characters count.
 */

export type GoalPace =
  | { status: "none" }
  | { status: "reached"; remaining: 0 }
  | { status: "no-date"; remaining: number }
  | { status: "overdue"; remaining: number }
  | {
      status: "ok";
      remaining: number;
      /** Days from today until the target date (the date itself excluded; today = 1). */
      days: number;
      perDay: number;
      perWeek: number;
      perMonth: number;
      /** Pui deoparte covers perMonth on its own; null without a plan. */
      onTrack: boolean | null;
    };

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 365.25 / 12;

/** "YYYY-MM-DD" (or a longer ISO string) -> UTC midnight ms of that calendar day. */
function dayNumber(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** A local Date -> "YYYY-MM-DD" of its calendar day. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function goalPace(input: {
  target: number;
  current: number;
  targetDate: string | null | undefined;
  /** "YYYY-MM-DD", the user's today. */
  today: string;
  /** Pui deoparte per month; null/undefined = no income plan. */
  setAside?: number | null;
}): GoalPace {
  const { target, current } = input;
  if (!(target > 0)) return { status: "none" };
  const remaining = Math.max(0, target - Math.max(0, current));
  if (remaining <= 0) return { status: "reached", remaining: 0 };
  const end = input.targetDate ? dayNumber(input.targetDate) : null;
  const start = dayNumber(input.today);
  if (end == null || start == null) return { status: "no-date", remaining };
  const diff = Math.round((end - start) / DAY_MS);
  if (diff < 0) return { status: "overdue", remaining };
  // Today itself (the picker allows it) = one last day, not "too late".
  const days = Math.max(1, diff);
  const perDay = remaining / days;
  const perMonth = days < DAYS_PER_MONTH ? remaining : perDay * DAYS_PER_MONTH;
  return {
    status: "ok",
    remaining,
    days,
    perDay,
    perWeek: days < 7 ? remaining : perDay * 7,
    perMonth,
    onTrack: input.setAside == null ? null : input.setAside >= perMonth - 0.5,
  };
}

// ---- The goal's rhythm (2026-11): tapping a "pe zi / pe săptămână / pe
// lună" cell picks it, every later tap confirms money put aside. Mirrors
// backend App\Services\SavingsCadence (periods, reminder days).

export type Cadence = "day" | "week" | "month";

/** Average periods per month (SavingsCadence::PER_MONTH): Pui deoparte's estimate. */
export const PER_MONTH: Record<Cadence, number> = { day: 365.25 / 12, week: 365.25 / 12 / 7, month: 1 };

export const CADENCE_TEXT: Record<Cadence, { per: string; period: string; periods: string; thisPeriod: string }> = {
  day: { per: "pe zi", period: "zi", periods: "zile", thisPeriod: "azi" },
  week: { per: "pe săptămână", period: "săptămână", periods: "săptămâni", thisPeriod: "săptămâna aceasta" },
  month: { per: "pe lună", period: "lună", periods: "luni", thisPeriod: "luna aceasta" },
};

export function monthlyEstimate(cadence: Cadence, amount: number): number {
  return Math.round(amount * PER_MONTH[cadence]);
}

function addDays(day: string, n: number): string {
  const ms = dayNumber(day)! + n * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The next `count` reminder days from `today` on (today included):
 * every day; every 7th day from `since`; or `since`'s day of the month
 * (clamped to the month's length). A day in the current period is left
 * out when that period is already confirmed (`periodDone`).
 */
export function reminderDays(cadence: Cadence, since: string, today: string, periodDone: boolean, count: number): string[] {
  const start = dayNumber(since.slice(0, 10));
  const now = dayNumber(today);
  if (start == null || now == null) return [];
  const sinceDay = Number(since.slice(8, 10));
  const out: string[] = [];
  let day = now > start ? today : since.slice(0, 10);
  for (let guard = 0; out.length < count && guard < 400; guard++, day = addDays(day, 1)) {
    const n = dayNumber(day)!;
    const [y, m, d] = day.split("-").map(Number);
    const hit =
      cadence === "day" ||
      (cadence === "week" && Math.round((n - start) / DAY_MS) % 7 === 0) ||
      (cadence === "month" && d === Math.min(sinceDay, new Date(Date.UTC(y, m, 0)).getUTCDate()));
    if (!hit) continue;
    const week = (ms: number) => Math.floor(Math.round((ms - start) / DAY_MS) / 7);
    const current = cadence === "month" ? day.slice(0, 7) === today.slice(0, 7) : cadence === "week" ? week(n) === week(now) : day === today;
    if (current && periodDone) continue;
    out.push(day);
  }
  return out;
}
