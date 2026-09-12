import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/lib/theme";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";

export type ExpensesListSectionProps = {
  entries: ExpenseEntry[];
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function ExpensesListSection({ entries }: ExpensesListSectionProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 1,
          color: colors.onSurfaceTertiary,
          marginBottom: 10,
        }}
      >
        ALL EXPENSES
      </Text>

      <View
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderRadius: radius.lg,
          overflow: "hidden",
          marginBottom: spacing.xl,
        }}
      >
        {entries.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
              No expenses yet.
            </Text>
          </View>
        ) : (
          entries.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                gap: spacing.md,
                borderBottomWidth:
                  index === entries.length - 1 ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}
                >
                  {entry.name}
                </Text>

                <Text
                  style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }}
                >
                  {formatDate(entry.date)}
                </Text>
              </View>

              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>
                {entry.price.toLocaleString("en-US")}
              </Text>
            </View>
          ))
        )}
      </View>
    </>
  );
}
