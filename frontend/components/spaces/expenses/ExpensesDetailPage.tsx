import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
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
  { label: "All time", period: { kind: "all" } },
  { label: "This month", period: { kind: "thisMonth" } },
  { label: "Last 3 months", period: { kind: "months", count: 3 } },
  { label: "Last 6 months", period: { kind: "months", count: 6 } },
  { label: "Last year", period: { kind: "years", count: 1 } },
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
  const { colors, spacing, radius } = useTheme();

  const [period, setPeriod] = useState<ExpensesPeriod>({ kind: "all" });
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);

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
            {filteredTotal.toLocaleString("en-US")}
          </Text>
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>RON</Text>
        </View>
        <Text style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }}>
          {formatExpensesPeriodLabel(period)} · {filteredEntries.length} entries
        </Text>
      </View>

      {/* PERIOD -- same modal bottom-sheet trigger as CarExpensesPage/
          CarHistoryPage/HomeSpendPage's own "Period" row. */}
      <View
        style={{
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
          padding: spacing.lg,
          marginBottom: spacing.xl,
        }}
      >
        <Pressable
          testID="expenses-detail-period-trigger"
          onPress={() => setPeriodPickerOpen(true)}
          accessibilityRole="button"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }}>Period</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
              {formatExpensesPeriodLabel(period)}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.onSurfaceTertiary} />
          </View>
        </Pressable>
      </View>

      {/* PERIOD PICKER */}
      <Modal
        visible={periodPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPeriodPickerOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => setPeriodPickerOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          />

          <View
            style={{
              backgroundColor: colors.surface,
              padding: spacing.xl,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm }}>
              Period
            </Text>

            {PERIOD_PRESETS.map((preset) => {
              const isActive = periodsEqual(period, preset.period);
              return (
                <Pressable
                  key={preset.label}
                  testID={`expenses-detail-period-option-${preset.label}`}
                  onPress={() => {
                    setPeriod(preset.period);
                    setPeriodPickerOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: spacing.md,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: isActive ? "700" : "500", color: colors.onSurface }}>
                    {preset.label}
                  </Text>
                  {isActive ? <Ionicons name="checkmark" size={18} color={colors.onSurface} /> : null}
                </Pressable>
              );
            })}

            <Pressable
              testID="expenses-detail-period-done"
              onPress={() => setPeriodPickerOpen(false)}
              style={{
                marginTop: spacing.md,
                minHeight: 48,
                borderRadius: radius.md,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.surface }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* LIST */}
      <ExpensesListSection entries={filteredEntries} onEntryPress={onEntryPress} />
    </ScrollView>
  );
}
