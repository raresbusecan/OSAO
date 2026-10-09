import React, { useState } from "react";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { View, ScrollView } from "react-native";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { TopBar, Identity, SectionHeader, Group, Row, IconWell, Chip, EmptyState } from "@/components/ui/primitives";
import { roCount } from "@/lib/format";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";

import type { HomeData } from "./home.data.types";
import {
  getRecurringTaskWarnings,
  recurringWarningTierColor,
  type RecurringWarningRow,
  type RecurringWarningTier,
} from "@/lib/spaces/home/calculations/dashboard.calculations";

// Collapsed to this many rows per tier group until "Show more" is
// tapped -- per explicit user request, Restanțe is now one list PER
// tier (RESTANT/AZI/2 ZILE/4 ZILE) instead of one flat list, each with
// its own show more/less next to its own title.
const COLLAPSED_ROW_COUNT = 3;

const TIER_ORDER: RecurringWarningTier[] = ["red", "orangeToday", "orangeDays", "yellow"];
const TIER_SECTION_TITLE: Record<RecurringWarningTier, string> = {
  red: "Restante",
  orangeToday: "Azi",
  orangeDays: "În 1-2 zile",
  yellow: "În 3-4 zile",
};

// Sections above already group by URGENCY -- this is the other axis
// (which category a row is actually FROM), shown as a small subtitle
// per row per explicit user request ("sa se vada clar care restanta de
// unde vine exact"). The old icon-only signal (repeat vs. alert-circle,
// still shown too) only hinted at "recurring or not", never named the
// actual source category.
const KIND_LABEL: Record<RecurringWarningRow["kind"], string> = {
  task: "Sarcină",
  maintenance: "Mentenanță",
  recurring: "Recurent",
  document: "Document",
};

export type HomeRecurringWarningsPageProps = {
  homeData: HomeData;
  onBack: () => void;
  /** A row tap resolves it -- a task row opens HomeTaskResolveSheet
   * (price if it's a purchase, next-due-date always), a maintenance row
   * goes through the same resolveEntry/confirmAction flow its own
   * category checkbox already uses. See row.kind and HomeDashboard's
   * wiring of this prop. */
  onResolvePress: (row: RecurringWarningRow) => void;
  /** Swipe-left on a row (the caller confirms). */
  onDeletePress?: (row: RecurringWarningRow) => void;
};

// Built from `colors` (not a module-level constant) so it actually flips
// with dark mode -- the old hardcoded hex here never did.
function rowChip(row: RecurringWarningRow): string {
  if (row.kind === "document" && row.daysRemaining < 0) return `Expirat de ${roCount(-row.daysRemaining, "zi", "zile")}`;
  if (row.tier === "red") return row.daysRemaining < 0 ? `Restant ${roCount(-row.daysRemaining, "zi", "zile")}` : "Restant";
  if (row.tier === "orangeToday") return "Azi";
  return row.daysRemaining === 1 ? "Mâine" : `în ${roCount(row.daysRemaining, "zi", "zile")}`;
}

/** Opened from the Restanțe card on HomeDashboard -- every task/
 * maintenance/recurring entry within 4 days of (or past) its due date,
 * grouped into one section per tier (RESTANT/AZI/2 ZILE/4 ZILE), each
 * independently collapsible via its own "Show more"/"Show less" next
 * to its title -- per explicit user request, replacing the old single
 * flat list. */
export function HomeRecurringWarningsPage({ homeData, onBack, onResolvePress, onDeletePress }: HomeRecurringWarningsPageProps) {
  const { colors, spacing } = useTheme();

  const { rows } = getRecurringTaskWarnings(homeData);
  const rowsByTier: Record<RecurringWarningTier, RecurringWarningRow[]> = { red: [], orangeToday: [], orangeDays: [], yellow: [] };
  rows.forEach((row) => rowsByTier[row.tier].push(row));

  return (
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 100, gap: spacing.section }}
      >
        <TopBar onBack={onBack} />
        <Identity color={SPACE_IDENTITY_COLORS.home} kicker="Casă" title="Scadențe" subtitle="Atinge un rând ca să-l rezolvi." info="home.scadente" />

        {rows.length > 0 ? (
          TIER_ORDER.filter((tier) => rowsByTier[tier].length > 0).map((tier) => (
            <TierSection key={tier} onDeletePress={onDeletePress} tier={tier} rows={rowsByTier[tier]} onResolvePress={onResolvePress} />
          ))
        ) : (
          <EmptyState icon="checkmark-done-outline" title="Ești la zi" message="Nimic nu se apropie de scadență." />
        )}
      </ScrollView>
    </SwipeBackView>
  );
}

function TierSection({
  tier,
  rows,
  onResolvePress,
  onDeletePress,
}: {
  tier: RecurringWarningTier;
  rows: RecurringWarningRow[];
  onResolvePress: (row: RecurringWarningRow) => void;
  onDeletePress?: (row: RecurringWarningRow) => void;
}) {
  const { colors, spacing } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const color = recurringWarningTierColor(tier, colors);
  const canCollapse = rows.length > COLLAPSED_ROW_COUNT;
  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROW_COUNT);

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader
        title={`${TIER_SECTION_TITLE[tier]} (${rows.length})`}
        action={canCollapse ? { label: expanded ? "Arată mai puțin" : "Arată tot", onPress: () => setExpanded((c) => !c) } : undefined}
      />
      <Group inset={68}>
        {visibleRows.map((row) => (
          <SwipeRow
            key={row.id}
            cornerRadius={0}
            colors={colors}
            // A document's swipe-right renews it (the caller's pop-up).
            onResolve={() => onResolvePress(row)}
            resolveIcon={row.kind === "document" ? "refresh" : "checkmark"}
            resolveLabel={row.kind === "document" ? "Reînnoiește" : "Rezolvă"}
            onDelete={onDeletePress ? () => onDeletePress(row) : undefined}
          >
          <Row
            onPress={() => onResolvePress(row)}
            leading={<IconWell icon={row.kind === "document" ? "document-text-outline" : row.isRecurring ? "repeat-outline" : "alert-circle-outline"} color={color} />}
            title={row.title}
            subtitle={KIND_LABEL[row.kind]}
            trailing={tier === "yellow" ? <Chip label={rowChip(row)} color={colors.onSurfaceTertiary} filled={false} /> : <Chip label={rowChip(row)} color={color} icon={tier === "red" ? "alert-circle" : undefined} />}
          />
          </SwipeRow>
        ))}
      </Group>
    </View>
  );
}
