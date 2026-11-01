import React from "react";
import { View, Text } from "react-native";
import { PressableScale } from "@/components/ui/PressableScale";
import { IconWell } from "@/components/ui/primitives";
import { GuiltFreeChip } from "@/components/dashboard/GuiltFree";
import { severityColor, urgencyTierColor } from "@/lib/statusColors";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import type { CarRecentItem } from "./utils/carEntries.types";

// Lives on its own (not in CarDashboard) so CarHistoryPage can use it
// without a CarDashboard <-> CarHistoryPage require cycle.

// Same 3 colors as the dashboard's urgency tiers, plus "safe" for the status dot shown
// everywhere a document or maintenance entry appears OUTSIDE of DUE SOON
// (RECENT/ALL, History, Expenses) -- see CarRecentItem.statusDot.
function statusDotColor(status: "safe" | "light" | "medium" | "critical", colors: any) {
    if (status === "safe") return severityColor("safe", colors);
    return urgencyTierColor(status, colors);
}

/* ============================================================
   RECENT ROW
   ============================================================ */

export function RecentRow({
    type,
    icon,
    title,
    subtitle,
    amount,
    statusDot,
    overdue,
    guiltFree,
    colors,
    spacing,
    last,
    onPress,
}: CarRecentItem & {
    colors: any;
    spacing: any;
    last?: boolean;
    onPress?: () => void;
}) {
    const carColors = useSpaceColors("car");
    const tint = carColors.tint;

    return (
        <PressableScale
            onPress={onPress}
            scaleTo={1}
            pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
            accessibilityRole="button"
            accessibilityLabel={`${title}${amount ? `, ${amount}` : ""}`}
            style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                minHeight: 64,
                gap: spacing.md,
                backgroundColor: colors.surfaceSecondary,
                // Callers that stack rows without a Group pass `last` and
                // get a full-width hairline; Group callers omit it.
                borderBottomWidth: last === undefined || last ? 0 : 1,
                borderBottomColor: colors.border,
            }}
        >
            {/* Icon well = which entry type; the small dot on its corner =
                document/maintenance status (see statusDotColor). */}
            <View>
                <IconWell icon={icon} color={carColors.color} tint={tint} />
                {statusDot ? (
                    <View
                        style={{
                            position: "absolute",
                            right: -3,
                            bottom: -3,
                            width: overdue ? 14 : 10,
                            height: overdue ? 14 : 10,
                            borderRadius: 7,
                            backgroundColor: statusDotColor(statusDot, colors),
                            borderWidth: 2,
                            borderColor: colors.surfaceSecondary,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {overdue ? <Text style={{ fontSize: 8, fontWeight: "700", color: colors.surfaceSecondary, lineHeight: 10 }}>!</Text> : null}
                    </View>
                ) : null}
            </View>

            <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{title}</Text>
                    {guiltFree ? <View><GuiltFreeChip /></View> : null}
                </View>
                <Text style={{ marginTop: 2, fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{subtitle}</Text>
            </View>

            {amount ? (
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface, fontVariant: ["tabular-nums"] }}>{amount}</Text>
            ) : null}
        </PressableScale>
    );
}
