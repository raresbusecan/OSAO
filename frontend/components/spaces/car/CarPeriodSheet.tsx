import type { PeriodPreset } from "@/lib/period";
import type { CarExpensePeriod } from "@/lib/spaces/car/calculations/expenses.calculations";

/** Mașină's period presets (Istoric, Cheltuieli). The picker itself is
 * the shared components/ui/PeriodPicker.tsx (it used to live here as
 * CarPeriodSheet, until every period selector in the app adopted it). */
export const CAR_PERIOD_PRESETS: PeriodPreset<CarExpensePeriod>[] = [
  { label: "Tot timpul", period: { kind: "all" } },
  { label: "Ultimele 3 luni", period: { kind: "months", count: 3 } },
  { label: "Ultimele 6 luni", period: { kind: "months", count: 6 } },
  { label: "Ultimul an", period: { kind: "months", count: 12 } },
  { label: "Ultimii 2 ani", period: { kind: "years", count: 2 } },
  { label: "Ultimii 3 ani", period: { kind: "years", count: 3 } },
];
