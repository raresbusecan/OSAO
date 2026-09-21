import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";

export type ExpensesListSectionProps = {
  entries: ExpenseEntry[];
  /** Tapping a row opens it for editing/deleting -- rows used to be
   * plain, non-interactive Views. */
  onEntryPress?: (entry: ExpenseEntry) => void;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function ExpensesListSection({ entries, onEntryPress }: ExpensesListSectionProps) {
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
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
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
            <Pressable
              key={entry.id}
              testID={`expense-row-${entry.id}`}
              onPress={onEntryPress ? () => onEntryPress(entry) : undefined}
              disabled={!onEntryPress}
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

                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, flexShrink: 1 }} numberOfLines={1}>
                    {formatDate(entry.date)}
                  </Text>
                  {entry.notes ? (
                    <Ionicons name="document-text-outline" size={11} color={colors.onSurfaceTertiary} />
                  ) : null}
                </View>
              </View>

              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>
                {entry.price.toLocaleString("en-US")}
              </Text>

              {onEntryPress ? (
                <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceTertiary} />
              ) : null}
            </Pressable>
          ))
        )}
      </View>
    </>
  );
}
