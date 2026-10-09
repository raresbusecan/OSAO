import React, { useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { PressableScale } from "@/components/ui/PressableScale";
import { Group, IconWell, Row, SectionHeader, Segmented } from "@/components/ui/primitives";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { lei, roCount } from "@/lib/format";
import type { HomeDueKind, HomeDueRow } from "@/lib/spaces/home/calculations/dashboard.calculations";
import { RECORD_KIND, dueText } from "./homeRecordPreview";
import { LinkedCreditsLine } from "@/components/spaces/LinkedCreditsLine";

/**
 * The Casă dashboard (2026-10, design-lead spec v2):
 *  - HomeOverviewCard: the two sums only -- spent this month (opens the
 *    spend page, where Cheltuieli live), bills per month -- split by a line.
 *  - HomeDueSection: "De rezolvat" with exactly Mașină's tab row
 *    (Segmented): Sarcini (default) / Facturi / Mentenanță, each with a
 *    small urgency count (red = overdue, amber = today); inside a tab the
 *    tab's 5 most urgent rows, grouped like Mașină's EntryGroup -- Restante /
 *    Azi / Următoarele 7 zile -- then "Toate sarcinile (N)" etc. unfolding
 *    every open record of the kind in place. Tap a row = preview, long press = actions, swipes as
 *    everywhere. (No Categorii section: Documente / Provizii are header
 *    pills, Cheltuieli open from the top card.)
 */

type IconName = keyof typeof Ionicons.glyphMap;

/* ---------------- Overview ---------------- */

export function HomeOverviewCard({
  spent,
  monthlyBills,
  onSpendPress,
  onBillsPress,
  spaceId,
}: {
  spent: number;
  monthlyBills: number;
  onSpendPress: () => void;
  onBillsPress: () => void;
  /** This Casă space -- shows the credits linked to it under the card. */
  spaceId?: string;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const stat = (label: string, value: number, onPress: () => void, testID: string, align: "flex-start" | "flex-end") => (
    <PressableScale testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${lei(Math.round(value))}`} style={{ gap: 2, alignItems: align }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        <Text style={{ fontSize: 13, color: muted }}>{label}</Text>
        <Ionicons name="chevron-forward" size={12} color={muted} />
      </View>
      <Text style={{ ...typography.title, color: colors.onSurface }}>
        {Math.round(value).toLocaleString("ro-RO")} <Text style={{ fontSize: 14, fontWeight: "400", color: muted }}>lei</Text>
      </Text>
    </PressableScale>
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {stat("Cheltuit luna asta", spent, onSpendPress, "home-stat-spend", "flex-start")}
        <View style={{ width: 1, alignSelf: "stretch", backgroundColor: colors.borderStrong }} />
        {stat("Facturi pe lună", monthlyBills, onBillsPress, "home-stat-bills", "flex-end")}
      </View>
      {spaceId ? <LinkedCreditsLine spaceId={spaceId} /> : null}
    </View>
  );
}

/* ---------------- De rezolvat ---------------- */

/** The three kinds "De rezolvat" shows (user, 2026-10-05): exactly Mașină's
 * tab row -- Documente and Provizii are pills under Istoric instead,
 * carrying their red counts. */
export type DueTabKind = "task" | "recurring" | "maintenance";

export const DUE_TABS: { kind: DueTabKind; label: string; empty: string; all: string }[] = [
  { kind: "task", label: "Sarcini", empty: "Nicio sarcină de făcut în următoarele 7 zile.", all: "Toate sarcinile" },
  { kind: "recurring", label: "Facturi", empty: "Nicio factură de plătit în următoarele 7 zile.", all: "Toate facturile" },
  { kind: "maintenance", label: "Mentenanță", empty: "Nicio lucrare programată în următoarele 7 zile.", all: "Toată mentenanța" },
];

const KIND_ICON: Record<HomeDueKind, IconName> = {
  task: RECORD_KIND.task.icon,
  recurring: RECORD_KIND.recurring.icon,
  maintenance: RECORD_KIND.maintenance.icon,
  document: RECORD_KIND.document.icon,
  supply: RECORD_KIND.supply.icon,
};

const PREVIEW = 5;

/** One sub-group inside a tab -- the same shape as Mașină's EntryGroup:
 * a muted heading, then the rows on one card. */
function DueGroup({
  title,
  rows,
  onRowPress,
  onRowLongPress,
  onResolve,
  onDelete,
}: {
  title: string;
  rows: HomeDueRow[];
  onRowPress: (row: HomeDueRow) => void;
  onRowLongPress: (row: HomeDueRow) => void;
  onResolve: (row: HomeDueRow) => void;
  onDelete: (row: HomeDueRow) => void;
}) {
  const { colors, spacing, isDark } = useTheme();
  const fill = SPACE_IDENTITY_COLORS.home!;
  const tint = spaceTextColor("home", isDark) ?? fill;
  return (
    <View style={{ gap: spacing.xs }}>
      <SectionHeader title={title} muted />
      <Group inset={68}>
        {rows.map((row) => {
          const timing = (row as { noDate?: boolean }).noDate ? { text: "Fără dată", tone: "muted" as const } : dueText(row.daysRemaining);
          const timingColor = timing.tone === "error" ? colors.error : timing.tone === "warning" ? colors.warning : colors.onSurfaceTertiary;
          return (
            <SwipeRow
              key={`${row.kind}-${row.id}`}
              onResolve={() => onResolve(row)}
              onDelete={() => onDelete(row)}
              cornerRadius={0}
              colors={colors}
            >
              <Row
                testID={`home-due-${row.kind}-${row.id}`}
                onPress={() => onRowPress(row)}
                onLongPress={() => onRowLongPress(row)}
                leading={<IconWell icon={KIND_ICON[row.kind]} color={fill} tint={tint} />}
                title={row.title}
                subtitle={
                  <Text style={{ color: timingColor, fontWeight: timing.tone === "warning" ? "500" : "400" }}>
                    {timing.tone === "error" ? <Ionicons name="alert-circle" size={12} color={colors.error} /> : null}
                    {timing.tone === "error" ? " " : ""}
                    {timing.text}
                  </Text>
                }
                trailing={row.amount ? <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurfaceSecondary }}>{lei(row.amount)}</Text> : null}
              />
            </SwipeRow>
          );
        })}
      </Group>
    </View>
  );
}

export function HomeDueSection({
  rows,
  tab,
  onTabChange,
  allRows,
  onRowPress,
  onRowLongPress,
  onResolve,
  onDelete,
}: {
  /** Only task / recurring / maintenance rows are shown. */
  rows: HomeDueRow[];
  tab: DueTabKind;
  onTabChange: (k: DueTabKind) => void;
  /** Every open record of each kind, whatever its state -- what "Toate
   * sarcinile (N)" unfolds to, in place (getHomeKindRows). */
  allRows: Record<DueTabKind, (HomeDueRow & { noDate?: boolean })[]>;
  onRowPress: (row: HomeDueRow) => void;
  onRowLongPress: (row: HomeDueRow) => void;
  onResolve: (row: HomeDueRow) => void;
  onDelete: (row: HomeDueRow) => void;
}) {
  const { colors, spacing } = useTheme();
  // "Toate ..." unfolds the tab in place (user, 2026-10-05) -- folded again
  // whenever another tab is picked.
  const [expandedTab, setExpandedTab] = useState<DueTabKind | null>(null);
  const expanded = expandedTab === tab;
  const inTabs = rows.filter((r) => r.kind === "task" || r.kind === "recurring" || r.kind === "maintenance");
  // Folded: the tab's 5 most urgent (rows come sorted most overdue first).
  // Unfolded: every open record of the kind, whatever its state.
  const foldedRows = inTabs.filter((r) => r.kind === tab).slice(0, PREVIEW);
  const shownRows = expanded ? allRows[tab] : foldedRows;
  // What unfolding adds: every record of the kind that the folded view
  // doesn't already show (matched by id, so the number is exact even when
  // a record is both urgent and in the full list).
  const foldedIds = new Set(foldedRows.map((r) => r.id));
  const hiddenCount = allRows[tab].filter((r) => !foldedIds.has(r.id)).length;
  const tabMeta = DUE_TABS.find((t) => t.kind === tab)!;
  const groupProps = { onRowPress, onRowLongPress, onResolve, onDelete };
  const isNoDate = (r: HomeDueRow) => !!(r as { noDate?: boolean }).noDate;
  const groups: { key: string; title: string; rows: HomeDueRow[] }[] = [
    { key: "late", title: "Restante", rows: shownRows.filter((r) => r.daysRemaining < 0) },
    { key: "today", title: "Azi", rows: shownRows.filter((r) => r.daysRemaining === 0) },
    { key: "soon", title: "Următoarele 7 zile", rows: shownRows.filter((r) => r.daysRemaining > 0 && r.daysRemaining <= 7) },
    { key: "later", title: "Mai târziu", rows: shownRows.filter((r) => r.daysRemaining > 7 && !isNoDate(r)) },
    { key: "nodate", title: "Fără dată", rows: shownRows.filter(isNoDate) },
  ].filter((g) => g.rows.length > 0);

  return (
    <View style={{ gap: spacing.md }} testID="home-due-section">
      <SectionHeader title="De rezolvat" info="home.scadente" />
      {/* Exactly Mașină's tab row (Segmented), plus a small count per tab:
          red = overdue, amber = today. */}
      <Segmented<DueTabKind>
        testIDPrefix="home-due-tab"
        options={DUE_TABS.map((t) => {
          const ofKind = inTabs.filter((r) => r.kind === t.kind);
          const lateN = ofKind.filter((r) => r.daysRemaining < 0).length;
          const todayN = ofKind.filter((r) => r.daysRemaining === 0).length;
          return {
            key: t.kind,
            label: t.label,
            badge: lateN > 0 ? { count: lateN, tone: "error" as const } : todayN > 0 ? { count: todayN, tone: "warning" as const } : undefined,
            a11yLabel: lateN > 0 ? `${t.label}, ${roCount(lateN, "restantă", "restante")}` : todayN > 0 ? `${t.label}, ${todayN} azi` : t.label,
          };
        })}
        value={tab}
        onChange={(k) => {
          setExpandedTab(null);
          onTabChange(k);
        }}
      />
      {shownRows.length === 0 ? (
        <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
          <Text style={{ flexShrink: 1, fontSize: 14, color: colors.onSurfaceSecondary }}>{tabMeta.empty}</Text>
        </View>
      ) : (
        <>
          {groups.map((g) => (
            <DueGroup key={`${tab}-${g.key}`} title={g.title} rows={g.rows} {...groupProps} />
          ))}
        </>
      )}
      {hiddenCount > 0 || expanded ? (
        <PressableScale
          testID={`home-due-all-${tab}`}
          onPress={() => setExpandedTab(expanded ? null : tab)}
          scaleTo={1}
          pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? "Arată mai puțin" : `${tabMeta.all}, încă ${hiddenCount} ascunse`}
          style={{ minHeight: 52, borderRadius: 16, paddingHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
        >
          <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{expanded ? "Arată mai puțin" : tabMeta.all}</Text>
          {!expanded ? <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>+{hiddenCount}</Text> : null}
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.onSurfaceTertiary} />
        </PressableScale>
      ) : null}
    </View>
  );
}
