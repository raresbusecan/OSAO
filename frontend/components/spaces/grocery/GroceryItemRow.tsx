import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { confirmAction } from "@/lib/confirm";
import type { GroceryItem } from "@/lib/spaces/grocery/grocery.types";

export type GroceryItemRowProps = {
  item: GroceryItem;
  onToggle: (id: string) => void;
  /** Opens the shared add/edit sheet on this item -- the pencil icon
   * (and Delete from inside the sheet, still there too). */
  onOpenMenu: (item: GroceryItem) => void;
  /** Deletes the item straight from the row, no sheet in the way --
   * confirms first, same as every other delete in this space. */
  onDelete: (id: string) => void;
};

/** One row -- a filled black circle+checkmark and struck-through gray
 * text once bought, an empty circle otherwise. Tapping the circle (or
 * anywhere on the row except the pencil/trash icons) toggles it, always
 * reversibly. */
export function GroceryItemRow({ item, onToggle, onOpenMenu, onDelete }: GroceryItemRowProps) {
  const { colors, spacing, typography } = useTheme();

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      "Delete product",
      `Remove "${item.name}" from your shopping list?`,
      { confirmLabel: "Delete", destructive: true },
    );

    if (confirmed) onDelete(item.id);
  };

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
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: item.inCart ? colors.onSurface : "transparent",
          borderWidth: item.inCart ? 0 : 1.5,
          borderColor: colors.border,
        }}
      >
        {item.inCart ? <Ionicons name="checkmark" size={15} color={colors.surface} /> : null}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            ...typography.body,
            color: item.inCart ? colors.onSurfaceTertiary : colors.onSurface,
            textDecorationLine: item.inCart ? "line-through" : "none",
          }}
        >
          {item.name}
        </Text>

        {item.quantity || item.price != null ? (
          <Text
            style={{
              ...typography.caption,
              marginTop: 2,
              color: colors.onSurfaceTertiary,
              textDecorationLine: item.inCart ? "line-through" : "none",
            }}
          >
            {[item.quantity, item.price != null ? `${new Intl.NumberFormat("en-US").format(item.price)} RON` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <Pressable
          testID={`grocery-item-delete-${item.id}`}
          onPress={handleDelete}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.name}`}
        >
          <Ionicons name="trash-outline" size={17} color={colors.error} />
        </Pressable>

        <Pressable
          testID={`grocery-item-menu-${item.id}`}
          onPress={() => onOpenMenu(item)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.name}`}
        >
          <Ionicons name="create-outline" size={18} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>
    </Pressable>
  );
}
