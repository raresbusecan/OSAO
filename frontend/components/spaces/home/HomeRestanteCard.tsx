import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

const COLUMNS: { tier: RecurringWarningTier; label: string }[] = [
  { tier: "yellow", label: "4 zile" },
  { tier: "orangeDays", label: "2 zile" },
  { tier: "orangeToday", label: "Azi" },
  { tier: "red", label: "Restant" },
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View recurring task warnings, ${total} total`}
      style={{
        marginBottom: spacing.xl,
        padding: spacing.lg,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceSecondary,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.onSurface }}>Restanțe ({total})</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.onSurfaceTertiary} />
      </View>
      <View style={{ flexDirection: "row" }}>
        {visibleColumns.map((column, index) => (
          <WarningCount
            key={column.tier}
            value={counts[column.tier]}
            label={column.label}
            color={recurringWarningTierColor(column.tier, colors)}
            last={index === visibleColumns.length - 1}
          />
        ))}
      </View>
    </Pressable>
  );
}

function WarningCount({ value, label, color, last }: { value: number; label: string; color: string; last?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", borderRightWidth: last ? 0 : 1, borderRightColor: `${color}22` }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color }}>{value}</Text>
      <Text style={{ fontSize: 10.5, fontWeight: "700", color: "#A3A3A3", marginTop: 2 }}>{label}</Text>
    </View>
  );
}
