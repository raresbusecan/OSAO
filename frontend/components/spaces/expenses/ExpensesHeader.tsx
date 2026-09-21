import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";

export type ExpensesHeaderProps = {
  space: any;
  onEdit?: () => void;
};

export function ExpensesHeader({ space, onEdit }: ExpensesHeaderProps) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  return (
    <View
      style={{
        position: "relative",
        alignItems: "center",
        paddingTop: spacing.md,
        paddingBottom: spacing.xl,
      }}
    >
      {/* BACK -- same style/position as Car/Home/Grocery's own space
          headers; Expenses was missing this, the only way back to
          Spaces from inside those other 3. */}
      <Pressable
        testID="space-back"
        onPress={() => router.push("/spaces")}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back to Spaces"
        style={{
          position: "absolute",
          left: 0,
          top: spacing.md + 10,
          width: 40,
          height: 40,
          borderRadius: radius.pill,
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </Pressable>

      <Pressable
        testID="space-edit"
        onPress={onEdit}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Edit expenses space"
        style={{
          position: "absolute",
          right: 0,
          top: spacing.md + 10,
          width: 40,
          height: 40,
          borderRadius: radius.pill,
          backgroundColor: "transparent",
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
          backgroundColor: `${SPACE_IDENTITY_COLORS.expenses}1A`,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
        }}
      >
        <Ionicons
          name={(space?.icon || "receipt-outline") as any}
          size={32}
          color={SPACE_IDENTITY_COLORS.expenses}
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
        {space?.name || "Expenses"}
      </Text>

      <Text
        style={{
          marginTop: 4,
          fontSize: 14,
          color: colors.onSurfaceTertiary,
        }}
      >
        Everything that does not fit another space
      </Text>
    </View>
  );
}
