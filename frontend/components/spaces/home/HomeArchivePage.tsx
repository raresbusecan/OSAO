import React, { useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { TopBar, Identity, Segmented, Group, Row, IconWell, EmptyState } from "@/components/ui/primitives";
import { lei, roCount, roDate } from "@/lib/format";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";

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
  { key: "all", label: "Toate", icon: "time-outline" },
  { key: "task", label: "Task-uri", icon: "checkmark-circle-outline" },
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
  if (days > 1 && days < 7) return `Rezolvat acum ${roCount(days, "zi", "zile")}`;

  return `Rezolvat pe ${roDate(date)}`;
}

/**
 * One History page for the whole Home space, not one per category --
 * matches Car's own Docs/Archive/History pattern (a single,
 * always-visible entry point on that space's main dashboard, not
 * buried inside individual category forms), per explicit user request
 * for cross-space consistency. "History" rather than "Archive" since
 * this is a time-based record of resolved entries, not (like Car's own
 * Archive) documents superseded by a renewal. Combines what used to be
 * two separate pages (HomeTaskArchivePage, HomeMaintenanceArchivePage
 * -- both still exist as files but are no longer reachable from
 * anywhere, see BACKLOG.md) into one tabbed list, reusing their exact
 * same calculation functions rather than re-deriving the data.
 */
export function HomeArchivePage({ homeData, onBack }: HomeArchivePageProps) {
  const { colors, spacing, radius, isDark } = useTheme();
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

  const HOME = SPACE_IDENTITY_COLORS.home!;
  const tint = spaceTextColor("home", isDark) ?? HOME;

  return (
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 100, gap: spacing.section }}
      >
        <TopBar onBack={onBack} />
        <Identity color={HOME} kicker="Casă" title="Istoric" subtitle="Tot ce ai rezolvat, cel mai recent primul." />

        {spentThisMonth > 0 ? (
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: 2 }}>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Cheltuit din rezolvate, luna asta</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text style={{ fontSize: 28, fontWeight: "600", letterSpacing: -0.6, color: colors.onSurface }}>
                {spentThisMonth.toLocaleString("ro-RO")}
              </Text>
              <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>lei</Text>
            </View>
          </View>
        ) : null}

        <Segmented options={TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={setTab} testIDPrefix="home-history-tab" />

        {visibleRows.length > 0 ? (
          <Group inset={68}>
            {visibleRows.map((row) => (
              <Row
                key={`${row.kind}-${row.id}`}
                leading={<IconWell icon={row.kind === "task" ? "checkmark-circle-outline" : "construct-outline"} color={HOME} tint={tint} />}
                title={row.title}
                subtitle={row.completedAt ? formatResolvedAt(row.completedAt) : null}
                trailing={row.price ? <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(row.price)}</Text> : null}
              />
            ))}
          </Group>
        ) : (
          <EmptyState icon="time-outline" message="Nimic rezolvat încă." />
        )}
      </ScrollView>
    </SwipeBackView>
  );
}
