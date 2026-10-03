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

/** "1.234" */
export function roNumber(n: number, maxFractionDigits = 0): string {
  return n.toLocaleString("ro-RO", { maximumFractionDigits: maxFractionDigits });
}

/** "1.234 lei" (amounts are whole lei unless the value has decimals). */
export function lei(n: number): string {
  return `${n.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei`;
}

/** "1 octombrie" (+ year when it isn't the current one). */
export function roDate(input: string | Date, opts?: { withYear?: boolean; short?: boolean }): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  const withYear = opts?.withYear ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: opts?.short ? "short" : "long", ...(withYear ? { year: "numeric" } : {}) });
}

/** Relative day label: "Azi", "Mâine", "Ieri", "în 5 zile", "acum 3 zile". */
export function roRelativeDays(days: number): string {
  if (days === 0) return "Azi";
  if (days === 1) return "Mâine";
  if (days === -1) return "Ieri";
  return days > 0 ? `în ${roCount(days, "zi", "zile")}` : `acum ${roCount(-days, "zi", "zile")}`;
}

/** Capitalize the first letter ("duminică" -> "Duminică"). */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
