import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { PressableScale } from "@/components/ui/PressableScale";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { motion, useReducedMotion } from "@/lib/motion";
import { lei } from "@/lib/format";

export type ExpensesStatsProps = {
  entries: ExpenseEntry[];
  allTimeTotal: number;
  thisMonthTotal: number;
  /** Opens ExpensesDetailPage (trend + breakdown). */
  onTotalPress: () => void;
};

/** The last 6 calendar months, oldest first, each with its total. */
function lastSixMonths(entries: ExpenseEntry[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), total: 0, label: d.toLocaleDateString("ro-RO", { month: "short" }).replace(".", "") };
  });
  entries.forEach((e) => {
    const d = new Date(e.date);
    const m = months.find((x) => x.year === d.getFullYear() && x.month === d.getMonth());
    if (m) m.total += e.price;
  });
  return months;
}

/**
 * The Expenses hero: this month's total as the headline, a 6-month bar
 * chart under it (current month in teal), and the all-time total as the
 * way into the detail page. Bars grow in when the numbers change.
 */
export function ExpensesStats({ entries, allTimeTotal, thisMonthTotal, onTotalPress }: ExpensesStatsProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const months = useMemo(() => lastSixMonths(entries), [entries]);
  const max = Math.max(1, ...months.map((m) => m.total));
  const muted = colors.onSurfaceTertiary;

  return (
    <PressableScale
      testID="expenses-total-card"
      onPress={onTotalPress}
      scaleTo={motion.scale.card}
      accessibilityRole="button"
      accessibilityLabel={`Luna asta ${lei(thisMonthTotal)}. Total ${lei(allTimeTotal)}. Vezi detalii`}
      style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}
    >
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 13, color: muted }}>Luna asta</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <AnimatedNumber value={thisMonthTotal} style={{ ...typography.display, color: colors.onSurface }} />
          <Text style={{ fontSize: 16, color: muted }}>lei</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 64 }}>
        {months.map((m, i) => (
          <Bar key={`${m.year}-${m.month}`} ratio={m.total / max} current={i === months.length - 1} />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {months.map((m, i) => (
          <Text key={`${m.year}-${m.month}`} style={{ flex: 1, textAlign: "center", fontSize: 12, color: i === months.length - 1 ? colors.onSurface : muted }}>
            {m.label}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ fontSize: 14, color: muted }}>
          Total: <Text style={{ fontWeight: "600", color: colors.onSurface }}>{lei(allTimeTotal)}</Text>
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ fontSize: 14, color: muted }}>Detalii</Text>
          <Ionicons name="chevron-forward" size={14} color={muted} />
        </View>
      </View>
    </PressableScale>
  );
}

function Bar({ ratio, current }: { ratio: number; current: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const h = useRef(new Animated.Value(reduced ? ratio : 0)).current;

  useEffect(() => {
    if (reduced) {
      h.setValue(ratio);
      return;
    }
    const a = Animated.timing(h, { toValue: ratio, duration: 500, easing: motion.reveal.easing, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [ratio, reduced, h]);

  return (
    <View style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
      <Animated.View
        style={{
          borderRadius: 4,
          minHeight: 4,
          backgroundColor: current ? SPACE_IDENTITY_COLORS.expenses : colors.surfaceTertiary,
          height: h.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      />
    </View>
  );
}
