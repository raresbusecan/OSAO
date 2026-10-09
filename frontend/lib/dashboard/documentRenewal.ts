import { chooseAction } from "@/lib/confirm";
import { roDate } from "@/lib/format";
import { formatDateInput, isValidDateInput, parseDateInput } from "@/lib/spaces/car/utils/dateInput";

/** "10.10.2026" (Car) or an ISO string (Casă) -> local Date at midnight. */
export function parseDocDate(value?: string | null): Date | null {
  if (!value) return null;
  const iso = isValidDateInput(value) ? parseDateInput(value) : value;
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  // Clamp 31 Jan + 1 month to the last day of February, not 3 March.
  if (r.getDate() !== d.getDate()) r.setDate(0);
  return r;
}

/**
 * The next validity period of a renewed document, from the VALIDITY
 * dates on the old one -- never from when it was typed into the app.
 * Starts the day after the old one expires (or today, if it already has)
 * and lasts as long as the old one did, in whole months (12.09.2025 ->
 * 11.09.2026 renews as 12.09.2026 -> 11.09.2027); a document with no
 * issue date is assumed to run a year.
 */
export function renewalPeriod(issue?: string | null, expiry?: string | null): { issue: Date; expiry: Date } | null {
  const oldExpiry = parseDocDate(expiry);
  if (!oldExpiry) return null;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayAfter = new Date(oldExpiry.getFullYear(), oldExpiry.getMonth(), oldExpiry.getDate() + 1);
  const start = dayAfter.getTime() < startOfToday.getTime() ? startOfToday : dayAfter;

  const oldIssue = parseDocDate(issue);
  const days = oldIssue ? (oldExpiry.getTime() - oldIssue.getTime()) / 86400000 + 1 : 0;
  const months = oldIssue && days > 0 ? Math.max(1, Math.round(days / 30.4375)) : 12;
  const end = addMonths(start, months);
  end.setDate(end.getDate() - 1);
  return { issue: start, expiry: end };
}

export const toCarDate = (d: Date) => formatDateInput(d);
export const toIsoDate = (d: Date) => d.toISOString();

/** "11 oct. 2026 – 10 oct. 2027" */
export function periodLabel(p: { issue: Date; expiry: Date }): string {
  return `${roDate(p.issue, { short: true, withYear: true })} – ${roDate(p.expiry, { short: true, withYear: true })}`;
}

/** The renewal pop-up, same everywhere a document can be swiped. */
export function askRenewal(title: string, period: { issue: Date; expiry: Date } | null): Promise<string | null> {
  return chooseAction(
    `Reînnoiești „${title}”?`,
    `Reînnoiește documentul conform informațiilor salvate inițial sau modifică informațiile.${period ? ` Noua valabilitate: ${periodLabel(period)}.` : ""}`,
    period
      ? [
          { key: "saved", label: "Reînnoiește cu datele vechi" },
          { key: "edit", label: "Modifică informațiile", secondary: true },
        ]
      : [{ key: "edit", label: "Modifică informațiile" }],
  );
}

/** "RCA 2026" renewed into 2027 reads "RCA 2027"; a title without the
 * old expiry's year stays as it is. */
export function renewedTitle(title: string, oldExpiry: Date | null, newExpiry: Date): string {
  if (!oldExpiry) return title;
  const oldYear = String(oldExpiry.getFullYear());
  return title.includes(oldYear) ? title.replace(oldYear, String(newExpiry.getFullYear())) : title;
}
