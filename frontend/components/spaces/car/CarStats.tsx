import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type CarStatsProps = {
  mileage: number;
  monthlyCost: number;
  currency?: string;
};

export function CarStats({
  mileage,
  monthlyCost,
  currency = "RON",
}: CarStatsProps) {
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
        icon="speedometer-outline"
        value={mileage.toLocaleString()}
        label="Mileage"
        suffix="km"
        colors={colors}
        radius={radius}
        spacing={spacing}
        typography={typography}
      />

      <StatCard
        icon="wallet-outline"
        value={monthlyCost.toLocaleString()}
        label="This month"
        suffix={currency}
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
  icon: string;
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
      <Ionicons
        name={icon as any}
        size={19}
        color={colors.onSurfaceTertiary}
      />

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