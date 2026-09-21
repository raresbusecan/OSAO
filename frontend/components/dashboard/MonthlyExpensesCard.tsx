import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type MonthlyExpenseSource = { spaceName: string; icon: string; amount: number };

export type MonthlyExpensesCardProps = {
  total: number;
  sources: MonthlyExpenseSource[];
};

/**
 * Real cross-space "this month" spend -- total/sources come from
 * api.dashboard() (see DashboardController::index()'s monthlyExpenses
 * field), computed from actually-saved Car/Home expense items. Used to
 * sum each space's own local mock data instead (frontend/lib/dashboard/
 * monthlyExpenses.ts, now deprecated) -- that meant Car always showed 0
 * once Car was migrated onto the real backend, and Home was simply wrong
 * once Home was migrated too, since neither mock ever changes.
 */
export function MonthlyExpensesCard({ total, sources }: MonthlyExpensesCardProps) {
  const { colors, spacing, radius } = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      testID="monthly-expenses-card"
      style={{
        backgroundColor: colors.surfaceSecondary,
        borderRadius: radius.lg,
        padding: spacing.lg,
      }}
    >
      <Pressable
        testID="monthly-expenses-toggle"
        onPress={() => setExpanded((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel="Monthly expenses"
        accessibilityState={{ expanded }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "800",
              letterSpacing: 1,
              color: colors.onSurfaceTertiary,
            }}
          >
            MONTHLY EXPENSES
          </Text>

          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 4 }}>
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: colors.onSurface,
                letterSpacing: -0.5,
              }}
            >
              {total.toLocaleString("en-US")}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary }}>
              RON
            </Text>
          </View>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.onSurfaceTertiary}
        />
      </Pressable>

      {expanded ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {sources.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
              No expenses recorded this month yet.
            </Text>
          ) : (
            sources.map((source) => (
              <View
                key={source.spaceName}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
              >
                <Ionicons
                  name={source.icon as any}
                  size={16}
                  color={colors.onSurfaceTertiary}
                />

                <Text style={{ flex: 1, fontSize: 14, color: colors.onSurface }}>
                  {source.spaceName}
                </Text>

                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>
                  {source.amount.toLocaleString("en-US")} RON
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
