/**
 * Documents only -- not Fuel/Maintenance/Expense. A document stops being
 * editable the moment it's explicitly archived (superseded by a
 * renewal, see dashboard.calculations.ts) -- editing a filed one after
 * the fact risks quietly rewriting what was actually recorded, so once
 * archived it stays exactly as saved, viewable but read-only (see
 * CarDocumentForm's `readOnly` prop).
 *
 * Used to lock on age too (falling out of CarDashboard's 7-day RECENT/
 * ALL window), back when documents lived in that time-windowed feed.
 * Documents now live in their own permanent, un-windowed CarDocsPage
 * instead (see the user's own "Docs, not Recent/All" request), so
 * "current" no longer has an age dimension for them -- only `archived`
 * still does.
 *
 * Takes just the field it needs so it works on a full CarDocumentEntry
 * (CarDashboard.tsx's openEntryForEdit) as well as the lighter
 * CarRecentItem shape.
 */
export function isDocumentLocked(entry: { archived?: boolean }): boolean {
  return !!entry.archived;
}
