/**
 * Romanian display formatting shared by every redesigned screen. The
 * app's UI is Romanian-only; numbers use "ro-RO" grouping ("1.234"),
 * money is "lei", dates read "1 octombrie".
 */

/** "1 zi", "5 zile", "20 de zile", "101 zile" -- Romanian puts "de"
 * between a count and its noun from 20 up, except when the number's
 * last two digits are 01-19. */
export function roCount(n: number, one: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) return `${n} ${one}`;
  const lastTwo = abs % 100;
  if (abs === 0 || (lastTwo >= 1 && lastTwo <= 19)) return `${n} ${many}`;
  return `${n} de ${many}`;
}

/** A number typed the Romanian way, in JS syntax: "1.250,50" -> "1250.50",
 * "125.210" -> "125210", "1 250" -> "1250", "12,5" -> "12.5". A dot
 * followed by exactly three digits is a thousands separator -- the app
 * itself shows "125.210 km" -- except after a lone 0 ("0.500"). */
export function normalizeNumberText(raw: string): string {
  let s = (raw ?? "").trim().replace(/(\d)\s+(?=\d{3}(?:\D|$))/g, "$1");
  if (!/^-?0\./.test(s)) s = s.replace(/(\d)\.(?=\d{3}(?:\D|$))/g, "$1");
  return s.replace(",", ".");
}

/** A typed clock time -> {hh, mm}: "14:30", "14.30", "9" all work; "" means
 * the 09:00 default. null for anything impossible ("25:70", "abc"), so the
 * form can say so instead of silently saving another hour. */
export function parseClockTime(raw: string): { hh: number; mm: number } | null {
  const s = (raw ?? "").trim();
  if (!s) return { hh: 9, mm: 0 };
  const m = /^(\d{1,2})(?:[:.,h](\d{2}))?$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]), mm = m[2] ? Number(m[2]) : 0;
  return hh <= 23 && mm <= 59 ? { hh, mm } : null;
}

/** Number(normalizeNumberText(raw)); "" stays 0, like Number(""). */
export function parseLocaleNumber(raw: string): number {
  return Number(normalizeNumberText(raw));
}

/** "1.234" */
export function roNumber(n: number | string, maxFractionDigits = 0): string {
  return Number(n).toLocaleString("ro-RO", { maximumFractionDigits: maxFractionDigits });
}

/** "1.234 lei" (amounts are whole lei unless the value has decimals). */
export function lei(n: number | string): string {
  // Number(): Laravel's decimal casts arrive as strings ("450.00"), and
  // String#toLocaleString returns them unformatted.
  return `${Number(n).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei`;
}

/** "1 octombrie" (+ year when it isn't the current one). */
export function roDate(input: string | Date, opts?: { withYear?: boolean; short?: boolean }): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  const withYear = opts?.withYear ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: opts?.short ? "short" : "long", ...(withYear ? { year: "numeric" } : {}) });
}

/** Whole LOCAL calendar days from today to `input` (0 = today, -1 =
 * yesterday), ignoring the time of day. The one day-difference every
 * "Azi"/"Restant N zile"/"în N zile" label and every grouping should
 * use -- millisecond math with ceil/round put a task due tonight at
 * 21:00 into "în 1 zi" and split headers from their own row chips. */
export function daysFromToday(input: string | Date, now: Date = new Date()): number {
  const d = typeof input === "string" ? new Date(input) : input;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

/** Relative day label: "Azi", "Mâine", "Ieri", "în 5 zile", "acum 3 zile". */
export function roRelativeDays(days: number): string {
  if (days === 0) return "Azi";
  if (days === 1) return "Mâine";
  if (days === -1) return "Ieri";
  return days > 0 ? `în ${roCount(days, "zi", "zile")}` : `acum ${roCount(-days, "zi", "zile")}`;
}

/** Display unit: the stored default "pcs" (and "pc") reads "buc."; any
 * other unit ("kg", "l", "g") is shown as typed. */
export function roUnit(unit: string | null | undefined): string {
  if (!unit) return "";
  return /^pcs?\.?$/i.test(unit.trim()) ? "buc." : unit;
}

/** Capitalize the first letter ("duminică" -> "Duminică"). */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
