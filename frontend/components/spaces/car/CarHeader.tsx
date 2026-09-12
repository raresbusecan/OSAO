import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useRouter } from "expo-router";

export type CarHeaderProps = {
  space: any;
  onAdd?: () => void;
  onEdit?: () => void;
};

export function CarHeader({
  space,
  onAdd,
  onEdit,
}: CarHeaderProps) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();

  return (
    <>
      <View
        style={{
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          testID="space-back"
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color={colors.onSurface}
          />
        </Pressable>

        <Pressable
          hitSlop={12}
          testID="car-more"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={colors.onSurfaceTertiary}
          />
        </Pressable>
      </View>

      <View
        style={{
          position: "relative",
          alignItems: "center",
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
        }}
      >
        <Pressable
          testID="space-add"
          hitSlop={10}
          onPress={onAdd}
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
          <Ionicons
            name="add"
            size={22}
            color={colors.onSurface}
          />
        </Pressable>

        <Pressable
          testID="space-edit"
          hitSlop={10}
          onPress={onEdit}
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
          <Ionicons
            name="create-outline"
            size={19}
            color={colors.onSurface}
          />
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
            name={(space?.icon || "car-outline") as any}
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
          {space?.name || "Car"}
        </Text>

        <Text
          style={{
            marginTop: 4,
            fontSize: 14,
            color: colors.onSurfaceTertiary,
          }}
        >
          BMW 320d · 2018
        </Text>
      </View>
    </>
  );
}