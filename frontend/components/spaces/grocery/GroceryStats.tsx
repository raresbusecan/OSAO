import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { GroceryIcon } from "./grocery.ui.types";

export type GroceryStatsProps = {
  toBuyCount: number;
  inCartCount: number;
};

export function GroceryStats({ toBuyCount, inCartCount }: GroceryStatsProps) {
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
        icon="list-outline"
        value={toBuyCount.toLocaleString("en-US")}
        label="To buy"
        suffix={toBuyCount === 1 ? "item" : "items"}
        colors={colors}
        radius={radius}
        spacing={spacing}
      />

      <StatCard
        icon="checkmark-circle-outline"
        value={inCartCount.toLocaleString("en-US")}
        label="In cart"
        suffix={inCartCount === 1 ? "item" : "items"}
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
  icon: GroceryIcon;
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

          <Text
            style={{ fontSize: 11, fontWeight: "600", color: colors.onSurfaceTertiary }}
          >
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
