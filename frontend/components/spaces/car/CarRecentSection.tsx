import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { CarRecentItem } from "./utils/carEntries.types";

export type CarRecentSectionProps = {
    items: CarRecentItem[];
};

export function CarRecentSection({
    items,
}: CarRecentSectionProps) {
    const { colors, spacing, radius, typography } = useTheme();

    if (!items.length) {
        return null;
    }

    return (
        <View style={{ marginBottom: spacing.xl }}>
            <Text style={{ ...typography.label, color: colors.onSurfaceTertiary, marginBottom: 10 }}>
                RECENT
            </Text>

            <View
                style={{
                    backgroundColor: colors.surfaceSecondary,
                    borderRadius: radius.lg,
                    overflow: "hidden",
                }}
            >
                {items.map((item, index) => (
                    <RecentRow
                        key={item.id}
                        icon={item.icon}
                        title={item.title}
                        subtitle={item.subtitle}
                        amount={item.amount ?? ""}
                        colors={colors}
                        spacing={spacing}
                        typography={typography}
                        last={index === items.length - 1}
                    />
                ))}
            </View>
        </View>
    );
}

function RecentRow({
    icon,
    title,
    subtitle,
    amount,
    colors,
    spacing,
    typography,
    last = false,
}: {
    icon: string;
    title: string;
    subtitle: string;
    amount: string;
    colors: any;
    spacing: any;
    typography: any;
    last?: boolean;
}) {
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                gap: spacing.md,
                borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
            }}
        >
            <Ionicons
                name={icon as any}
                size={20}
                color={colors.onSurfaceTertiary}
            />

            <View style={{ flex: 1 }}>
                <Text style={{ ...typography.body, color: colors.onSurface }}>
                    {title}
                </Text>

                <Text style={{ ...typography.caption, marginTop: 2, color: colors.onSurfaceTertiary }}>
                    {subtitle}
                </Text>
            </View>

            <Text style={{ ...typography.body, color: colors.onSurface }}>
                {amount}
            </Text>
        </View>
    );
}