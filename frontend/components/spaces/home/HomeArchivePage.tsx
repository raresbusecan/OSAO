import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";

import type { HomeData } from "./home.data.types";
import {
  getHomeTaskArchive,
  getHomeMaintenanceArchive,
} from "@/lib/spaces/home/calculations/dashboard.calculations";

export type HomeArchivePageProps = {
  homeData: HomeData;
  onBack: () => void;
};

type ArchiveKind = "task" | "maintenance";

type ArchiveRowData = {
  id: string;
  kind: ArchiveKind;
  title: string;
  completedAt?: string;
  price?: number;
};

const TABS: { key: ArchiveKind | "all"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "all", label: "Toate", icon: "archive-outline" },
  { key: "task", label: "Tasks", icon: "checkmark-circle-outline" },
  { key: "maintenance", label: "Mentenanță", icon: "construct-outline" },
];

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

/**
 * One archive for the whole Home space, not one per category --
 * matches Car's own Archive/History pattern (a single, always-visible
 * entry point on that space's main dashboard, not buried inside
 * individual category forms), per explicit user request for
 * cross-space consistency. Combines what used to be two separate pages
 * (HomeTaskArchivePage, HomeMaintenanceArchivePage -- both still exist
 * as files but are no longer reachable from anywhere, see BACKLOG.md)
 * into one tabbed list, reusing their exact same calculation functions
 * rather than re-deriving the data.
 */
export function HomeArchivePage({ homeData, onBack }: HomeArchivePageProps) {
  const { colors, spacing, radius } = useTheme();
  const [tab, setTab] = useState<ArchiveKind | "all">("all");

  const { rows, spentThisMonth } = useMemo(() => {
    const taskArchive = getHomeTaskArchive(homeData);
    const maintenanceArchive = getHomeMaintenanceArchive(homeData);

    const combined: ArchiveRowData[] = [
      ...taskArchive.rows.map((r) => ({ id: r.id, kind: "task" as const, title: r.title, completedAt: r.completedAt, price: r.isPurchase ? r.price : undefined })),
      ...maintenanceArchive.rows.map((r) => ({ id: r.id, kind: "maintenance" as const, title: r.title, completedAt: r.completedAt, price: r.price })),
    ].sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());

    return { rows: combined, spentThisMonth: taskArchive.spentThisMonth + maintenanceArchive.spentThisMonth };
  }, [homeData]);

  const visibleRows = tab === "all" ? rows : rows.filter((r) => r.kind === tab);

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
              marginBottom: spacing.lg,
            }}
          >
            <View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.5 }}>
                CHELTUIT DIN REZOLVATE · LUNA ASTA
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
              <Ionicons name="archive-outline" size={19} color={colors.onSurface} />
            </View>
          </View>
        ) : null}

        {/* Category tabs -- same split-pill idea as Car's own History
            page, scoped to Home's own 2 archivable categories. */}
        <View
          style={{
            flexDirection: "row",
            marginBottom: spacing.xl,
            borderRadius: radius.pill,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
            alignSelf: "flex-start",
          }}
        >
          {TABS.map((t, index) => {
            const isActive = tab === t.key;
            return (
              <React.Fragment key={t.key}>
                {index > 0 ? <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border }} /> : null}
                <Pressable
                  testID={`home-archive-tab-${t.key}`}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingVertical: 7,
                    paddingHorizontal: spacing.md,
                    backgroundColor: isActive ? colors.onSurface : "transparent",
                  }}
                >
                  <Ionicons name={t.icon} size={12} color={isActive ? colors.surface : colors.onSurfaceTertiary} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: isActive ? colors.surface : colors.onSurface }}>
                    {t.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>

        {visibleRows.length > 0 ? (
          <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
            {visibleRows.map((row, index) => (
              <ArchiveRow key={`${row.kind}-${row.id}`} row={row} colors={colors} spacing={spacing} radius={radius} last={index === visibleRows.length - 1} />
            ))}
          </View>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
            <Ionicons name="archive-outline" size={26} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Nimic rezolvat încă.</Text>
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
  row: ArchiveRowData;
  colors: any;
  spacing: any;
  radius: any;
  last: boolean;
}) {
  const kindIcon = row.kind === "task" ? "checkmark-circle-outline" : "construct-outline";

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
          backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Ionicons name={kindIcon} size={16} color={SPACE_IDENTITY_COLORS.home} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginTop: 2 }}>
          {row.completedAt ? formatResolvedAt(row.completedAt) : ""}
        </Text>
      </View>

      {row.price ? (
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
