import { roCount } from "@/lib/format";

/**
 * A display/history period ("Ultimele 3 luni", "Luna asta", "Tot timpul")
 * -- the value behind every period selector (components/ui/PeriodPicker.tsx).
 * Each page keeps its own narrower type (CarExpensePeriod has no
 * "thisMonth") and its own filter; this is the common shape they all fit.
 */
export type PeriodValue =
  | { kind: "all" }
  | { kind: "thisMonth" }
  | { kind: "weeks"; count: number }
  | { kind: "months"; count: number }
  | { kind: "years"; count: number };

/** The custom "Ultimele N ..." unit the picker's stepper offers. */
export type CustomPeriodUnit = "weeks" | "months";

export type PeriodPreset<P extends PeriodValue = PeriodValue> = { label: string; period: P };

export function periodsEqual(a: PeriodValue, b: PeriodValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "all" || a.kind === "thisMonth") return true;
  return (a as { count: number }).count === (b as { count: number }).count;
}

/** "Tot timpul", "Luna asta", "Ultima săptămână", "Ultimele 3 luni",
 * "Ultimul an", "Ultimii 2 ani". */
export function formatPeriodLabel(period: PeriodValue): string {
  if (period.kind === "all") return "Tot timpul";
  if (period.kind === "thisMonth") return "Luna asta";
  if (period.kind === "weeks") {
    return period.count === 1 ? "Ultima săptămână" : `Ultimele ${roCount(period.count, "săptămână", "săptămâni")}`;
  }
  if (period.kind === "months") {
    return period.count === 1 ? "Ultima lună" : `Ultimele ${roCount(period.count, "lună", "luni")}`;
  }
  return period.count === 1 ? "Ultimul an" : `Ultimii ${roCount(period.count, "an", "ani")}`;
}
