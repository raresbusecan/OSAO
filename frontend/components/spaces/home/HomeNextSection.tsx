import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import type { HomeNextItem } from "./home.ui.types";

export type HomeNextSectionProps = {
  items: HomeNextItem[];
};

export function HomeNextSection({ items }: HomeNextSectionProps) {
  const { colors, spacing, radius } = useTheme();

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 1,
          color: colors.onSurfaceTertiary,
          marginBottom: 10,
        }}
      >
        NEXT
      </Text>

      <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        {items.map((item) => (
          <View
            key={item.id}
            style={{
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.sm,
              padding: spacing.lg,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: radius.md,
                // Tinted with Home's identity color, same recipe as
                // Home's "CATEGORII" tile chips and Car's own DUE
                // SOON/Quick Actions -- this icon's job is "this is a
                // Documents/Maintenance/Recurring/... entry," the same
                // identity signal those already carry.
                backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={item.icon} size={20} color={SPACE_IDENTITY_COLORS.home} />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: colors.onSurface,
                }}
              >
                {item.title}
              </Text>

              <Text
                style={{
                  marginTop: 3,
                  fontSize: 12,
                  color: colors.onSurfaceTertiary,
                }}
              >
                {item.subtitle}
              </Text>
            </View>

            {item.right ? (
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: colors.onSurfaceTertiary,
                }}
              >
                {item.right}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </>
  );
}
