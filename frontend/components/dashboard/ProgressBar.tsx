import React from "react";
import { View } from "react-native";
import { useTheme } from "@/lib/theme";

/**
 * Small tri-tone progress bar -- extracted out of app/(tabs)/budget.tsx
 * (where it first showed up, one per category limit) so
 * BudgetGlanceCard.tsx can reuse the exact same look on Home instead of
 * duplicating it.
 */
export function ProgressBar({
  value,
  tone,
}: {
  value: number;
  tone: "success" | "warning" | "error";
}) {
  const { colors, radius } = useTheme();

  return (
    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
      <View
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          borderRadius: radius.pill,
          backgroundColor: colors[tone],
        }}
      />
    </View>
  );
}
