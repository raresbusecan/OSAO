import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";

export type CarQuickAction = {
  key: string;
  icon: string;
  label: string;
};

export type CarQuickActionsProps = {
  // Widened to plain string/SpaceCategory[] rather than a narrow key
  // union -- this reuses the exact same array CarDashboard already
  // builds for the FAB registration (carCategories), so the two never
  // drift out of sync.
  actions: CarQuickAction[];
  onAction?: (key: string) => void;
};

/**
 * Revived -- was dead code (see frontend/CLAUDE.md's earlier note),
 * dropped in favor of the shared "+" FAB opening each form directly
 * (see CarDashboard.tsx's handleCarAction), a row here would have just
 * duplicated that. Brought back on the same visual footing as Home's
 * own "CATEGORII" grid (tinted icon chip, identity color at 1A alpha,
 * horizontal row) -- since these cards now cover exactly what the FAB
 * did, the FAB is hidden for Car specifically (app/(tabs)/_layout.tsx)
 * instead of duplicating navigation two ways.
 */
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
        {actions.map((action, index) => {
          // Same fix as Home's category grid -- a lone tile alone on its
          // own row (odd total) centers as a group instead of hugging
          // the left edge. Always false today (4 actions, always even),
          // but stays correct if a 5th action ever gets added.
          const isAlone = index === actions.length - 1 && actions.length % 2 !== 0;

          return (
            <Pressable
              key={action.key}
              testID={`car-action-${action.key}`}
              onPress={() => onAction?.(action.key)}
              style={{
                flexGrow: 1,
                flexBasis: "46%",
                minHeight: 56,
                paddingHorizontal: 12,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: isAlone ? "center" : "flex-start",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.sm,
                  backgroundColor: `${SPACE_IDENTITY_COLORS.car}1A`,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Ionicons
                  name={action.icon as any}
                  size={16}
                  color={SPACE_IDENTITY_COLORS.car!}
                />
              </View>

              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: "600",
                  color: colors.onSurface,
                  flexGrow: isAlone ? 0 : 1,
                }}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
