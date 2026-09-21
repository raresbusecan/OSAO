import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

import type { HomeData } from "./home.data.types";
import { getHomeTaskArchive, type HomeTaskRow } from "@/lib/spaces/home/calculations/dashboard.calculations";

export type HomeTaskArchivePageProps = {
  homeData: HomeData;
  onBack: () => void;
};

function formatResolvedAt(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (isToday) return "Rezolvat azi";

  const days = Math.round((now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
  if (days === 1) return "Rezolvat ieri";
  if (days > 1) return `Rezolvat acum ${days} zile`;

  return `Rezolvat pe ${date.toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}`;
}

export function HomeTaskArchivePage({ homeData, onBack }: HomeTaskArchivePageProps) {
  const { colors, spacing, radius } = useTheme();

  const { rows, spentThisMonth } = getHomeTaskArchive(homeData);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
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
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
          </Pressable>
          <Text style={{ fontSize: 26, fontWeight: "800", letterSpacing: -0.4, color: colors.onSurface }}>
            Archive
          </Text>
        </View>

        {spentThisMonth > 0 ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: spacing.lg,
              borderRadius: radius.sm,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: spacing.xl,
            }}
          >
            <View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.5 }}>
                CHELTUIT DIN TASK-URI · LUNA ASTA
              </Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface }}>
                  {spentThisMonth.toLocaleString("en-US")}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>RON</Text>
              </View>
            </View>
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
              <Ionicons name="cart-outline" size={19} color={colors.onSurface} />
            </View>
          </View>
        ) : null}

        {rows.length > 0 ? (
          <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
            {rows.map((row, index) => (
              <ArchiveRow key={row.id} row={row} colors={colors} spacing={spacing} radius={radius} last={index === rows.length - 1} />
            ))}
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
            <Ionicons name="archive-outline" size={26} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Niciun task rezolvat încă.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ArchiveRow({
  row,
  colors,
  spacing,
  radius,
  last,
}: {
  row: HomeTaskRow;
  colors: any;
  spacing: any;
  radius: any;
  last: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceTertiary,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Ionicons name="checkmark" size={16} color={colors.success} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginTop: 2 }}>
          {row.completedAt ? formatResolvedAt(row.completedAt) : ""}
        </Text>
      </View>

      {row.isPurchase && row.price ? (
        <Text
          style={{
            fontSize: 13,
            fontWeight: "800",
            color: colors.onSurface,
            backgroundColor: colors.surfaceTertiary,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: radius.pill,
          }}
        >
          {row.price.toLocaleString("en-US")} RON
        </Text>
      ) : null}
    </View>
  );
}
