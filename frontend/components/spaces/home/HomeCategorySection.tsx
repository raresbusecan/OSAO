import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
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
  onRowPress?: (id: string | number) => void;
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
}: HomeCategorySectionProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 1,
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
            borderRadius: radius.lg,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          }}
        >
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
            {emptyLabel}
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: colors.surfaceSecondary,
            borderRadius: radius.lg,
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
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.onSurface,
                  }}
                >
                  {row.title}
                </Text>

                <Text
                  style={{
                    marginTop: 2,
                    fontSize: 12,
                    color: colors.onSurfaceTertiary,
                  }}
                >
                  {row.subtitle}
                </Text>
              </View>

              {row.amount ? (
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: colors.onSurface,
                  }}
                >
                  {row.amount}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}
