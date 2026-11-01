import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { motion } from "@/lib/motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { openUpgradeSheet } from "@/lib/simpleSheets";

/** Off (user decision 2026-10-13): no screen shows a suggestion for a
 * Complet feature for now. Flip back to true to bring every teaser back --
 * the calls are still in place. */
export const SHOW_TEASERS = false;

/**
 * The ONE "Complet" teaser a Simplu screen may show (mockups "orgOS
 * Simplu"): subtle, next to data the user already has, never a lock icon,
 * never a pop-up. Both open the upgrade sheet (components/simple/
 * UpgradeSheet.tsx) unless `onPress` says otherwise.
 *
 *  - TeaserCard: the dashed card (Mașină "Consum și cost pe km",
 *    Calendar "Cât de plină e fiecare lună"). `leading` replaces the
 *    sparkle well (Calendar's 3 mini bubbles).
 *  - TeaserRow: the quiet filled row with a "Complet" pill, inside a card
 *    (Acasă's "Cât îți rămâne din venit...").
 */
export function TeaserCard({
  title,
  subtitle,
  leading,
  onPress = openUpgradeSheet,
  testID,
}: {
  title: string;
  subtitle: string;
  leading?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, spacing, radius } = useTheme();
  if (!SHOW_TEASERS) return null;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={motion.scale.card}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingVertical: 14,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: colors.borderStrong,
      }}
    >
      {leading ?? (
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="sparkles-outline" size={18} color={colors.onSurfaceSecondary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{title}</Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
    </PressableScale>
  );
}

export function TeaserRow({ text, onPress = openUpgradeSheet, testID }: { text: string; onPress?: () => void; testID?: string }) {
  const { radius, colors, spacing } = useTheme();
  if (!SHOW_TEASERS) return null;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={motion.scale.control}
      accessibilityRole="button"
      accessibilityLabel={`${text} Disponibil în Complet.`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 44,
        paddingVertical: 10,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceTertiary,
      }}
    >
      <Ionicons name="sparkles-outline" size={18} color={colors.onSurfaceSecondary} />
      <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 18, color: colors.onSurfaceSecondary }}>{text}</Text>
      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onSurface }}>Complet</Text>
      </View>
    </PressableScale>
  );
}
