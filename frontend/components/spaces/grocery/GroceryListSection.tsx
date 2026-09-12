import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/lib/theme";
import type { GroceryItem } from "@/lib/spaces/grocery/grocery.types";
import { GroceryItemRow } from "./GroceryItemRow";

export type GroceryListSectionProps = {
  title: string;
  items: GroceryItem[];
  emptyLabel: string;
  onToggle: (id: string) => void;
};

/** One shared section, reused for both "TO BUY" and "IN CART". */
export function GroceryListSection({
  title,
  items,
  emptyLabel,
  onToggle,
}: GroceryListSectionProps) {
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

      <View
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderRadius: radius.lg,
          overflow: "hidden",
          marginBottom: spacing.xl,
        }}
      >
        {items.length === 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
              {emptyLabel}
            </Text>
          </View>
        ) : (
          items.map((item, index) => (
            <View
              key={item.id}
              style={{
                borderBottomWidth: index === items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              }}
            >
              <GroceryItemRow item={item} onToggle={onToggle} />
            </View>
          ))
        )}
      </View>
    </>
  );
}
