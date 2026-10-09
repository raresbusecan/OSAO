import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { PressableScale } from "@/components/ui/PressableScale";
import { motion } from "@/lib/motion";

export type SpaceQuickAction = { key: string; icon: string; label: string };

/**
 * A Space's row of "add" buttons -- square tinted icon wells with the
 * label underneath, all alike (a filled first one read as "selected").
 * Order is the hint: most frequent first. Used by Mașină and Casă.
 */
export function SpaceQuickActions({ kind, actions, onAction }: { kind: SpaceKind; actions: SpaceQuickAction[]; onAction?: (key: string) => void }) {
  const { colors, spacing, isDark } = useTheme();
  const fill = SPACE_IDENTITY_COLORS[kind] ?? colors.onSurfaceTertiary;
  const tint = spaceTextColor(kind, isDark) ?? fill;

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: actions.length > 4 ? spacing.xs : spacing.sm }}>
      {actions.map((action) => (
        <PressableScale
          key={action.key}
          testID={`${kind}-action-${action.key}`}
          onPress={() => onAction?.(action.key)}
          accessibilityRole="button"
          accessibilityLabel={`Adaugă ${action.label.toLowerCase()}`}
          scaleTo={motion.scale.control}
          style={{ flex: 1, alignItems: "center", gap: spacing.sm }}
        >
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: `${fill}29`, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={action.icon as any} size={22} color={tint} />
          </View>
          <Text style={{ fontSize: actions.length > 4 ? 11 : 12, fontWeight: "500", color: colors.onSurfaceSecondary }} numberOfLines={1}>
            {action.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}
