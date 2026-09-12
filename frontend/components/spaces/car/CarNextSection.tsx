import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type CarNextItem = {
  id: string | number;
  icon: string;
  title: string;
  subtitle: string;
  right: string;
};

export type CarNextSectionProps = {
  items: CarNextItem[];
};

export function CarNextSection({
  items,
}: CarNextSectionProps) {
  const { colors, spacing, radius } = useTheme();

  if (!items.length) {
    return null;
  }

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <SectionTitle title="NEXT" colors={colors} />

      <View style={{ gap: spacing.sm }}>
        {items.map((item) => (
          <InfoRow
            key={item.id}
            icon={item.icon}
            title={item.title}
            subtitle={item.subtitle}
            right={item.right}
            colors={colors}
            radius={radius}
            spacing={spacing}
          />
        ))}
      </View>
    </View>
  );
}

function SectionTitle({
  title,
  colors,
}: {
  title: string;
  colors: any;
}) {
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 1,
        color: colors.onSurfaceTertiary,
        marginBottom: 10,
      }}
    >
      {title}
    </Text>
  );
}

function InfoRow({
  icon,
  title,
  subtitle,
  right,
  colors,
  radius,
  spacing,
}: {
  icon: string;
  title: string;
  subtitle: string;
  right: string;
  colors: any;
  radius: any;
  spacing: any;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSecondary,
        borderRadius: radius.lg,
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
          backgroundColor: colors.surfaceTertiary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={icon as any}
          size={20}
          color={colors.onSurface}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: colors.onSurface,
          }}
        >
          {title}
        </Text>

        <Text
          style={{
            marginTop: 3,
            fontSize: 12,
            color: colors.onSurfaceTertiary,
          }}
        >
          {subtitle}
        </Text>
      </View>

      <Text
        style={{
          fontSize: 12,
          fontWeight: "700",
          color: colors.onSurfaceTertiary,
        }}
      >
        {right}
      </Text>
    </View>
  );
}