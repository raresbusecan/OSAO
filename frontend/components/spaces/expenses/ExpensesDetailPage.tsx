import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { ExpensesData } from "./expenses.data.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { ExpensesListSection } from "./ExpensesListSection";
import {
  getAllTimeExpensesTotal,
  getMonthlyExpenseTotals,
  getEntriesForMonth,
  type MonthlyExpenseTotal,
} from "@/lib/spaces/expenses/calculations/dashboard.calculations";

const MONTHS_SHOWN = 4;

export type ExpensesDetailPageProps = {
  expensesData: ExpensesData;
  onBack: () => void;
  onEntryPress: (entry: ExpenseEntry) => void;
};

/**
 * Opened by tapping the "All time" card on the space's own screen --
 * the trend chart lets you spot an expensive month at a glance and tap
 * straight into it, closer to how Car's own Expenses page works
 * (period filter + breakdown + list) but scaled to this space's single
 * flat category instead of Car's 4.
 */
export function ExpensesDetailPage({ expensesData, onBack, onEntryPress }: ExpensesDetailPageProps) {
  const { colors, spacing, radius } = useTheme();

  // null = "All time" (the default); otherwise the tapped bar's
  // {year, month}, and the toggle/list/total below all narrow to it.
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);

  const months = useMemo(() => getMonthlyExpenseTotals(expensesData, MONTHS_SHOWN), [expensesData]);
  const maxTotal = Math.max(1, ...months.map((m) => m.total));

  const allTimeTotal = useMemo(() => getAllTimeExpensesTotal(expensesData), [expensesData]);

  const selectedEntries = useMemo(
    () => (selectedMonth ? getEntriesForMonth(expensesData, selectedMonth.year, selectedMonth.month) : expensesData.entries),
    [expensesData, selectedMonth],
  );
  const selectedTotal = selectedMonth
    ? selectedEntries.reduce((sum, e) => sum + e.price, 0)
    : allTimeTotal;
  const selectedLabel = selectedMonth
    ? months.find((m) => m.year === selectedMonth.year && m.month === selectedMonth.month)?.label
    : null;

  const toggleMonth = (m: MonthlyExpenseTotal) => {
    const isSame = selectedMonth?.year === m.year && selectedMonth?.month === m.month;
    setSelectedMonth(isSame ? null : { year: m.year, month: m.month });
  };

  return (
    <ScrollView
      testID="expenses-detail-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 150 }}
    >
      {/* HEADER */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
        }}
      >
        <Pressable
          testID="expenses-detail-back"
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 }}>
          Expenses
        </Text>
      </View>

      {/* TOTAL */}
      <View style={{ marginBottom: spacing.xl }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.6 }}>
            {selectedTotal.toLocaleString("en-US")}
          </Text>
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>RON</Text>
        </View>
        <Text style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }}>
          {selectedMonth ? `${selectedLabel} · ${selectedEntries.length} entries` : `All time · ${expensesData.entries.length} entries`}
        </Text>
      </View>

      {/* TREND CHART */}
      <View
        style={{
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 100, gap: spacing.md }}>
          {months.map((m) => {
            const isSelected = selectedMonth?.year === m.year && selectedMonth?.month === m.month;
            const barHeight = Math.max(6, (m.total / maxTotal) * 90);
            return (
              <Pressable
                key={`${m.year}-${m.month}`}
                testID={`expenses-chart-bar-${m.year}-${m.month}`}
                onPress={() => toggleMonth(m)}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}, ${m.total} RON`}
                style={{ flex: 1, alignItems: "center", gap: 6 }}
              >
                <View
                  style={{
                    width: "100%",
                    height: barHeight,
                    borderRadius: 6,
                    backgroundColor: isSelected ? colors.onSurface : colors.surfaceTertiary,
                    alignItems: "center",
                    justifyContent: "flex-start",
                  }}
                >
                  {isSelected ? (
                    <Text style={{ fontSize: 10, fontWeight: "800", color: colors.surface, marginTop: 6 }}>
                      {m.total.toLocaleString("en-US")}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ fontSize: 10.5, fontWeight: isSelected ? "800" : "600", color: isSelected ? colors.onSurface : colors.onSurfaceTertiary }}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* TOGGLE */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.pill,
          padding: 3,
          marginBottom: spacing.xl,
        }}
      >
        <Pressable
          testID="expenses-toggle-alltime"
          onPress={() => setSelectedMonth(null)}
          style={{
            flex: 1,
            alignItems: "center",
            paddingVertical: 9,
            borderRadius: radius.pill,
            backgroundColor: selectedMonth ? "transparent" : colors.onSurface,
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: selectedMonth ? colors.onSurface : colors.surface }}>
            All time
          </Text>
        </Pressable>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            paddingVertical: 9,
            borderRadius: radius.pill,
            backgroundColor: selectedMonth ? colors.onSurface : "transparent",
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: selectedMonth ? colors.surface : colors.onSurfaceTertiary }}>
            {selectedMonth ? `Selected month (${selectedLabel})` : "Selected month"}
          </Text>
        </View>
      </View>

      {/* LIST */}
      <ExpensesListSection entries={selectedEntries} onEntryPress={onEntryPress} />
    </ScrollView>
  );
}
