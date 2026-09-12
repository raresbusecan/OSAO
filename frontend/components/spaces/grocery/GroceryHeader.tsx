import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type GroceryHeaderProps = {
  space: any;
  onEdit?: () => void;
};

export function GroceryHeader({ space, onEdit }: GroceryHeaderProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View
      style={{
        position: "relative",
        alignItems: "center",
        paddingTop: spacing.md,
        paddingBottom: spacing.xl,
      }}
    >
      <Pressable
        testID="space-edit"
        onPress={onEdit}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Edit grocery space"
        style={{
          position: "absolute",
          right: 0,
          top: spacing.md + 10,
          width: 40,
          height: 40,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="create-outline" size={19} color={colors.onSurface} />
      </Pressable>

      <View
        style={{
          width: 68,
          height: 68,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSecondary,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
        }}
      >
        <Ionicons
          name={(space?.icon || "cart-outline") as any}
          size={32}
          color={colors.onSurface}
        />
      </View>

      <Text
        style={{
          fontSize: 30,
          lineHeight: 36,
          fontWeight: "800",
          color: colors.onSurface,
          letterSpacing: -0.7,
        }}
      >
        {space?.name || "Grocery"}
      </Text>

      <Text
        style={{
          marginTop: 4,
          fontSize: 14,
          color: colors.onSurfaceTertiary,
        }}
      >
        Your shopping list
      </Text>
    </View>
  );
}
