/**
 * "Recent" means exactly one thing across the Car space: recorded today.
 * The moment the calendar day changes, an entry quietly drops out of
 * whatever "Recent" section it was in and just becomes a normal row in
 * the regular list -- no separate "recent" flag stored anywhere, this is
 * purely a live comparison against the current date every time the
 * dashboard/Expenses page renders.
 */
export function isRecentToday(dateStr: string, referenceDate: Date = new Date()): boolean {
  const d = new Date(dateStr);

  return (
    d.getFullYear() === referenceDate.getFullYear() &&
    d.getMonth() === referenceDate.getMonth() &&
    d.getDate() === referenceDate.getDate()
  );
}
