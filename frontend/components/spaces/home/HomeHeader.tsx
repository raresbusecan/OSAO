import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type HomeHeaderProps = {
  space: any;
  /** The profile's county (Județ) -- shown gray/small under the name, same spot a hardcoded category list used to sit. */
  subtitle?: string;
  onBack: () => void;
  onEdit?: () => void;
};

export function HomeHeader({ space, subtitle, onBack, onEdit }: HomeHeaderProps) {
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
      {/* The old "+" here opened the exact same sheet as the category
          menu handle below -- one action, two buttons. This is the only
          way back to Spaces from inside a space now. */}
      <Pressable
        testID="space-back"
        onPress={onBack}
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
          backgroundColor: colors.surfaceSecondary,
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
        accessibilityLabel="Edit home"
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
          name={(space?.icon || "home-outline") as any}
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
        {space?.name || "Home"}
      </Text>

      {subtitle ? (
        <Text
          style={{
            marginTop: 4,
            fontSize: 14,
            color: colors.onSurfaceTertiary,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
