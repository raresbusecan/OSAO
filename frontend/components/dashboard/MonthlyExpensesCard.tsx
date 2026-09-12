import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { getMonthlyExpensesBreakdown } from "@/lib/dashboard/monthlyExpenses";

export function MonthlyExpensesCard() {
  const { colors, spacing, radius } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { total, sources } = getMonthlyExpensesBreakdown();

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
