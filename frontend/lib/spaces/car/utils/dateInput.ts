/**
 * Shared DD.MM.YYYY <-> Date conversion for every Car form's "Date"
 * field (Fuel, Maintenance, Expense -- see their forms). Documents don't
 * use this: their Issue/Expiry Date fields are their own free-text
 * strings, not the record's `date` (see CarDocumentForm.tsx), which
 * drives sorting/RECENT/History everywhere else in the Car space.
 *
 * Reuses the DD.MM.YYYY format CarDocumentForm already established for
 * dates in this space, just adding the ISO round-trip those two fields
 * never needed (issueDate/expiryDate are stored as-typed, never parsed
 * back into a Date).
 */

/** ISO string (or a Date) -> "DD.MM.YYYY" for pre-filling the field --
 * defaults new entries to today, edits show the entry's existing date. */
export function formatDateInput(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}.${month}.${year}`;
}

export function isValidDateInput(value: string): boolean {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return false;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** "DD.MM.YYYY" -> ISO string for the entry's `date` field. Returns null
 * for anything isValidDateInput would also reject -- callers validate
 * first and never see null in practice. */
export function parseDateInput(value: string): string | null {
  if (!isValidDateInput(value)) return null;

  const [day, month, year] = value.split(".").map(Number);
  return new Date(year, month - 1, day).toISOString();
}
