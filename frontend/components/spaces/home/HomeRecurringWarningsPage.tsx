import React, { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";

import type { HomeData } from "./home.data.types";
import {
  getRecurringTaskWarnings,
  recurringWarningTierColor,
  type RecurringWarningRow,
  type RecurringWarningTier,
} from "@/lib/spaces/home/calculations/dashboard.calculations";

// Collapsed to this many rows per tier group until "Show more" is
// tapped -- per explicit user request, Restanțe is now one list PER
// tier (RESTANT/AZI/2 ZILE/4 ZILE) instead of one flat list, each with
// its own show more/less next to its own title.
const COLLAPSED_ROW_COUNT = 3;

const TIER_ORDER: RecurringWarningTier[] = ["red", "orangeToday", "orangeDays", "yellow"];
const TIER_SECTION_TITLE: Record<RecurringWarningTier, string> = {
  red: "RESTANT",
  orangeToday: "AZI",
  orangeDays: "ÎN 1-2 ZILE",
  yellow: "ÎN 3-4 ZILE",
};

// Sections above already group by URGENCY -- this is the other axis
// (which category a row is actually FROM), shown as a small subtitle
// per row per explicit user request ("sa se vada clar care restanta de
// unde vine exact"). The old icon-only signal (repeat vs. alert-circle,
// still shown too) only hinted at "recurring or not", never named the
// actual source category.
const KIND_LABEL: Record<RecurringWarningRow["kind"], string> = {
  task: "Task",
  maintenance: "Mentenanță",
  recurring: "Recurent",
};

export type HomeRecurringWarningsPageProps = {
  homeData: HomeData;
  onBack: () => void;
  /** A row tap resolves it -- a task row opens HomeTaskResolveSheet
   * (price if it's a purchase, next-due-date always), a maintenance row
   * goes through the same resolveEntry/confirmAction flow its own
   * category checkbox already uses. See row.kind and HomeDashboard's
   * wiring of this prop. */
  onResolvePress: (row: RecurringWarningRow) => void;
};

// Built from `colors` (not a module-level constant) so it actually flips
// with dark mode -- the old hardcoded hex here never did.
function tierStyle(colors: ThemeColors): Record<RecurringWarningTier, { color: string; bg: string; label: (row: RecurringWarningRow) => string }> {
  const colorFor = (tier: RecurringWarningTier) => recurringWarningTierColor(tier, colors);
  // Same tint recipe as severityTint (hex + alpha suffix) -- can't reuse
  // it directly since it only accepts the 3-value SeverityTier, not this
  // page's own 4-stop gradient.
  const bgFor = (tier: RecurringWarningTier) => `${colorFor(tier)}11`;
  return {
    red: { color: colorFor("red"), bg: bgFor("red"), label: () => "RESTANT" },
    orangeToday: { color: colorFor("orangeToday"), bg: bgFor("orangeToday"), label: () => "Azi" },
    orangeDays: { color: colorFor("orangeDays"), bg: bgFor("orangeDays"), label: (r) => `${r.daysRemaining} zile` },
    yellow: { color: colorFor("yellow"), bg: bgFor("yellow"), label: (r) => `${r.daysRemaining} zile` },
  };
}

/** Opened from the Restanțe card on HomeTasksPage -- every task/
 * maintenance/recurring entry within 4 days of (or past) its due date,
 * grouped into one section per tier (RESTANT/AZI/2 ZILE/4 ZILE), each
 * independently collapsible via its own "Show more"/"Show less" next
 * to its title -- per explicit user request, replacing the old single
 * flat list. */
export function HomeRecurringWarningsPage({ homeData, onBack, onResolvePress }: HomeRecurringWarningsPageProps) {
  const { colors, spacing, radius } = useTheme();
  const TIER_STYLE = tierStyle(colors);

  const { rows } = getRecurringTaskWarnings(homeData);
  const rowsByTier: Record<RecurringWarningTier, RecurringWarningRow[]> = {
    red: [],
    orangeToday: [],
    orangeDays: [],
    yellow: [],
  };
  rows.forEach((row) => rowsByTier[row.tier].push(row));

  return (
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
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
          <View style={{ gap: spacing.xl }}>
            {TIER_ORDER.filter((tier) => rowsByTier[tier].length > 0).map((tier) => (
              <TierSection
                key={tier}
                title={TIER_SECTION_TITLE[tier]}
                rows={rowsByTier[tier]}
                style={TIER_STYLE[tier]}
                onResolvePress={onResolvePress}
                colors={colors}
                spacing={spacing}
                radius={radius}
              />
            ))}
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
            <Ionicons name="checkmark-done-outline" size={26} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
              Nimic nu se apropie de scadență.
            </Text>
          </View>
        )}
      </ScrollView>
    </SwipeBackView>
  );
}

function TierSection({
  title,
  rows,
  style,
  onResolvePress,
  colors,
  spacing,
  radius,
}: {
  title: string;
  rows: RecurringWarningRow[];
  style: { color: string; bg: string; label: (row: RecurringWarningRow) => string };
  onResolvePress: (row: RecurringWarningRow) => void;
  colors: ThemeColors;
  spacing: any;
  radius: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const canCollapse = rows.length > COLLAPSED_ROW_COUNT;
  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROW_COUNT);

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
        <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1, color: style.color }}>
          {title} ({rows.length})
        </Text>
        {canCollapse ? (
          <Pressable
            onPress={() => setExpanded((current) => !current)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Show less" : "Show more"}
            style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>
              {expanded ? "Show less" : "Show more"}
            </Text>
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={13} color={colors.onSurfaceTertiary} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        {visibleRows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => onResolvePress(row)}
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
              <Ionicons name={row.isRecurring ? "repeat-outline" : "alert-circle-outline"} size={16} color={style.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14.5, fontWeight: "700", color: colors.onSurface }} numberOfLines={1}>
                {row.title}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 11.5, fontWeight: "600", color: colors.onSurfaceTertiary }}>
                {KIND_LABEL[row.kind]}
              </Text>
            </View>
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
        ))}
      </View>
    </View>
  );
}
