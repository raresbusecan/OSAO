import React from "react";
import { InfoButton } from "@/components/ui/primitives";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "@/components/ui/PressableScale";
import { motion } from "@/lib/motion";
import {
  recurringWarningTierColor,
  type RecurringWarningTier,
} from "@/lib/spaces/home/calculations/dashboard.calculations";

export type HomeRestanteCardProps = {
  counts: Record<RecurringWarningTier, number>;
  onPress: () => void;
  colors: any;
  spacing: any;
  radius: any;
};

// Most urgent first (the approved redesign mockup's order).
const COLUMNS: { tier: RecurringWarningTier; label: string }[] = [
  { tier: "red", label: "Restante" },
  { tier: "orangeToday", label: "Azi" },
  { tier: "orangeDays", label: "1-2 zile" },
  { tier: "yellow", label: "3-4 zile" },
];

/** Rendered on HomeDashboard's main page (HomeTasksPage's old inline
 * copy was removed) -- one column per tier (task/maintenance/recurring combined, see
 * getRecurringTaskWarnings), but per explicit user request a tier with
 * 0 count doesn't render a "0" column at all, it's just skipped (same
 * rule for every tier). The whole card hides itself the same way when
 * every tier is 0 -- nothing to warn about, nothing to show, same "null
 * instead of an empty shell" pattern HomeNextSection already uses. */
export function HomeRestanteCard({ counts, onPress, colors, spacing, radius }: HomeRestanteCardProps) {
  const total = COLUMNS.reduce((sum, c) => sum + counts[c.tier], 0);
  if (total === 0) return null;

  const visibleColumns = COLUMNS.filter((c) => counts[c.tier] > 0);

  return (
    <PressableScale
      testID="home-restante-card"
      onPress={onPress}
      scaleTo={motion.scale.card}
      accessibilityRole="button"
      accessibilityLabel={`Scadențe: ${total}. Vezi lista`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg + 2,
        paddingVertical: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceSecondary,
      }}
    >
      <View style={{ flex: 1, gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>Scadențe ({total})</Text>
          <InfoButton topic="home.scadente" />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.lg + 2 }}>
          {visibleColumns.map((column) => (
            <View key={column.tier}>
              <Text style={{ fontSize: 20, fontWeight: "600", color: recurringWarningTierColor(column.tier, colors) }}>
                {counts[column.tier]}
              </Text>
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{column.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
    </PressableScale>
  );
}
