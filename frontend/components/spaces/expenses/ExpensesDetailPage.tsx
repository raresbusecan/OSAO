import React, { useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useTheme } from "@/lib/theme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TopBar, Identity, Pill } from "@/components/ui/primitives";
import { roCount } from "@/lib/format";
import type { ExpensesData } from "./expenses.data.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { ExpensesListSection } from "./ExpensesListSection";
import {
  getAllTimeExpensesTotal,
  filterExpensesByPeriod,
  formatExpensesPeriodLabel,
  type ExpensesPeriod,
} from "@/lib/spaces/expenses/calculations/dashboard.calculations";

export type ExpensesDetailPageProps = {
  expensesData: ExpensesData;
  onBack: () => void;
  onEntryPress: (entry: ExpenseEntry) => void;
};

const PERIOD_PRESETS: { label: string; period: ExpensesPeriod }[] = [
  { label: "Tot timpul", period: { kind: "all" } },
  { label: "Luna asta", period: { kind: "thisMonth" } },
  { label: "3 luni", period: { kind: "months", count: 3 } },
  { label: "6 luni", period: { kind: "months", count: 6 } },
  { label: "1 an", period: { kind: "years", count: 1 } },
];

function periodsEqual(a: ExpensesPeriod, b: ExpensesPeriod): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "all" || a.kind === "thisMonth") return true;
  return (a as { count: number }).count === (b as { count: number }).count;
}

/**
 * Opened by tapping the "All time" card on the space's own screen --
 * the period filter here now uses the same trigger+modal model as
 * Car's CarExpensesPage/CarHistoryPage and Home's HomeSpendPage
 * (rolling window presets, not a specific calendar month), per
 * explicit user request for consistency across every Space's own
 * Expenses section. This space has only one flat category, unlike
 * Car/Home's multi-category chip grids, so there's no category filter
 * here -- period is the only axis.
 */
export function ExpensesDetailPage({ expensesData, onBack, onEntryPress }: ExpensesDetailPageProps) {
  const { colors, spacing, radius, typography } = useTheme();

  const [period, setPeriod] = useState<ExpensesPeriod>({ kind: "all" });

  const allTimeTotal = useMemo(() => getAllTimeExpensesTotal(expensesData), [expensesData]);

  const filteredEntries = useMemo(
    () => filterExpensesByPeriod(expensesData.entries, period),
    [expensesData, period],
  );
  const filteredTotal = useMemo(
    () => (period.kind === "all" ? allTimeTotal : filteredEntries.reduce((sum, e) => sum + e.price, 0)),
    [period, allTimeTotal, filteredEntries],
  );

  return (
    <SwipeBackView onBack={onBack}>
    <ScrollView
      testID="expenses-detail-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="expenses-detail-back" />
      <Identity color={SPACE_IDENTITY_COLORS.expenses} kicker="Cheltuieli" title="Toate cheltuielile" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {PERIOD_PRESETS.map((preset) => (
          <Pill
            key={preset.label}
            testID={`expenses-detail-period-option-${preset.label}`}
            label={preset.label}
            active={periodsEqual(period, preset.period)}
            onPress={() => setPeriod(preset.period)}
          />
        ))}
      </ScrollView>

      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: 2 }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{formatExpensesPeriodLabel(period)}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <AnimatedNumber value={filteredTotal} style={{ ...typography.display, color: colors.onSurface }} />
          <Text style={{ fontSize: 16, color: colors.onSurfaceTertiary }}>lei</Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{roCount(filteredEntries.length, "cheltuială", "cheltuieli")}</Text>
      </View>

      <ExpensesListSection entries={filteredEntries} onEntryPress={onEntryPress} emptyMessage="Nicio cheltuială în perioada asta." />
    </ScrollView>
    </SwipeBackView>
  );
}
