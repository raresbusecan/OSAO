import { periodCutoffDate } from "../calculations/expenses.calculations";

/**
 * Documents only -- not Fuel/Maintenance/Expense. A document stops being
 * editable the moment it's no longer "current": either explicitly
 * archived (superseded by a renewal, see dashboard.calculations.ts) or
 * simply old enough to have fallen out of CarDashboard's 7-day window and
 * now only reachable through History. Editing a filed/expired document
 * after the fact risks quietly rewriting what was actually recorded --
 * once it's archived or historical it should stay exactly as saved,
 * viewable but read-only (see CarDocumentForm's `readOnly` prop).
 *
 * Takes just the two fields it needs so it works on a full
 * CarDocumentEntry (CarDashboard.tsx's openEntryForEdit) as well as the
 * lighter CarRecentItem shape (CarHistoryPage.tsx's row list).
 */
export function isDocumentLocked(
  entry: { archived?: boolean; date: string },
  referenceDate: Date = new Date(),
): boolean {
  if (entry.archived) return true;

  const cutoff = periodCutoffDate({ kind: "weeks", count: 1 }, referenceDate);
  if (!cutoff) return false;

  return new Date(entry.date).getTime() < cutoff.getTime();
}
