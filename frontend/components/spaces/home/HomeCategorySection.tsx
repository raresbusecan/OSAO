import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type HomeCategoryRow = {
  id: string | number;
  title: string;
  subtitle: string;
  amount?: string;
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
            <Pressable
              key={row.id}
              onPress={onRowPress ? () => onRowPress(row.id) : undefined}
              disabled={!onRowPress}
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
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.body, color: colors.onSurface }}>
                  {row.title}
                </Text>

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

              {onRowDelete ? (
                <Pressable
                  testID={`home-row-delete-${row.id}`}
                  onPress={(event) => {
                    event.stopPropagation();
                    onRowDelete(row.id);
                  }}
                  hitSlop={10}
                  style={{ padding: 2 }}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                </Pressable>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}
