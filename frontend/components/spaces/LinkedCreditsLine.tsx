import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useBudgetPlan } from "@/lib/budget/plan";
import { lei, roCount } from "@/lib/format";

/**
 * One quiet line under a Car / Casă top card naming the active credits
 * linked to this space (an expense_credit's metadata.linked_space_id --
 * a label only, a credit never counts in the space's spend). Read from
 * GET /budget's credit.items via useBudgetPlan(); renders nothing when
 * there are none. Not tappable.
 *  - one:      "Leasing · 1.200 lei pe lună, pe 15"
 *  - several:  "2 credite · 1.700 lei pe lună"
 */
export function LinkedCreditsLine({ spaceId }: { spaceId: string }) {
  const { spacing, colors } = useTheme();
  const summary = useBudgetPlan();
  const credits = (summary?.credit.items ?? []).filter(
    (c) => c.linked_space_id != null && String(c.linked_space_id) === String(spaceId),
  );
  if (credits.length === 0) return null;

  const total = credits.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const label =
    credits.length === 1
      ? `${credits[0].title || "Credit"} · ${lei(total)} pe lună, pe ${credits[0].day_of_month}`
      : `${roCount(credits.length, "credit", "credite")} · ${lei(total)} pe lună`;

  return (
    <View
      testID="linked-credits-line"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.xs }}
    >
      <Ionicons name="card-outline" size={14} color={colors.onSurfaceTertiary} />
      <Text style={{ flex: 1, fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
