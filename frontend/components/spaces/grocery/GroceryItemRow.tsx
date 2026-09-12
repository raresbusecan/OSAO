import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { GroceryItem } from "@/lib/spaces/grocery/grocery.types";
import { GROCERY_CATEGORY_ICON } from "./grocery.ui.types";

export type GroceryItemRowProps = {
  item: GroceryItem;
  onToggle: (id: string) => void;
};

/** One row: tap anywhere to toggle "in cart" -- this IS the core interaction. */
export function GroceryItemRow({ item, onToggle }: GroceryItemRowProps) {
  const { colors, spacing } = useTheme();

  return (
    <Pressable
      testID={`grocery-item-${item.id}`}
      onPress={() => onToggle(item.id)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
      }}
    >
      <Ionicons
        name={item.inCart ? "checkmark-circle" : "ellipse-outline"}
        size={24}
        color={item.inCart ? colors.onSurfaceTertiary : colors.onSurface}
      />

      <Ionicons
        name={GROCERY_CATEGORY_ICON[item.category]}
        size={18}
        color={colors.onSurfaceTertiary}
      />

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: item.inCart ? colors.onSurfaceTertiary : colors.onSurface,
            textDecorationLine: item.inCart ? "line-through" : "none",
          }}
        >
          {item.name}
        </Text>

        {item.quantity ? (
          <Text style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }}>
            {item.quantity}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
