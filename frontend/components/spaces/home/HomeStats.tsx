import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { HomeIcon } from "./home.ui.types";

export type HomeStatsProps = {
  thisMonthExpenses: number;
  upcomingCount: number;
  currency?: string;
};

export function HomeStats({
  thisMonthExpenses,
  upcomingCount,
  currency = "RON",
}: HomeStatsProps) {
  const { colors, spacing, radius, typography } = useTheme();

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
        value={thisMonthExpenses.toLocaleString("en-US")}
        label="This month"
        suffix={currency}
        colors={colors}
        radius={radius}
        spacing={spacing}
        typography={typography}
      />

      <StatCard
        icon="alert-circle-outline"
        value={upcomingCount.toLocaleString("en-US")}
        label="Upcoming"
        suffix={upcomingCount === 1 ? "item" : "items"}
        colors={colors}
        radius={radius}
        spacing={spacing}
        typography={typography}
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
  typography,
}: {
  icon: HomeIcon;
  value: string;
  label: string;
  suffix: string;
  colors: any;
  radius: any;
  spacing: any;
  typography: any;
}) {
  return (
    <View
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
      <Ionicons name={icon} size={19} color={colors.onSurfaceTertiary} />

      <View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 4,
          }}
        >
          <Text style={{ ...typography.title, color: colors.onSurface }}>
            {value}
          </Text>

          <Text style={{ ...typography.micro, color: colors.onSurfaceTertiary }}>
            {suffix}
          </Text>
        </View>

        <Text style={{ ...typography.caption, marginTop: 2, color: colors.onSurfaceTertiary }}>
          {label}
        </Text>
      </View>
    </View>
  );
}
