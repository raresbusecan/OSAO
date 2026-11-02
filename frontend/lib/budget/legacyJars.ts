import type { ThemeColors } from "@/lib/theme";

/**
 * LEGACY -- the old 5-jar income split ("Buget din venit", 2026-10), taken
 * out of lib/budget/plan.ts by "Buget simplu" (2026-11-02: Venit -> Pui
 * deoparte -> De cheltuit). Nothing live computes with it any more. It
 * stays only because file deletion is denied in this repo: TourHost's
 * now-unused `jar*` glyphs + `jarBar` illustration and the dead files
 * IncomeSplitCard / SplitSheet still import it. Don't build on it.
 */

export type SplitKey = "needs" | "guilt_free" | "third" | "short_term" | "long_term";
export type BudgetSplit = Record<SplitKey, number>;
export type LegacyBudgetPlan = { monthly_income: number; split: BudgetSplit };

export const JAR_ORDER: SplitKey[] = ["needs", "guilt_free", "third", "short_term", "long_term"];
export const DEFAULT_SPLIT: BudgetSplit = { needs: 55, guilt_free: 5, third: 10, short_term: 15, long_term: 15 };

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

export function jarAmounts(income: number, split: BudgetSplit): BudgetSplit {
  const out = {} as BudgetSplit;
  JAR_ORDER.forEach((k) => {
    out[k] = Math.round(income * (split[k] || 0)) / 100;
  });
  return out;
}
