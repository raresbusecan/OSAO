import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type GroceryAddBarProps = {
  onAdd: (name: string) => void;
};

/**
 * A plain text input, not a modal/form -- adding a grocery item is a
 * one-off, single-field action ("type it, hit add"), unlike Home's
 * multi-field entries which genuinely need a full form.
 */
export function GroceryAddBar({ onAdd }: GroceryAddBarProps) {
  const { colors, spacing, radius } = useTheme();
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
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
        testID="grocery-add-input"
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        returnKeyType="done"
        placeholder="Add an item..."
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

      <Pressable
        testID="grocery-add-button"
        onPress={submit}
        disabled={!value.trim()}
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: value.trim() ? 1 : 0.5,
        }}
      >
        <Ionicons name="add" size={22} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}
