import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { severityColor, type SeverityTier } from "@/lib/statusColors";
import { recurringWarningTierColor, type RecurringWarningTier } from "@/lib/spaces/home/calculations/dashboard.calculations";
import { SwipeRow } from "@/components/spaces/SwipeRow";

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
};

export type HomeCategorySectionProps = {
  title: string;
  rows: HomeCategoryRow[];
  emptyLabel: string;
  /** Tapping the row itself -- used to open it for editing. */
  onRowPress?: (id: string | number) => void;
  /** The trash icon on the row -- separate from onRowPress so tapping to
   * edit and tapping to delete never mean the same touch. */
  onRowDelete?: (id: string | number) => void;
  /** A checkbox at the row's LEFT edge (same treatment as Tasks' own
   * resolve checkbox, see HomeTasksPage.tsx) -- only for a category
   * that actually has a "Resolved" concept (currently just Maintenance,
   * see homeCategoryConfig.ts's resolveEntry). Omitted entirely for
   * every other category rather than shown disabled. */
  onRowResolve?: (id: string | number) => void;
};

/**
 * One shared list section, reused for all five Home categories
 * (Documents, Expenses, Maintenance, Recurring, Supplies) instead of
 * duplicating the same row markup five times in HomeDashboard.
 */
export function HomeCategorySection({
  title,
  rows,
  emptyLabel,
  onRowPress,
  onRowDelete,
  onRowResolve,
}: HomeCategorySectionProps) {
  const { colors, spacing, radius, typography } = useTheme();

  return (
    <>
      <Text
        style={{
          ...typography.label,
          color: colors.onSurfaceTertiary,
          marginBottom: 10,
        }}
      >
        {title}
      </Text>

      {rows.length === 0 ? (
        <View
          style={{
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.sm,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          }}
        >
          <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary }}>
            {emptyLabel}
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.sm,
            overflow: "hidden",
            marginBottom: spacing.xl,
          }}
        >
          {rows.map((row, index) => {
            const rowContent = (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                gap: spacing.md,
                // A colored left edge, same urgency color as the
                // subtitle text -- a quick visual "frame" per row state
                // without restructuring this shared list container (its
                // rows sit edge-to-edge with hairline separators, not as
                // individual bordered cards like Tasks' own TaskRowCard).
                borderLeftWidth: row.urgencyTier ? 3 : 0,
                borderLeftColor: row.urgencyTier ? resolveUrgencyColor(row.urgencyTier, colors) : "transparent",
                borderBottomWidth:
                  index === rows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
                // Explicit fill (not just inherited from the parent
                // list container behind it) so the row stays visually
                // opaque while SwipeRow drags it away from its own
                // revealed action panel, below.
                backgroundColor: colors.surfaceSecondary,
              }}
            >
              {/* Left, like Tasks' own resolve checkbox (HomeTasksPage.tsx)
                  -- same concept, same place, instead of a second small icon
                  crammed at the right next to delete. The more discoverable,
                  explicitly-labeled twin of this lives in the edit form
                  itself (HomeCategoryPage.tsx's "Rezolvă" button, shown once
                  a row is opened for editing), not here on the row. */}
              {onRowResolve ? (
                <Pressable
                  testID={`home-row-resolve-${row.id}`}
                  onPress={() => onRowResolve(row.id)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Resolved"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 2,
                    // colors.success -- same resolve-action color as
                    // Tasks' own checkbox (HomeTasksPage.tsx), so the two
                    // read as one consistent "this resolves something"
                    // control instead of Maintenance's happening to
                    // borrow the shape but not the color.
                    borderColor: colors.success,
                    flexShrink: 0,
                  }}
                />
              ) : null}

              <Pressable
                onPress={onRowPress ? () => onRowPress(row.id) : undefined}
                disabled={!onRowPress}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md }}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {/* Tells you what the checkbox above will actually do
                        before you tap it (advance vs. retire) instead of
                        only explaining it in the confirm dialog afterward.
                        Same icon/size/color as Tasks' own recurring badge. */}
                    {row.isRecurring ? (
                      <Ionicons name="repeat-outline" size={14} color={colors.onSurfaceTertiary} />
                    ) : null}
                    <Text style={{ ...typography.body, color: colors.onSurface }} numberOfLines={1}>
                      {row.title}
                    </Text>
                  </View>

                  <Text
                    style={{
                      ...typography.caption,
                      marginTop: 2,
                      color: row.urgencyTier ? resolveUrgencyColor(row.urgencyTier, colors) : colors.onSurfaceTertiary,
                      fontWeight: row.urgencyTier ? "700" : typography.caption.fontWeight,
                    }}
                  >
                    {row.subtitle}
                  </Text>
                </View>

                {row.amount ? (
                  <Text style={{ ...typography.body, color: colors.onSurface }}>
                    {row.amount}
                  </Text>
                ) : null}

                {/* Only shown when the row actually does something on tap
                    (onRowPress) -- otherwise a row with just text looked
                    identical whether it opened an edit form or did nothing.
                    Same icon/size/color Car's own tappable rows already use
                    (see CarDashboard.tsx), so this reads as one consistent
                    "this row is tappable" signal app-wide. */}
                {onRowPress ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
                ) : null}
              </Pressable>

              {onRowDelete ? (
                <Pressable
                  testID={`home-row-delete-${row.id}`}
                  onPress={() => onRowDelete(row.id)}
                  hitSlop={{ top: 14, bottom: 14, left: 8, right: 14 }}
                  style={{ padding: 2 }}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                </Pressable>
              ) : null}
            </View>
            );

            // Swipe is a shortcut on top of the icons above, not a
            // replacement -- only added when there's a real onDelete
            // to wire it to (every live caller today always provides
            // one, but the prop itself stays optional). No onResolve
            // means no left-swipe reveal at all (Documents/Expenses
            // have no "Resolved" concept), same as the checkbox above
            // being omitted for them.
            return onRowDelete ? (
              <SwipeRow
                key={row.id}
                onResolve={onRowResolve ? () => onRowResolve(row.id) : undefined}
                onDelete={() => onRowDelete(row.id)}
                cornerRadius={0}
                colors={colors}
              >
                {rowContent}
              </SwipeRow>
            ) : (
              <React.Fragment key={row.id}>{rowContent}</React.Fragment>
            );
          })}
        </View>
      )}
    </>
  );
}
