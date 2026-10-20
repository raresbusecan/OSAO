/**
 * Credits ("Credite") -- `expense_credit` items in the Cheltuieli space:
 * title, amount = the monthly rate, metadata { day_of_month 1-31,
 * end_date "YYYY-MM-DD" (the last instalment), linked_space_id (a car /
 * home space, a label only) }. Created/edited through the generic Items
 * API; the server sets recurrence/due_at/status.
 *
 * A credit is NEVER an expense: it doesn't count in any space's spend or
 * budget (expensesItems.ts filters the type out), only in the Buget tab's
 * 10% "Credit" jar. On its due day it shows as a reminder in Calendar and
 * Acasă's "De făcut" -- no paid/overdue state.
 *
 * The date helpers mirror backend Item::creditDueIn / creditNextDue /
 * creditRemainingRates so the Cheltuieli list (built from /items, which
 * also returns ended credits) agrees with /budget's `credit.items`.
 */

export const CREDIT_TYPE = "expense_credit";

export type CreditEntry = {
  id: string;
  title: string;
  /** The monthly rate. */
  amount: number;
  dayOfMonth: number;
  /** "YYYY-MM-DD", the last instalment. */
  endDate: string;
  linkedSpaceId: string | null;
};

/** What GET /budget's `credit.items[]` carries (active credits only). */
export type BudgetCreditItem = {
  id: number | string;
  space_id?: number | string;
  title: string;
  amount: number;
  day_of_month: number;
  end_date: string;
  linked_space_id: number | null;
  remaining_rates: number;
  next_due: string | null;
};

export function isCreditItem(item: any): boolean {
  return item?.type === CREDIT_TYPE;
}

/** Item (API) -> CreditEntry. IDs are always strings on the frontend. */
export function itemToCredit(item: any): CreditEntry {
  const meta = item?.metadata ?? {};
  return {
    id: String(item.id),
    title: item.title ?? "",
    amount: Number(item.amount) || 0,
    dayOfMonth: Number(meta.day_of_month) || 1,
    endDate: String(meta.end_date ?? ""),
    linkedSpaceId: meta.linked_space_id != null ? String(meta.linked_space_id) : null,
  };
}

/** CreditEntry (form) -> Items API body (create or update). */
export function creditToItemBody(c: { title: string; amount: number; dayOfMonth: number; endDate: string; linkedSpaceId: string | null }, spaceId?: string | number) {
  return {
    ...(spaceId !== undefined ? { space_id: spaceId, type: CREDIT_TYPE } : {}),
    title: c.title.trim(),
    amount: c.amount,
    metadata: {
      day_of_month: c.dayOfMonth,
      end_date: c.endDate,
      linked_space_id: c.linkedSpaceId != null ? Number(c.linkedSpaceId) : null,
    },
  };
}

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The credit's due date inside the month of `month` (day clamped to the
 * month's length: 31 -> 30 in April, 28/29 in February), or null if it
 * falls after the end date. */
export function creditDueIn(dayOfMonth: number, endDate: string, month: Date): Date | null {
  if (dayOfMonth < 1 || dayOfMonth > 31) return null;
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const due = new Date(month.getFullYear(), month.getMonth(), Math.min(dayOfMonth, daysIn));
  const end = parseYmd(endDate);
  return end && due > end ? null : due;
}

/** Next due date on/after today, or null once the credit is finished. */
export function nextCreditDue(c: Pick<CreditEntry, "dayOfMonth" | "endDate">, now: Date = new Date()): Date | null {
  const today = startOfDay(now);
  for (let i = 0; i < 2; i++) {
    const due = creditDueIn(c.dayOfMonth, c.endDate, new Date(now.getFullYear(), now.getMonth() + i, 1));
    if (due && due >= today) return due;
  }
  return null;
}

/** Instalments still ahead, today's included. */
export function remainingRates(c: Pick<CreditEntry, "dayOfMonth" | "endDate">, now: Date = new Date()): number {
  const end = parseYmd(c.endDate);
  if (!end || c.dayOfMonth < 1) return 0;
  const today = startOfDay(now);
  let count = 0;
  for (let i = 0; i < 600; i++) {
    const cursor = new Date(now.getFullYear(), now.getMonth() + i, 1);
    if (cursor > end) break;
    const due = creditDueIn(c.dayOfMonth, c.endDate, cursor);
    if (due && due >= today) count++;
  }
  return count;
}

/** Still counts this month (backend scopeActiveCredits): its end date is
 * on/after the 1st of the current month. */
export function isCreditActive(c: Pick<CreditEntry, "endDate">, now: Date = new Date()): boolean {
  const end = parseYmd(c.endDate);
  if (!end) return false;
  return end >= new Date(now.getFullYear(), now.getMonth(), 1);
}

/** "2029-03-15" -> Date, for display with roDate(). */
export function creditEndAsDate(endDate: string): Date | null {
  return parseYmd(endDate);
}
