import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { ProgressBar } from "./ProgressBar";

type BudgetLimit = { category: string; monthly_limit: number; spent: number };
type SavingsGoal = { target_amount: number; current_amount: number; target_date: string | null } | null;

export type BudgetGlanceCardProps = {
  limits: BudgetLimit[];
  recurringBills: any[];
  savingsGoal: SavingsGoal;
  onPress: () => void;
};

/**
 * Compact Budget summary for the main Dashboard (Home tab) -- Budget
 * (app/(tabs)/budget.tsx) has real limits/spend/bills/savings now but no
 * presence anywhere outside its own tab, so a user has to remember to
 * open it just to see whether they're near a limit or a bill is due
 * soon. All data comes from api.getBudget() (same call the Budget tab
 * itself makes), passed down as props -- this component does no
 * fetching of its own.
 *
 * Renders nothing at all when there's genuinely nothing to show yet (no
 * limits, no bills, no goal) -- same "absent, not empty" rule already
 * used by MonthlyExpensesCard's sources.
 */
export function BudgetGlanceCard({ limits, recurringBills, savingsGoal, onPress }: BudgetGlanceCardProps) {
  const { colors, spacing, radius } = useTheme();

  if (limits.length === 0 && recurringBills.length === 0 && !savingsGoal) {
    return null;
  }

  const totalSpent = limits.reduce((sum, l) => sum + l.spent, 0);
  const totalLimit = limits.reduce((sum, l) => sum + l.monthly_limit, 0);
  const ratio = totalLimit > 0 ? totalSpent / totalLimit : 0;
  const tone = ratio >= 1 ? "error" : ratio >= 0.8 ? "warning" : "success";

  // The single worst-off category, if any is at or over its own limit --
  // named specifically rather than just a generic "over budget" so the
  // user knows where to look without opening the tab.
  const worstOffender = limits
    .filter((l) => l.monthly_limit > 0 && l.spent / l.monthly_limit >= 1)
    .sort((a, b) => b.spent / b.monthly_limit - a.spent / a.monthly_limit)[0];

  const nextBill = [...recurringBills]
    .filter((b) => b.due_at)
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())[0];

  return (
    <Pressable
      testID="budget-glance-card"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open Budget"
      style={{
        backgroundColor: colors.surfaceSecondary,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1, color: colors.onSurfaceTertiary }}>
          BUDGET
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
      </View>

      {limits.length > 0 ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface }}>
              {totalSpent.toLocaleString("en-US")}
            </Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
              / {totalLimit.toLocaleString("en-US")} RON this month
            </Text>
          </View>
          <ProgressBar value={Math.min(1, ratio)} tone={tone} />
          {worstOffender ? (
            <Text style={{ fontSize: 12, color: colors.error, fontWeight: "600" }}>
              Over budget in {worstOffender.category}
            </Text>
          ) : null}
        </>
      ) : null}

      {nextBill ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: limits.length > 0 ? 2 : 0 }}>
          <Ionicons name="repeat-outline" size={14} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, flex: 1 }} numberOfLines={1}>
            Next: {nextBill.title} · {Number(nextBill.amount).toLocaleString("en-US")} {nextBill.currency || "RON"} ·{" "}
            {new Date(nextBill.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </Text>
        </View>
      ) : null}

      {savingsGoal ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Ionicons name="trending-up-outline" size={14} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
            Savings: {savingsGoal.current_amount.toLocaleString("en-US")} / {savingsGoal.target_amount.toLocaleString("en-US")} RON
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
