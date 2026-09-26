import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import type { GroceryCategory } from "@/lib/spaces/grocery/grocery.types";
import { matchIngredientCategory, useIngredientReferences } from "@/lib/spaces/grocery/ingredientLookup";

export type GroceryQuickAddBarProps = {
  onAdd: (draft: { name: string; category: GroceryCategory }) => void;
};

/**
 * Replaces the old "Add Product" sheet as the everyday way to add a
 * grocery item -- one field, right in the list, no modal in the way.
 * Type a name, tap the "+", it's on the list. Category is guessed from
 * the name (same ingredientLookup matching GroceryProductModal already
 * used) and shown as a quiet hint underneath rather than a 9-tile grid;
 * a wrong guess (or adding a quantity) is fixed afterward by tapping
 * the new row's pencil icon -- which still opens the full
 * GroceryProductModal, this bar just isn't where that form lives anymore.
 *
 * Deliberately no amount/unit field: keeping this to one field is the
 * whole point (see the design comparison this replaced -- three
 * directions for a lighter add, this one chosen). Stays open after
 * adding (clears and keeps focus) so several items go in back to back.
 */
export function GroceryQuickAddBar({ onAdd }: GroceryQuickAddBarProps) {
  const { colors, spacing, radius } = useTheme();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const ingredientReferences = useIngredientReferences();

  const matchedCategory = matchIngredientCategory(ingredientReferences, value);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd({ name: trimmed, category: matchedCategory ?? "Other" });
    setValue("");
  };

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1, color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
        ADD AN ITEM
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <TextInput
          testID="grocery-quick-add-input"
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="done"
          placeholder="e.g. 2L Milk"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={{
            flex: 1,
            minHeight: 52,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.sm,
            backgroundColor: "transparent",
            borderWidth: focused ? 2 : 1,
            borderColor: focused ? colors.onSurface : colors.border,
            color: colors.onSurface,
            fontSize: 15,
          }}
        />

        <Pressable
          testID="grocery-quick-add-submit"
          onPress={submit}
          disabled={!value.trim()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Add item"
          style={{
            width: 52,
            height: 52,
            borderRadius: radius.md,
            // Grocery's identity color, same signal Car/Home already
            // carry on their own primary "add" affordances. Amber is
            // bright enough that a white "+" fails contrast on it
            // (~2.2:1, computed against WCAG's 3:1 minimum for
            // graphical objects) -- fixed dark icon instead, same value
            // in both themes since the fill itself doesn't flip either.
            backgroundColor: SPACE_IDENTITY_COLORS.grocery,
            alignItems: "center",
            justifyContent: "center",
            opacity: value.trim() ? 1 : 0.4,
          }}
        >
          <Ionicons name="add" size={22} color="#111111" />
        </Pressable>
      </View>

      {value.trim() && matchedCategory ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }}>
          <Ionicons name="pricetag-outline" size={13} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
            Recognized as <Text style={{ fontWeight: "700", color: colors.onSurface }}>{matchedCategory}</Text> · edit it on the new item after adding
          </Text>
        </View>
      ) : null}
    </View>
  );
}
