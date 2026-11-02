import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { onSessionReset, sessionVersion } from "@/lib/sessionCache";
import type { ThemeColors } from "@/lib/theme";
import type { BudgetCreditItem } from "@/lib/spaces/expenses/credits";

/**
 * "Buget din venit" -- the monthly NET income split into 5 jars (integer
 * percents that sum to 100). Backend: users.monthly_income/budget_split,
 * PUT /budget/plan, GET /budget's plan/necessities/guiltFree/credit keys
 * (BudgetController; its `suggested` / `limits` keys are no longer read).
 *
 *  - needs       Necesități -- ONE envelope every space's spending comes
 *                out of (no per-space limits since 2026-11-02)
 *  - guilt_free  Bani fără vină -- tracked via each item's guilt_free flag
 *  - third       Credit (tracked while >= 1 active credit) else Investiții
 *  - short_term  Obiective pe termen scurt = the Economii savings goal;
 *                added to it automatically at month end
 *  - long_term   Bani pe termen lung -- a target only
 */

export type SplitKey = "needs" | "guilt_free" | "third" | "short_term" | "long_term";
export type BudgetSplit = Record<SplitKey, number>;
export type BudgetPlan = { monthly_income: number; split: BudgetSplit };

export const JAR_ORDER: SplitKey[] = ["needs", "guilt_free", "third", "short_term", "long_term"];
export const DEFAULT_SPLIT: BudgetSplit = { needs: 55, guilt_free: 5, third: 10, short_term: 15, long_term: 15 };

/** Jar names. `third` depends on whether a credit is active. */
export function jarLabel(key: SplitKey, hasCredit = false): string {
  switch (key) {
    case "needs":
      return "Necesități";
    case "guilt_free":
      return "Bani fără vină";
    case "third":
      return hasCredit ? "Credit" : "Investiții";
    case "short_term":
      return "Obiective pe termen scurt";
    case "long_term":
      return "Bani pe termen lung";
  }
}

/** Short names, for the income sheet's preview. */
export function jarShortLabel(key: SplitKey): string {
  switch (key) {
    case "needs":
      return "Necesități";
    case "guilt_free":
      return "Bani fără vină";
    case "third":
      return "Credit sau investiții";
    case "short_term":
      return "Termen scurt";
    case "long_term":
      return "Termen lung";
  }
}

/** Jar colors (mockup): needs = the ink color, fără vină = muted grey, credit = success green, the
 * two savings jars = lighter / darker greens. */
export function jarFill(key: SplitKey, colors: ThemeColors, isDark: boolean): string {
  switch (key) {
    case "needs":
      return colors.onSurface;
    case "guilt_free":
      return colors.onSurfaceTertiary;
    case "third":
      return colors.success;
    case "short_term":
      return isDark ? "#22916A" : "#10B981";
    case "long_term":
      return isDark ? "#17654A" : "#6EE7B7";
  }
}

export function splitTotal(split: BudgetSplit): number {
  return JAR_ORDER.reduce((sum, k) => sum + (Number(split[k]) || 0), 0);
}

/** Each jar's monthly amount (income x percent, 2 decimals like the server). */
export function jarAmounts(income: number, split: BudgetSplit): BudgetSplit {
  const out = {} as BudgetSplit;
  JAR_ORDER.forEach((k) => {
    out[k] = Math.round(income * (split[k] || 0)) / 100;
  });
  return out;
}

/**
 * Necessities spend this month -- the ONE number Buget's hero, the
 * Necesități jar row, its drill-down and Acasă's "Mai ai" all use, so they
 * always agree. Sums EVERY label GET /budget returns (not only the kinds
 * the user has a space for): a Calendar purchase lands on the "Expenses"
 * label even without a Cheltuieli space and still counts against
 * Necesități. Fără vină is already excluded by the API.
 *  - committed: everything counted against the envelope (= this_month,
 *    which already folds in recurring bills + Calendar purchases ahead)
 *  - recurring: bills still to pay ("de plătit")
 *  - planned:   Calendar purchases still ahead ("planificat")
 *  - recorded:  actually spent = committed - recurring - planned
 */
export type NeedsSpend = { committed: number; recurring: number; planned: number; recorded: number };

export function needsSpend(
  spending: Record<string, { this_month?: number } | undefined> | null | undefined,
  recurring: Record<string, number> | null | undefined,
  planned: Record<string, number> | null | undefined,
): NeedsSpend {
  const sum = (o: Record<string, any> | null | undefined, pick: (v: any) => number) =>
    Object.values(o ?? {}).reduce((s: number, v) => s + (Number(pick(v)) || 0), 0);
  const committed = sum(spending, (v) => v?.this_month);
  const rec = sum(recurring, (v) => v);
  const pl = sum(planned, (v) => v);
  return { committed, recurring: rec, planned: pl, recorded: Math.max(0, committed - rec - pl) };
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
// Shared plan cache -- edit forms across the app need "is there a plan?"
// (the Bani fără vină toggle stays hidden until there is) and the jar
// amounts, without each re-fetching /budget. budget.tsx primes it on
// every load; anything else reads it through useBudgetPlan(), which
// fetches once if it's empty or stale.
// ---------------------------------------------------------------------

export type BudgetPlanSummary = {
  plan: BudgetPlan | null;
  necessities: { envelope: number | null; avg_last_3_months: number };
  guiltFree: { budget: number | null; spent: number; planned: number; count: number };
  credit: { budget: number | null; rates: number; count: number; items: BudgetCreditItem[] };
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

function pickSummary(b: any): BudgetPlanSummary {
  return {
    plan: b?.plan ?? null,
    necessities: b?.necessities ?? { envelope: null, avg_last_3_months: 0 },
    guiltFree: b?.guiltFree ?? { budget: null, spent: 0, planned: 0, count: 0 },
    credit: b?.credit ?? { budget: null, rates: 0, count: 0, items: [] },
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
