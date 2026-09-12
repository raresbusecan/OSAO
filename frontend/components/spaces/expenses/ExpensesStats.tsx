import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type ExpensesStatsProps = {
  thisMonthTotal: number;
  itemCount: number;
  currency?: string;
};

export function ExpensesStats({
  thisMonthTotal,
  itemCount,
  currency = "RON",
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
        value={thisMonthTotal.toLocaleString("en-US")}
        label="This month"
        suffix={currency}
        colors={colors}
        radius={radius}
        spacing={spacing}
      />

      <StatCard
        icon="receipt-outline"
        value={itemCount.toLocaleString("en-US")}
        label="Items"
        suffix={itemCount === 1 ? "entry" : "entries"}
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  suffix: string;
  colors: any;
  radius: any;
  spacing: any;
}) {
  return (
    <View
      style={{
        flex: 1,
        minHeight: 110,
        padding: spacing.lg,
        backgroundColor: colors.surfaceSecondary,
        borderRadius: radius.lg,
        justifyContent: "space-between",
      }}
    >
      <Ionicons name={icon} size={19} color={colors.onSurfaceTertiary} />

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
    </View>
  );
}
