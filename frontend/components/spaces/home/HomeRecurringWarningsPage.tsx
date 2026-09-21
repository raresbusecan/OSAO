import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { severityColor, severityTint } from "@/lib/statusColors";

import type { HomeData } from "./home.data.types";
import type { HomeTaskEntry } from "@/lib/spaces/home/home.types";
import {
  getRecurringTaskWarnings,
  type RecurringWarningRow,
  type RecurringWarningTier,
} from "@/lib/spaces/home/calculations/dashboard.calculations";

export type HomeRecurringWarningsPageProps = {
  homeData: HomeData;
  onBack: () => void;
  /** A row tap opens HomeTaskResolveSheet (price if it's a purchase,
   * next-due-date always -- every row here is recurring by definition),
   * not the full edit form. The task's other details stay unchanged. */
  onResolvePress: (entry: HomeTaskEntry) => void;
};

// Built from `colors` (not a module-level constant) so it actually flips
// with dark mode -- the old hardcoded hex here never did.
function tierStyle(colors: ThemeColors): Record<RecurringWarningTier, { color: string; bg: string; label: (row: RecurringWarningRow) => string }> {
  return {
    red: { color: severityColor("critical", colors), bg: severityTint("critical", colors), label: () => "RESTANT" },
    orangeToday: { color: severityColor("warning", colors), bg: severityTint("warning", colors), label: () => "Azi" },
    orangeDays: { color: severityColor("warning", colors), bg: severityTint("warning", colors), label: (r) => `${r.daysRemaining} zile` },
    yellow: { color: severityColor("caution", colors), bg: severityTint("caution", colors), label: (r) => `${r.daysRemaining} zile` },
  };
}

/** Opened from the Restanțe card on HomeTasksPage -- every recurring
 * task within 4 days of (or past) its due date, one row each, colored
 * by tier. Not a generic "all tasks" list -- a non-recurring task
 * archives once resolved, so there's nothing to warn about ahead of
 * time the way there is for one that keeps coming back. */
export function HomeRecurringWarningsPage({ homeData, onBack, onResolvePress }: HomeRecurringWarningsPageProps) {
  const { colors, spacing, radius } = useTheme();
  const TIER_STYLE = tierStyle(colors);

  const { rows } = getRecurringTaskWarnings(homeData);
  const findEntry = (id: string) => homeData.taskEntries.find((t) => t.id === id)!;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 100 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl }}>
          <Pressable
            onPress={onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
          </Pressable>
          <Text style={{ fontSize: 26, fontWeight: "800", letterSpacing: -0.4, color: colors.onSurface }}>
            Restanțe
          </Text>
        </View>

        {rows.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {rows.map((row) => {
              const style = TIER_STYLE[row.tier];
              return (
                <Pressable
                  key={row.id}
                  onPress={() => onResolvePress(findEntry(row.id))}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    padding: spacing.md + 1,
                    borderRadius: radius.lg,
                    backgroundColor: style.bg,
                    borderWidth: 1,
                    borderColor: style.color,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: radius.md,
                      backgroundColor: `${style.color}22`,
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Ionicons name="repeat-outline" size={16} color={style.color} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "700", color: colors.onSurface }} numberOfLines={1}>
                    {row.title}
                  </Text>
                  {row.tier === "red" ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: `${style.color}22` }}>
                      <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: style.color, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 9, fontWeight: "900", color: colors.surface, lineHeight: 11 }}>!</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: style.color }}>{style.label(row)}</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11.5, fontWeight: "800", color: style.color }}>{style.label(row)}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
            <Ionicons name="checkmark-done-outline" size={26} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
              Niciun task recurent nu se apropie de scadență.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
