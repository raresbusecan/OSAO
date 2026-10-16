import React, { useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useTheme } from "@/lib/theme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TopBar, Identity } from "@/components/ui/primitives";
import { PeriodPicker } from "@/components/ui/PeriodPicker";
import type { PeriodPreset } from "@/lib/period";
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
  onEntryDelete?: (entry: ExpenseEntry) => void;
};

// Mașină's picker and row look (components/ui/PeriodPicker.tsx), this
// page's own presets -- incl. "Luna asta", which Mașină doesn't have.
const PERIOD_PRESETS: PeriodPreset<ExpensesPeriod>[] = [
  { label: "Tot timpul", period: { kind: "all" } },
  { label: "Luna asta", period: { kind: "thisMonth" } },
  { label: "Ultimele 3 luni", period: { kind: "months", count: 3 } },
  { label: "Ultimele 6 luni", period: { kind: "months", count: 6 } },
  { label: "Ultimul an", period: { kind: "years", count: 1 } },
];

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
export function ExpensesDetailPage({ expensesData, onBack, onEntryPress, onEntryDelete }: ExpensesDetailPageProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const TEAL = useSpaceColors("expenses").color;

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
      <Identity color={TEAL} kicker="Cheltuieli" title="Toate cheltuielile" info="expenses.space" />

      <PeriodPicker value={period} onChange={setPeriod} presets={PERIOD_PRESETS} testIDPrefix="expenses-detail" />

      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: 2 }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{formatExpensesPeriodLabel(period)}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <AnimatedNumber value={filteredTotal} style={{ ...typography.display, color: colors.onSurface }} />
          <Text style={{ fontSize: 16, color: colors.onSurfaceTertiary }}>lei</Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{roCount(filteredEntries.length, "cheltuială", "cheltuieli")}</Text>
      </View>

      <ExpensesListSection entries={filteredEntries} onEntryPress={onEntryPress} onEntryDelete={onEntryDelete} emptyMessage="Nicio cheltuială în perioada asta." />
    </ScrollView>
    </SwipeBackView>
  );
}
