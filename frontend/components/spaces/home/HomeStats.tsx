import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { PressableScale } from "@/components/ui/PressableScale";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { motion } from "@/lib/motion";

export type HomeStatsProps = {
  thisMonthExpenses: number;
  /** Past-due and unresolved -- the same number as the Scadențe card's
   * "Restante" column and this space's tile on Acasă/Spații. */
  overdueCount: number;
  /** Opens the Scadențe page. */
  onOverduePress?: () => void;
  /** Opens HomeSpendPage -- the whole space's spend, not just this
   * month's total. */
  onSpendPress?: () => void;
};

/** The Home space's hero card: this month's spend (tap -> spend page)
 * and how many things are past due (tap -> Scadențe), side by side. */
export function HomeStats({ thisMonthExpenses, overdueCount, onOverduePress, onSpendPress }: HomeStatsProps) {
  const { colors, spacing, radius } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const big = { fontSize: 24, fontWeight: "600" as const, letterSpacing: -0.5, color: colors.onSurface };

  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}>
      <PressableScale
        testID="home-spend-stat"
        onPress={onSpendPress}
        disabled={!onSpendPress}
        scaleTo={motion.scale.tile}
        accessibilityRole="button"
        accessibilityLabel={`Luna asta: ${thisMonthExpenses} lei. Vezi cheltuielile`}
        style={{ flex: 1, gap: 2 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ fontSize: 13, color: muted }}>Luna asta</Text>
          {onSpendPress ? <Ionicons name="chevron-forward" size={13} color={muted} /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
          <AnimatedNumber value={thisMonthExpenses} style={big} />
          <Text style={{ fontSize: 15, color: muted }}>lei</Text>
        </View>
      </PressableScale>
      <PressableScale
        testID="home-overdue-stat"
        onPress={onOverduePress}
        disabled={!onOverduePress}
        scaleTo={motion.scale.tile}
        accessibilityRole="button"
        accessibilityLabel={`Restante: ${overdueCount}. Vezi scadențele`}
        style={{ flex: 1, gap: 2 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ fontSize: 13, color: muted }}>Restante</Text>
          {onOverduePress ? <Ionicons name="chevron-forward" size={13} color={muted} /> : null}
        </View>
        <AnimatedNumber value={overdueCount} style={{ ...big, color: overdueCount > 0 ? colors.error : colors.onSurface }} />
      </PressableScale>
    </View>
  );
}
