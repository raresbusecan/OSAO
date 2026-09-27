import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type ExpensesStatsProps = {
  allTimeTotal: number;
  thisMonthTotal: number;
  currency?: string;
  /** Opens ExpensesDetailPage -- the trend chart + filterable breakdown.
   * Only the total card is pressable; This Month is still just a
   * read-only figure. */
  onTotalPress: () => void;
};

export function ExpensesStats({
  allTimeTotal,
  thisMonthTotal,
  currency = "RON",
  onTotalPress,
}: ExpensesStatsProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        gap: spacing.md,
        marginBottom: spacing.xl,
      }}
    >
      <StatCard
        icon="wallet-outline"
        value={allTimeTotal.toLocaleString("en-US")}
        label="All time"
        suffix={currency}
        colors={colors}
        radius={radius}
        spacing={spacing}
        onPress={onTotalPress}
      />

      <StatCard
        icon="calendar-outline"
        value={thisMonthTotal.toLocaleString("en-US")}
        label="This month"
        suffix={currency}
        colors={colors}
        radius={radius}
        spacing={spacing}
      />
    </View>
  );
}

function StatCard({
  icon,
  value,
  label,
  suffix,
  colors,
  radius,
  spacing,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  suffix: string;
  colors: any;
  radius: any;
  spacing: any;
  onPress?: () => void;
}) {
  const Container: any = onPress ? Pressable : View;

  return (
    <Container
      testID={onPress ? "expenses-total-card" : undefined}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? "View all expenses" : undefined}
      style={{
        flex: 1,
        minHeight: 110,
        padding: spacing.lg,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        justifyContent: "space-between",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Ionicons name={icon} size={19} color={colors.onSurfaceTertiary} />
        {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.onSurfaceTertiary} /> : null}
      </View>

      <View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: colors.onSurface,
              letterSpacing: -0.4,
            }}
          >
            {value}
          </Text>

          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.onSurfaceTertiary }}>
            {suffix}
          </Text>
        </View>

        <Text style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }}>
          {label}
        </Text>
      </View>
    </Container>
  );
}
