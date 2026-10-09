import React from "react";
import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { severityColor, severityTint } from "@/lib/statusColors";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { PressableScale } from "@/components/ui/PressableScale";
import { TopBar, CircleButton, Identity, EmptyState } from "@/components/ui/primitives";
import { motion } from "@/lib/motion";
import { roUnit } from "@/lib/format";

import type { HomeData } from "./home.data.types";
import type { HomeSupplyEntry } from "@/lib/spaces/home/home.types";
import { supplyStatus } from "@/lib/spaces/home/calculations/dashboard.calculations";

export type HomeSuppliesPageProps = {
  homeData: HomeData;
  onBack: () => void;
  onAdd: () => void;
  /** Tap on a row: the record preview (HomeRecordSheet). */
  onPreview: (entry: HomeSupplyEntry) => void;
  /** Long press on a row: the record's action sheet. */
  onActions: (entry: HomeSupplyEntry) => void;
  /** "Restocked" tap -- logs a new restock event (appends today to
   * restockHistory) without opening the edit form. */
  onRestock: (entry: HomeSupplyEntry) => void;
  /** Row's own swipe-to-delete -- caller is expected to confirm before
   * actually deleting (see HomeDashboard's handleSupplyRowDelete). */
  onDelete: (entry: HomeSupplyEntry) => void;
};

/** The shared estimate words (supplyStatus -- the same ones "De rezolvat"
 * shows) in this page's colors. */
function statusFor(entry: HomeSupplyEntry, colors: ThemeColors) {
  const st = supplyStatus(entry);
  if (st.daysLeft === null) return { label: st.label, color: colors.onSurfaceTertiary, bg: "transparent" };
  if (st.tone === "error") return { label: st.label, color: severityColor("critical", colors), bg: severityTint("critical", colors) };
  if (st.tone === "warning") return { label: st.label, color: severityColor("warning", colors), bg: severityTint("warning", colors) };
  return { label: st.label, color: severityColor("safe", colors), bg: "transparent" };
}

/** The tracked-supplies list (upgraded from the old generic name+quantity
 * form) -- each restock logged here feeds getSupplyRestockEstimate,
 * which Grocery's shopping list reads cross-space to suggest supplies
 * that are probably running low while the user is actively shopping. */
export function HomeSuppliesPage({ homeData, onBack, onAdd, onPreview, onActions, onRestock, onDelete }: HomeSuppliesPageProps) {
  const { colors, spacing, radius } = useTheme();
  const entries = homeData.supplyEntries;
  const HOME = SPACE_IDENTITY_COLORS.home!;

  return (
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 100, gap: spacing.section }}
      >
        <TopBar onBack={onBack}>
          <CircleButton testID="home-supply-add" icon="add" label="Adaugă o provizie" tone={HOME} onPress={onAdd} />
        </TopBar>

        <Identity color={HOME} kicker="Casă" title="Provizii" subtitle="Estimăm când se termină, din ritmul în care le cumperi." info="home.supplies" />

        {entries.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card, overflow: "hidden" }}>
              {entries.map((entry, index) => {
                const status = statusFor(entry, colors);
                return (
                  <View key={entry.id}>
                    {index > 0 ? <View style={{ height: 1, marginLeft: spacing.lg, backgroundColor: colors.border }} /> : null}
                    <SwipeRow onResolve={() => onRestock(entry)} onDelete={() => onDelete(entry)} cornerRadius={0} colors={colors}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.md, minHeight: 64, backgroundColor: colors.surfaceSecondary }}>
                        <PressableScale onPress={() => onPreview(entry)} onLongPress={() => onActions(entry)} delayLongPress={350} scaleTo={1} accessibilityRole="button" accessibilityLabel={entry.name} style={{ flex: 1, paddingVertical: spacing.sm + 2 }}>
                          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{entry.name}</Text>
                          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 }} numberOfLines={1}>
                            {entry.quantity} {roUnit(entry.unit)}, <Text style={{ fontWeight: "500", color: status.color }}>{status.label}</Text>
                          </Text>
                        </PressableScale>
                        <PressableScale
                          onPress={() => onRestock(entry)}
                          scaleTo={motion.scale.control}
                          accessibilityRole="button"
                          accessibilityLabel={`Am cumpărat ${entry.name}`}
                          hitSlop={{ top: 2, bottom: 2 }}
                          style={{
                            paddingHorizontal: spacing.md,
                            height: 40,
                            borderRadius: radius.pill,
                            backgroundColor: status.bg !== "transparent" ? status.bg : colors.surfaceTertiary,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Ionicons name="refresh-outline" size={14} color={colors.onSurface} />
                          <Text style={{ fontSize: 13, fontWeight: "500", color: colors.onSurface }}>Am cumpărat</Text>
                        </PressableScale>
                      </View>
                    </SwipeRow>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <EmptyState icon="basket-outline" title="Nimic urmărit încă" message="Adaugă ce cumperi des (hârtie, detergent...) și îți spunem când e momentul să iei din nou." />
        )}
      </ScrollView>
    </SwipeBackView>
  );
}
