import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type CarQuickAction = {
  key: "fuel" | "maintenance" | "document" | "expense";
  icon: string;
  label: string;
};

export type CarQuickActionsProps = {
  actions: CarQuickAction[];
  onAction?: (key: CarQuickAction["key"]) => void;
};

export function CarQuickActions({
  actions,
  onAction,
}: CarQuickActionsProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 1,
          color: colors.onSurfaceTertiary,
          marginBottom: 10,
        }}
      >
        QUICK ACTIONS
      </Text>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: spacing.sm,
        }}
      >
        {actions.map((action) => (
          <Pressable
            key={action.key}
            testID={`car-action-${action.key}`}
            onPress={() => onAction?.(action.key)}
            style={{
              flexGrow: 1,
              flexBasis: "46%",
              minHeight: 48,
              paddingHorizontal: 14,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Ionicons
              name={action.icon as any}
              size={17}
              color={colors.onSurface}
            />

            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: colors.onSurface,
              }}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}