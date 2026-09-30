import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { severityColor, severityTint } from "@/lib/statusColors";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";

import type { HomeData } from "./home.data.types";
import type { HomeSupplyEntry } from "@/lib/spaces/home/home.types";
import { getSupplyRestockEstimate } from "@/lib/spaces/home/calculations/dashboard.calculations";

export type HomeSuppliesPageProps = {
  homeData: HomeData;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (entry: HomeSupplyEntry) => void;
  /** "Restocked" tap -- logs a new restock event (appends today to
   * restockHistory) without opening the edit form. */
  onRestock: (entry: HomeSupplyEntry) => void;
};

function statusFor(entry: HomeSupplyEntry, colors: ThemeColors) {
  const estimate = getSupplyRestockEstimate(entry);

  if (!estimate) {
    const historyCount = (entry.restockHistory ?? []).length;
    return {
      label: historyCount === 0 ? "Fără istoric încă" : "Mai e nevoie de o achiziție ca să pornească estimarea",
      color: colors.onSurfaceTertiary,
      bg: "transparent",
    };
  }

  const daysLeft = Math.round(estimate.predictedDaysUntilEmpty - estimate.daysSinceLastRestock);

  if (estimate.isLow) {
    return { label: "Probabil pe terminate", color: severityColor("critical", colors), bg: severityTint("critical", colors) };
  }
  if (daysLeft <= 3) {
    return { label: `~${Math.max(daysLeft, 0)} zile rămase`, color: severityColor("warning", colors), bg: severityTint("warning", colors) };
  }
  return { label: `~${daysLeft} zile rămase`, color: severityColor("safe", colors), bg: "transparent" };
}

/** The tracked-supplies list (upgraded from the old generic name+quantity
 * form) -- each restock logged here feeds getSupplyRestockEstimate,
 * which Grocery's shopping list reads cross-space to suggest supplies
 * that are probably running low while the user is actively shopping. */
export function HomeSuppliesPage({ homeData, onBack, onAdd, onEdit, onRestock }: HomeSuppliesPageProps) {
  const { colors, spacing, radius } = useTheme();

  const entries = homeData.supplyEntries;

  return (
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 100 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl }}>
          <Pressable
            onPress={onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
          </Pressable>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: radius.md,
              backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="basket-outline" size={16} color={SPACE_IDENTITY_COLORS.home} />
          </View>
          <Text style={{ fontSize: 26, fontWeight: "800", letterSpacing: -0.4, color: colors.onSurface }}>Supplies</Text>
        </View>

        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add supply"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 46,
            borderRadius: radius.md,
            backgroundColor: colors.onSurface,
            marginBottom: spacing.xl,
          }}
        >
          <Ionicons name="add" size={15} color={colors.surface} />
          <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.surface }}>Add Supply</Text>
        </Pressable>

        {entries.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {entries.map((entry) => {
              const status = statusFor(entry, colors);
              return (
                <View
                  key={entry.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    padding: spacing.md,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surfaceSecondary,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Pressable onPress={() => onEdit(entry)} style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14.5, fontWeight: "700", color: colors.onSurface }} numberOfLines={1}>
                      {entry.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 }} numberOfLines={1}>
                      {entry.category} · {entry.quantity} {entry.unit}
                    </Text>
                    <Text style={{ fontSize: 11.5, fontWeight: "700", color: status.color, marginTop: 4 }}>
                      {status.label}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => onRestock(entry)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${entry.name} as restocked`}
                    style={{
                      paddingHorizontal: spacing.md,
                      height: 38,
                      borderRadius: radius.pill,
                      backgroundColor: status.bg !== "transparent" ? status.bg : colors.surfaceTertiary,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Ionicons name="refresh-outline" size={14} color={colors.onSurface} />
                    <Text style={{ fontSize: 11.5, fontWeight: "700", color: colors.onSurface }}>Restocked</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
            {/* Same identity glyph as HomeSupplyForm's own header chip
                (already tinted) -- was left neutral here. */}
            <Ionicons name="basket-outline" size={26} color={SPACE_IDENTITY_COLORS.home} />
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Nimic urmărit încă.</Text>
          </View>
        )}
      </ScrollView>
    </SwipeBackView>
  );
}
