import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { onSessionReset, sessionVersion } from "@/lib/sessionCache";
import type { BudgetCreditItem } from "@/lib/spaces/expenses/credits";

/**
 * "Buget simplu" (2026-11-02, user decision): Venit -> Pui deoparte -> De
 * cheltuit. Backend: users.monthly_income + users.monthly_set_aside, PUT
 * /budget/plan {monthly_income, set_aside}, GET /budget's plan/credit keys
 * (BudgetController).
 *
 *  - Venit (I)         monthly net income
 *  - Pui deoparte (A)  a fixed sum per month (0 <= A <= I), added to the
 *                      Economii goal on the 1st of the next month
 *  - De cheltuit (E)   = I - A, the ONE budget every space's spending,
 *                      every recurring bill and every credit rate comes
 *                      out of. Whatever is left of E at month end also goes
 *                      to Economii; overspending is taken out of it.
 *
 * No per-space limits, no jars, no "Bani fără vină": the items' guilt_free
 * flag is ignored everywhere (the server strips it on write). The old jar
 * helpers live on, unused, in lib/budget/legacyJars.ts.
 */

export type BudgetPlan = { monthly_income: number; set_aside: number; spendable: number };

/** "Pui deoparte" presets, percent of income (IncomeSheet's chips). */
export const SET_ASIDE_PRESETS = [0, 10, 20, 30] as const;

/** A preset's amount: income x percent, rounded to whole lei. */
export function setAsideFromPercent(income: number, percent: number): number {
  return Math.round((income * percent) / 100);
}

/** IncomeSheet's validation: a positive income, 0 <= set-aside <= income. */
export function planInputValid(income: number, setAside: number): boolean {
  return Number.isFinite(income) && income > 0 && Number.isFinite(setAside) && setAside >= 0 && setAside <= income;
}

/** Normalise GET /budget's `plan` (strings from Laravel's decimal casts;
 * `set_aside` null until the backend migration ran = 0). */
export function normalizePlan(raw: any): BudgetPlan | null {
  if (!raw || raw.monthly_income == null) return null;
  const income = Number(raw.monthly_income) || 0;
  const setAside = Math.max(0, Number(raw.set_aside ?? 0) || 0);
  const spendable = raw.spendable != null && Number.isFinite(Number(raw.spendable)) ? Number(raw.spendable) : income - setAside;
  return { monthly_income: income, set_aside: setAside, spendable };
}

/**
 * This month's spend against De cheltuit -- the ONE number Buget's pace
 * card, Acasă's "Mai ai" and the overview all use, so they always agree.
 * Sums EVERY label GET /budget returns (not only the kinds the user has a
 * space for): a Calendar purchase lands on the "Expenses" label even
 * without a Cheltuieli space and still counts.
 *  - committed: everything counted against E (= Σ this_month, which already
 *    folds in recurring bills + Calendar purchases ahead, + credit rates)
 *  - recurring: bills + credit rates (the hatched band, "de plătit")
 *  - bills / rates: the two halves of `recurring`
 *  - planned:   Calendar purchases still ahead ("planificat")
 *  - recorded:  actually spent = Σ this_month - bills - planned (rates are
 *    never "Cheltuit")
 */
export type MonthSpend = { committed: number; recurring: number; bills: number; rates: number; planned: number; recorded: number };

export function monthSpend(
  spending: Record<string, { this_month?: number } | undefined> | null | undefined,
  recurring: Record<string, number> | null | undefined,
  planned: Record<string, number> | null | undefined,
  creditRates: number = 0,
): MonthSpend {
  const sum = (o: Record<string, any> | null | undefined, pick: (v: any) => number) =>
    Object.values(o ?? {}).reduce((s: number, v) => s + (Number(pick(v)) || 0), 0);
  const thisMonth = sum(spending, (v) => v?.this_month);
  const bills = sum(recurring, (v) => v);
  const pl = sum(planned, (v) => v);
  const rates = Math.max(0, Number(creditRates) || 0);
  return {
    committed: thisMonth + rates,
    recurring: bills + rates,
    bills,
    rates,
    planned: pl,
    recorded: Math.max(0, thisMonth - bills - pl),
  };
}

/** Economii's caption on Buget: what lands in it on the 1st of next month.
 * Credit rates are inside E, so a month they push over E reduces Economii
 * (user decision 2026-11-02). `month` = "decembrie". */
export function savingsCaption(setAside: number, spendable: number, month: string): string {
  // Whole lei, inline: this module stays free of @/lib/format (tests load it bare).
  const lei = (n: number) => `${Math.round(n).toLocaleString("ro-RO")} lei`;
  const E = lei(spendable);
  return setAside > 0
    ? `Pe 1 ${month}: + ${lei(setAside)} puși deoparte și ce rămâne necheltuit din cei ${E}. Dacă treci de ei, diferența se scade.`
    : `Pe 1 ${month}: ce rămâne necheltuit din cei ${E}. Dacă treci de ei, diferența se scade.`;
}

/** Budget label ("Car", "Home"...) -> its space kind + icon. */
export const LABEL_KIND: Record<string, { kind: "car" | "home" | "grocery" | "expenses"; icon: "car-outline" | "home-outline" | "cart-outline" | "receipt-outline" }> = {
  Car: { kind: "car", icon: "car-outline" },
  Home: { kind: "home", icon: "home-outline" },
  Grocery: { kind: "grocery", icon: "cart-outline" },
  Expenses: { kind: "expenses", icon: "receipt-outline" },
};

/** "7.000" / "7000,50" / "7 000" -> 7000 / 7000.5 / 7000 (Romanian input:
 * "." groups thousands, "," is the decimal mark; a lone "." followed by
 * 1-2 digits is read as a decimal point too). NaN when empty. */
export function parseAmount(input: string): number {
  let s = (input || "").replace(/\s/g, "");
  if (!s) return NaN;
  s = s.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  return Number(s);
}

/** Whole months until `remaining` is reached at `perMonth`, or null. */
export function monthsToTarget(remaining: number, perMonth: number): number | null {
  if (remaining <= 0 || perMonth <= 0) return null;
  return Math.ceil(remaining / perMonth);
}

/** "noiembrie" -- next month's name, for "pe 1 noiembrie". */
export function nextMonthName(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("ro-RO", { month: "long" });
}

// ---------------------------------------------------------------------
// Shared plan cache -- screens outside Buget need the plan and the active
// credits (Car's top card, LinkedCreditsLine) without each re-fetching
// /budget. budget.tsx primes it on every load; anything else reads it
// through useBudgetPlan(), which fetches once if it's empty or stale.
// ---------------------------------------------------------------------

export type BudgetPlanSummary = {
  plan: BudgetPlan | null;
  credit: { rates: number; count: number; items: BudgetCreditItem[] };
};

const STALE_MS = 60_000;
let cache: BudgetPlanSummary | null = null;
let cachedAt = 0;
let inflight: Promise<BudgetPlanSummary | null> | null = null;
const listeners = new Set<(s: BudgetPlanSummary | null) => void>();
onSessionReset(() => {
  cache = null;
  cachedAt = 0;
  inflight = null;
  listeners.forEach((listener) => listener(null));
});

export function pickSummary(b: any): BudgetPlanSummary {
  const c = b?.credit;
  return {
    plan: normalizePlan(b?.plan),
    credit: { rates: Number(c?.rates) || 0, count: Number(c?.count) || 0, items: Array.isArray(c?.items) ? c.items : [] },
  };
}

/** Feed a fresh GET /budget response (budget.tsx does on every load). */
export function primeBudgetPlan(budgetResponse: any): void {
  cache = pickSummary(budgetResponse);
  cachedAt = Date.now();
  listeners.forEach((l) => l(cache));
}

/** Re-fetch /budget (e.g. after a credit was added/changed). */
export function refreshBudgetPlan(): Promise<BudgetPlanSummary | null> {
  if (inflight) return inflight;
  const version = sessionVersion();
  inflight = api
    .getBudget()
    .then((b) => {
      if (version !== sessionVersion()) return null;
      primeBudgetPlan(b);
      return cache;
    })
    .catch(() => version === sessionVersion() ? cache : null)
    .finally(() => {
      if (version === sessionVersion()) inflight = null;
    });
  return inflight;
}

/** The current plan summary (null until loaded). `summary.plan === null`
 * means the person never set an income -- hide plan-only UI. */
export function useBudgetPlan(): BudgetPlanSummary | null {
  const [state, setState] = useState<BudgetPlanSummary | null>(cache);
  useEffect(() => {
    listeners.add(setState);
    if (!cache || Date.now() - cachedAt > STALE_MS) refreshBudgetPlan();
    else setState(cache);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
