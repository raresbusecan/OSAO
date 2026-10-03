import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { PressableScale } from "@/components/ui/PressableScale";

export type CarQuickAction = {
  key: string;
  icon: string;
  label: string;
};

export type CarQuickActionsProps = {
  // Widened to plain string/SpaceCategory[] rather than a narrow key
  // union -- this reuses the exact same array CarDashboard already
  // builds (carCategories), so the two never drift out of sync.
  actions: CarQuickAction[];
  onAction?: (key: string) => void;
};

/**
 * The one way into each Car form. 2026-10 redesign: a row of square
 * icon buttons with the label underneath (the finance-app "deposit /
 * withdraw / transfer" row). The FIRST action -- Fuel, the most frequent
 * entry by far -- is the filled primary in the Space's own color; the
 * rest are tinted wells, so there's one obvious default without hiding
 * the others.
 */
export function CarQuickActions({ actions, onAction }: CarQuickActionsProps) {
  const { colors, spacing, isDark } = useTheme();
  const fill = SPACE_IDENTITY_COLORS.car!;
  const tint = spaceTextColor("car", isDark) ?? fill;

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.sm }}>
      {actions.map((action, index) => {
        const primary = index === 0;
        return (
          <PressableScale
            key={action.key}
            testID={`car-action-${action.key}`}
            onPress={() => onAction?.(action.key)}
            accessibilityRole="button"
            accessibilityLabel={`Adaugă ${action.label.toLowerCase()}`}
            scaleTo={0.94}
            style={{ flex: 1, alignItems: "center", gap: spacing.sm }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                backgroundColor: primary ? fill : `${fill}24`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={action.icon as any} size={22} color={primary ? "#FFFFFF" : tint} />
            </View>
            <Text style={{ fontSize: 12, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>
              {action.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
