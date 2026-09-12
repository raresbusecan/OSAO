import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type ExpensesAddBarProps = {
  onAdd: (name: string, price: number) => void;
};

/**
 * Just the two fields this space currently asks for: name and price.
 * A category/notes field can be added later without changing this
 * component's shape -- ExpenseEntry would just grow, this bar wouldn't.
 */
export function ExpensesAddBar({ onAdd }: ExpensesAddBarProps) {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const parsedPrice = Number(price.replace(",", "."));
  const canSubmit = name.trim().length > 0 && price.trim().length > 0 && !Number.isNaN(parsedPrice) && parsedPrice >= 0;

  const submit = () => {
    if (!canSubmit) return;
    onAdd(name.trim(), parsedPrice);
    setName("");
    setPrice("");
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        marginBottom: spacing.xl,
      }}
    >
      <TextInput
        testID="expenses-add-name"
        value={name}
        onChangeText={setName}
        onSubmitEditing={submit}
        returnKeyType="done"
        placeholder="What did you buy?"
        placeholderTextColor={colors.onSurfaceTertiary}
        style={{
          flex: 1,
          height: 48,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSecondary,
          color: colors.onSurface,
          fontSize: 14,
        }}
      />

      <TextInput
        testID="expenses-add-price"
        value={price}
        onChangeText={setPrice}
        onSubmitEditing={submit}
        returnKeyType="done"
        keyboardType="decimal-pad"
        placeholder="Price"
        placeholderTextColor={colors.onSurfaceTertiary}
        style={{
          width: 90,
          height: 48,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSecondary,
          color: colors.onSurface,
          fontSize: 14,
        }}
      />

      <Pressable
        testID="expenses-add-button"
        onPress={submit}
        disabled={!canSubmit}
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: canSubmit ? 1 : 0.5,
        }}
      >
        <Ionicons name="add" size={22} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}
