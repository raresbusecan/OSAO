import React, { useState } from "react";
import { View, Text, TextInput, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { spaceColors } from "@/lib/spaces/spaceProfile";
import { groceryCategoryLabel, type GroceryCategory } from "@/lib/spaces/grocery/grocery.types";
import { matchIngredientCategory, useIngredientReferences } from "@/lib/spaces/grocery/ingredientLookup";
import { PressableScale } from "@/components/ui/PressableScale";
import { motion } from "@/lib/motion";

export type GroceryQuickAddBarProps = {
  onAdd: (draft: { name: string; category: GroceryCategory }) => void;
  /** Overrides the default hint text (Simplu's "În magazin" asks "Ai uitat ceva?"). */
  placeholder?: string;
  /** The "+" button also closes the keyboard (Simplu, user decision
   * 2026-10-15). The keyboard's own return key still keeps it open. */
  closeKeyboardOnAdd?: boolean;
};

/**
 * The everyday way to add a grocery item -- one field, right in the
 * list, no modal in the way. Type a name, tap the "+", it's on the
 * list. Category is guessed from the name (same ingredientLookup
 * matching GroceryProductModal uses) and shown as a quiet hint
 * underneath; a wrong guess (or a quantity) is fixed afterward by
 * long-pressing the new row, which opens the full GroceryProductModal.
 *
 * Deliberately no amount/unit field: keeping this to one field is the
 * whole point. Stays open after adding (clears and keeps focus) so
 * several items go in back to back.
 */
export function GroceryQuickAddBar({ onAdd, placeholder, closeKeyboardOnAdd }: GroceryQuickAddBarProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const ingredientReferences = useIngredientReferences();
  const groc = useSpaceColors("grocery");
  const fill = groc.color;
  // Amber is 2.1:1 on the light theme's raised layer -- the focus ring
  // uses the deeper text tint there.
  const ring = isDark ? fill : spaceColors(groc.key, false)!.tint;

  const matchedCategory = matchIngredientCategory(ingredientReferences, value);
  const canSubmit = !!value.trim();

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd({ name: trimmed, category: matchedCategory ?? "Other" });
    setValue("");
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <TextInput
          testID="grocery-quick-add-input"
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="done"
          blurOnSubmit={false}
          placeholder={placeholder ?? "Adaugă un produs, ex. 2 l lapte"}
          placeholderTextColor={colors.onSurfaceTertiary}
          accessibilityLabel="Adaugă un produs"
          style={{
            flex: 1,
            height: 52,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.control,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1.5,
            borderColor: focused ? ring : "transparent",
            color: colors.onSurface,
            fontSize: 15,
          }}
        />

        <PressableScale
          testID="grocery-quick-add-submit"
          onPress={() => {
            submit();
            if (closeKeyboardOnAdd) Keyboard.dismiss();
          }}
          disabled={!canSubmit}
          scaleTo={motion.scale.control}
          accessibilityRole="button"
          accessibilityLabel="Adaugă produsul"
          style={{
            width: 52,
            height: 52,
            borderRadius: radius.control,
            // Dark "+" -- white on amber fails contrast (~2.2:1).
            backgroundColor: canSubmit ? fill : `${fill}55`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={24} color={groc.ink} />
        </PressableScale>
      </View>

      {canSubmit && matchedCategory ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.xs }}>
          <Ionicons name="pricetag-outline" size={13} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
            Recunoscut ca <Text style={{ fontWeight: "600", color: colors.onSurface }}>{groceryCategoryLabel(matchedCategory)}</Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}
