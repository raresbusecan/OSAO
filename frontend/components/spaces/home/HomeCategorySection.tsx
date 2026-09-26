import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

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
            backgroundColor: "transparent",
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
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.sm,
            overflow: "hidden",
            marginBottom: spacing.xl,
          }}
        >
          {rows.map((row, index) => (
            <View
              key={row.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                gap: spacing.md,
                borderBottomWidth:
                  index === rows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              }}
            >
              {/* Left, like Tasks' own resolve checkbox (HomeTasksPage.tsx)
                  -- same concept, same place, instead of a second small icon
                  crammed at the right next to delete. */}
              {onRowResolve ? (
                <Pressable
                  testID={`home-row-resolve-${row.id}`}
                  onPress={() => onRowResolve(row.id)}
                  hitSlop={8}
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

                  <Text style={{ ...typography.caption, marginTop: 2, color: colors.onSurfaceTertiary }}>
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
                  hitSlop={14}
                  style={{ padding: 2 }}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </>
  );
}
