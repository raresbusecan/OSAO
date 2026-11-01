import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { severityColor, type SeverityTier } from "@/lib/statusColors";
import { recurringWarningTierColor, type RecurringWarningTier } from "@/lib/spaces/home/calculations/dashboard.calculations";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { PressableScale } from "@/components/ui/PressableScale";
import { SectionHeader } from "@/components/ui/primitives";
import { GuiltFreeChip } from "@/components/dashboard/GuiltFree";

const RECURRING_TIERS = new Set<string>(["red", "orangeToday", "orangeDays", "yellow"]);

/** `urgencyTier` is one of two disjoint tier vocabularies depending on
 * which category set it -- Documents' classifyDocumentUrgencyTier
 * (3-value SeverityTier) or Maintenance/Recurring's
 * classifyTaskUrgencyTier (4-value RecurringWarningTier, its own
 * dedicated color gradient, see recurringWarningTierColor). Resolved
 * here (not at config-build time in homeCategoryConfig.ts) since that
 * config has no `colors`/theme access -- same reason Documents' own
 * tier was always resolved this late too. */
function resolveUrgencyColor(tier: SeverityTier | RecurringWarningTier, colors: ThemeColors): string {
  if (RECURRING_TIERS.has(tier)) return recurringWarningTierColor(tier as RecurringWarningTier, colors);
  return severityColor(tier as SeverityTier, colors);
}

export type HomeCategoryRow = {
  id: string | number;
  title: string;
  subtitle: string;
  amount?: string;
  /** Shows a small repeat icon next to the title -- so a row that has a
   * "Resolved" action (onRowResolve) tells you what that action will
   * actually do (advance vs. retire) before you tap it, not just in the
   * confirm dialog afterward. Only Maintenance sets this today. */
  isRecurring?: boolean;
  /** Set only when this row is within its own alert window (Documents'
   * classifyDocumentUrgencyTier, Maintenance/Recurring's
   * classifyTaskUrgencyTier -- see homeCategoryConfig.ts) -- colors the
   * subtitle instead of the plain gray default, same escalation Car's
   * own Documents list already shows via statusColor. See
   * resolveUrgencyColor above for how the two tier vocabularies map to
   * an actual color. */
  urgencyTier?: SeverityTier | RecurringWarningTier;
  /** items.guilt_free -- a small "Fără vină" chip after the title. */
  guiltFree?: boolean;
};

export type HomeCategorySectionProps = {
  title: string;
  rows: HomeCategoryRow[];
  emptyLabel: string;
  /** Tapping the row itself -- the record preview (HomeRecordSheet). */
  onRowPress?: (id: string | number) => void;
  /** Long press -- the record's action sheet (Rezolvă / Editează / Șterge). */
  onRowLongPress?: (id: string | number) => void;
  /** Swipe-left delete (the caller confirms first). */
  onRowDelete?: (id: string | number) => void;
  /** A checkbox at the row's LEFT edge (same treatment as Tasks' own
   * resolve checkbox, see HomeTasksPage.tsx) -- only for a category
   * that actually has a "Resolved" concept (currently just Maintenance,
   * see homeCategoryConfig.ts's resolveEntry). Omitted entirely for
   * every other category rather than shown disabled. */
  onRowResolve?: (id: string | number) => void;
  /** Swipe-right only, no checkbox -- a document's "Reînnoiește". */
  onRowRenew?: (id: string | number) => void;
};

/**
 * One shared list section, reused for all Home categories (Documents,
 * Expenses, Maintenance, Recurring) instead of duplicating the row
 * markup per category. 2026-10 redesign: rows on one grouped card; a
 * round check on the left only for categories with a "Resolved" concept;
 * the subtitle takes the urgency color; delete is swipe-left (the
 * per-row trash icon is gone), resolve is the check or swipe-right.
 */
export function HomeCategorySection({
  title,
  rows,
  emptyLabel,
  onRowPress,
  onRowLongPress,
  onRowDelete,
  onRowResolve,
  onRowRenew,
}: HomeCategorySectionProps) {
  const { card, colors, spacing, radius } = useTheme();
  const inset = onRowResolve ? 54 : 16;

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title={title} />
      {rows.length === 0 ? (
        <View style={{ ...card, borderRadius: radius.card, padding: spacing.lg }}>
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{emptyLabel}</Text>
        </View>
      ) : (
        <View style={{ ...card, borderRadius: radius.card, overflow: "hidden" }}>
          {rows.map((row, index) => {
            const tone = row.urgencyTier ? resolveUrgencyColor(row.urgencyTier, colors) : null;
            const rowContent = (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingLeft: onRowResolve ? spacing.md + 2 : spacing.lg, paddingRight: spacing.lg, minHeight: 60, backgroundColor: colors.surfaceSecondary }}>
                {onRowResolve ? (
                  <Pressable
                    testID={`home-row-resolve-${row.id}`}
                    onPress={() => onRowResolve(row.id)}
                    hitSlop={10}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: false }}
                    accessibilityLabel={`Rezolvă: ${row.title}`}
                    style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.control, flexShrink: 0 }}
                  />
                ) : null}

                <PressableScale
                  onPress={onRowPress ? () => onRowPress(row.id) : undefined}
                  onLongPress={onRowLongPress ? () => onRowLongPress(row.id) : undefined}
                  delayLongPress={350}
                  disabled={!onRowPress && !onRowLongPress}
                  scaleTo={1}
                  accessibilityRole="button"
                  accessibilityLabel={row.title}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + 2 }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {/* Says what "Resolved" will do (advance vs. retire)
                          before it's tapped. */}
                      {row.isRecurring ? <Ionicons name="repeat-outline" size={14} color={colors.onSurfaceTertiary} /> : null}
                      <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={2}>
                        {row.title}
                      </Text>
                      {row.guiltFree ? <View><GuiltFreeChip testID={`home-row-guilt-free-${row.id}`} /></View> : null}
                    </View>
                    <Text style={{ fontSize: 13, marginTop: 2, color: tone ?? colors.onSurfaceTertiary, fontWeight: tone ? "500" : "400" }} numberOfLines={2}>
                      {row.subtitle}
                    </Text>
                  </View>
                  {row.amount ? (
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface, fontVariant: ["tabular-nums"] }}>{row.amount}</Text>
                  ) : null}
                </PressableScale>
              </View>
            );

            return (
              <View key={row.id}>
                {index > 0 ? <View style={{ height: 1, marginLeft: inset, backgroundColor: colors.border }} /> : null}
                {onRowDelete ? (
                  <SwipeRow
                    onResolve={onRowResolve ? () => onRowResolve(row.id) : onRowRenew ? () => onRowRenew(row.id) : undefined}
                    resolveIcon={onRowRenew && !onRowResolve ? "refresh" : "checkmark"}
                    resolveLabel={onRowRenew && !onRowResolve ? "Reînnoiește" : "Rezolvă"}
                    onDelete={() => onRowDelete(row.id)}
                    cornerRadius={0}
                    colors={colors}
                  >
                    <View testID={`home-row-delete-${row.id}`}>{rowContent}</View>
                  </SwipeRow>
                ) : (
                  rowContent
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
