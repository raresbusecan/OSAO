import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, Animated, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { PressableScale } from "@/components/ui/PressableScale";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { motion, useReducedMotion } from "@/lib/motion";
import { capitalize, lei } from "@/lib/format";

export type ExpensesStatsProps = {
  entries: ExpenseEntry[];
  allTimeTotal: number;
  thisMonthTotal: number;
  /** Calendar purchases later this month -- not spent yet, said apart. */
  plannedThisMonth?: number;
  /** Opens ExpensesDetailPage (trend + breakdown). */
  onTotalPress: () => void;
  /** "2026-8" (year-monthIndex) of the month the list is filtered to, or null. */
  selectedMonth: string | null;
  /** Tapping a bar: filters to that month; tapping the same one again clears it. */
  onMonthPress: (key: string) => void;
};

export type ChartMonth = { key: string; year: number; month: number; total: number; label: string; longLabel: string };

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** The last 6 calendar months, oldest first, each with its total. */
export function lastSixMonths(entries: ExpenseEntry[]): ChartMonth[] {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return {
      key: monthKey(d),
      year: d.getFullYear(),
      month: d.getMonth(),
      total: 0,
      label: d.toLocaleDateString("ro-RO", { month: "short" }).replace(".", ""),
      longLabel: capitalize(d.toLocaleDateString("ro-RO", { month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}) })),
    };
  });
  entries.forEach((e) => {
    const m = months.find((x) => x.key === monthKey(new Date(e.date)));
    if (m) m.total += e.price;
  });
  return months;
}

/** A round top for the y axis (1 / 2 / 2,5 / 5 x 10^n) at or above `max`. */
function niceCeil(max: number): number {
  if (max <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * p >= max) ?? 10;
  return step * p;
}

/** "0", "250", "1,5 mii" -- short enough for the axis column. */
function axisLabel(v: number): string {
  if (v >= 1000) return `${(v / 1000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} mii`;
  return Math.round(v).toLocaleString("ro-RO");
}

const CHART_H = 84;

/**
 * The Expenses hero: the headline month's total, a 6-month bar chart with
 * a lei axis under it, and the all-time total as the way into the detail
 * page. Tapping a bar filters the list below to that month (the headline
 * follows); tapping it again goes back to "Luna asta" and every expense.
 */
export function ExpensesStats({ entries, allTimeTotal, thisMonthTotal, plannedThisMonth = 0, onTotalPress, selectedMonth, onMonthPress }: ExpensesStatsProps) {
  const { card, colors, spacing, radius, typography } = useTheme();
  const months = useMemo(() => lastSixMonths(entries), [entries]);
  const top = niceCeil(Math.max(...months.map((m) => m.total)));
  const ticks = [top, top / 2, 0];
  const muted = colors.onSurfaceTertiary;
  const selected = selectedMonth ? months.find((m) => m.key === selectedMonth) ?? null : null;
  const headlineLabel = selected ? selected.longLabel : "Luna asta";
  const headlineValue = selected ? selected.total : thisMonthTotal;

  return (
    <PressableScale
      testID="expenses-total-card"
      onPress={onTotalPress}
      scaleTo={motion.scale.card}
      accessibilityRole="button"
      accessibilityLabel={`${headlineLabel} ${lei(headlineValue)}. Total ${lei(allTimeTotal)}. Vezi detalii`}
      style={{ ...card, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}
    >
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 13, color: muted }}>{headlineLabel}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <AnimatedNumber value={headlineValue} style={{ ...typography.display, color: colors.onSurface }} />
          <Text style={{ fontSize: 16, color: muted }}>lei</Text>
        </View>
        {!selected && plannedThisMonth > 0 ? (
          <Text style={{ fontSize: 13, color: muted }}>+ {lei(plannedThisMonth)} planificat în Calendar</Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {/* y axis: three round amounts, gridlines run behind the bars */}
        <View style={{ height: CHART_H, justifyContent: "space-between", alignItems: "flex-end" }}>
          {ticks.map((t) => (
            <Text key={t} style={{ fontSize: 11, lineHeight: 12, marginVertical: -6, color: muted, fontVariant: ["tabular-nums"] }}>{axisLabel(t)}</Text>
          ))}
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ height: CHART_H }}>
            {ticks.map((t, i) => (
              <View key={t} style={{ position: "absolute", left: 0, right: 0, top: (i / (ticks.length - 1)) * CHART_H, height: 1, backgroundColor: colors.border, opacity: i === ticks.length - 1 ? 1 : 0.6 }} />
            ))}
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
              {months.map((m, i) => {
                const isSelected = selected ? m.key === selected.key : i === months.length - 1;
                return (
                  <Bar
                    key={m.key}
                    ratio={m.total / top}
                    highlighted={isSelected}
                    label={`${m.longLabel}: ${lei(m.total)}${selected?.key === m.key ? ". Atinge din nou pentru toate lunile" : `. Arată doar ${m.longLabel.toLowerCase()}`}`}
                    onPress={() => onMonthPress(m.key)}
                    testID={`expenses-month-${m.key}`}
                  />
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {months.map((m, i) => {
              const isSelected = selected ? m.key === selected.key : i === months.length - 1;
              return (
                <Text key={m.key} style={{ flex: 1, textAlign: "center", fontSize: 12, color: isSelected ? colors.onSurface : muted, fontWeight: selected?.key === m.key ? "600" : "400" }}>
                  {m.label}
                </Text>
              );
            })}
          </View>
        </View>
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

function Bar({ ratio, highlighted, label, onPress, testID }: { ratio: number; highlighted: boolean; label: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  const TEAL = useSpaceColors("expenses").color;
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
    // The whole column is the target (an empty month is still tappable);
    // "link" on web: the card around it already renders as a <button>.
    <Pressable testID={testID} onPress={onPress} accessibilityRole={Platform.OS === "web" ? "link" : "button"} accessibilityLabel={label} style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
      <Animated.View
        style={{
          borderRadius: 4,
          minHeight: 4,
          backgroundColor: highlighted ? TEAL : colors.surfaceTertiary,
          height: h.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      />
    </Pressable>
  );
}
