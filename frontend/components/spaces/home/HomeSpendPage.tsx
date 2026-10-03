import React, { useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { PressableScale } from "@/components/ui/PressableScale";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TopBar, Identity, Pill, SectionHeader, Group, Row, IconWell, EmptyState } from "@/components/ui/primitives";
import { motion } from "@/lib/motion";
import { lei, roDate } from "@/lib/format";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import type { HomeData } from "./home.data.types";
import type { HomeProfile } from "@/lib/spaces/spaceProfile";
import {
  getHomeSpendRecords,
  getTotalHomeSpend,
  filterSpendByPeriod,
  formatSpendPeriodLabel,
  type HomeSpendCategory,
  type HomeSpendPeriod,
  type HomeSpendRecord,
} from "@/lib/spaces/home/calculations/spend.calculations";

export type HomeSpendPageProps = {
  homeData: HomeData;
  /** From the dedicated Home form (Edit -> Ownership/Purchase price) --
   * used only to add the purchase price into the OVERALL figure below
   * TOTAL CHELTUIT, same as CarExpensesPage's own OVERALL. null/no
   * price entered means OVERALL isn't shown at all -- this was
   * missing entirely until a user pointed out the house's own purchase
   * price never factored into Home's spend totals anywhere. */
  profile?: HomeProfile | null;
  onBack: () => void;
  /** Tapping a record opens it back in its own category's edit form
   * (Expenses/Maintenance) or the Tasks edit form -- same idea as
   * Car's CarExpensesPage onRecordPress, just routed by HomeDashboard
   * since each category lives in a different sub-view there. */
  onRecordPress?: (category: HomeSpendCategory, id: string) => void;
};

const CATEGORY_ORDER: HomeSpendCategory[] = ["expense", "maintenance", "task", "recurring"];

const PERIOD_PRESETS: { label: string; period: HomeSpendPeriod }[] = [
  { label: "Luna aceasta", period: { kind: "thisMonth" } },
  { label: "3 luni", period: { kind: "months", count: 3 } },
  { label: "6 luni", period: { kind: "months", count: 6 } },
  { label: "1 an", period: { kind: "years", count: 1 } },
  { label: "Tot timpul", period: { kind: "all" } },
];

function periodsEqual(a: HomeSpendPeriod, b: HomeSpendPeriod): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "all" || a.kind === "thisMonth") return true;
  return (a as { count: number }).count === (b as { count: number }).count;
}

function formatDate(dateString: string): string {
  return roDate(dateString) || dateString;
}

/**
 * Every record that has actually cost this Home space money, in one
 * place -- opened from the "This month" stat card on HomeDashboard.
 * Expenses, Maintenance and a resolved purchase Task are 3 separate
 * forms on purpose (each has its own shape), but money spent doesn't
 * care which one it came from -- same idea as Car's own
 * CarExpensesPage, deliberately mirrored here per explicit user
 * request ("vrea ceva ca la Car"). All the aggregation lives in
 * spend.calculations.ts; this component only renders what that
 * returns.
 */
export function HomeSpendPage({ homeData, profile, onBack, onRecordPress }: HomeSpendPageProps) {
  const { colors, spacing, radius, isDark, typography } = useTheme();

  // "Introdus" -- purchasePrice is always a number on a saved profile
  // (HomeProfileForm defaults it to 0 rather than leaving it undefined),
  // so 0 is treated the same as "not entered": nothing to add, and
  // showing "Overall: 7,592 RON" right next to a real purchase price of
  // 0 would misleadingly look like a free house. Same reasoning as
  // CarExpensesPage's own hasPurchasePrice.
  const purchasePrice = profile?.purchasePrice ?? 0;
  const hasPurchasePrice = purchasePrice > 0;

  const [activeCategories, setActiveCategories] = useState<Set<HomeSpendCategory>>(new Set());
  const [period, setPeriod] = useState<HomeSpendPeriod>({ kind: "thisMonth" });
  const [listExpanded, setListExpanded] = useState(false);

  const toggleCategory = (category: HomeSpendCategory) => {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const allRecords = useMemo(() => getHomeSpendRecords(homeData), [homeData]);

  // OVERALL is deliberately computed from allRecords, ignoring every
  // filter on this page -- it's "what has this house cost since day
  // one", a fixed figure, not something that should shrink because
  // you're looking at just Cheltuieli in the last 3 months.
  const allTimeTotal = useMemo(() => getTotalHomeSpend(allRecords), [allRecords]);
  const overall = purchasePrice + allTimeTotal;

  // period only -- what the breakdown chips' own counts are based on,
  // so a chip always shows "how much Cheltuieli cost in this period"
  // regardless of which chips happen to be selected right now.
  const periodRecords = useMemo(() => filterSpendByPeriod(allRecords, period), [allRecords, period]);

  // period + category selection -- drives TOTAL SPENT and the list.
  const filteredRecords = useMemo(
    () =>
      activeCategories.size > 0
        ? periodRecords.filter((record) => activeCategories.has(record.category))
        : periodRecords,
    [periodRecords, activeCategories],
  );
  const total = useMemo(() => getTotalHomeSpend(filteredRecords), [filteredRecords]);

  const byCategory = useMemo(() => {
    const totals = new Map<HomeSpendCategory, number>();
    periodRecords.forEach((record) => {
      totals.set(record.category, (totals.get(record.category) ?? 0) + record.amount);
    });
    return CATEGORY_ORDER.filter((category) => totals.has(category)).map((category) => ({
      category,
      amount: totals.get(category)!,
      label: periodRecords.find((r) => r.category === category)!.categoryLabel,
      icon: periodRecords.find((r) => r.category === category)!.icon,
    }));
  }, [periodRecords]);

  const categoryLabelsSelected = CATEGORY_ORDER.filter((c) => activeCategories.has(c))
    .map((c) => byCategory.find((b) => b.category === c)?.label ?? c)
    .join(", ");

  const visibleRecords = listExpanded ? filteredRecords : filteredRecords.slice(0, 8);

  const HOME = SPACE_IDENTITY_COLORS.home!;
  const tint = spaceTextColor("home", isDark) ?? HOME;
  const muted = colors.onSurfaceTertiary;

  return (
    <SwipeBackView onBack={onBack}>
    <ScrollView
      testID="home-spend-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="home-spend-back" />
      <Identity color={HOME} kicker="Casă" title="Cheltuieli" />

      {/* Period -- the 5 presets as pills (was a modal picker). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {PERIOD_PRESETS.map((preset) => (
          <Pill
            key={preset.label}
            testID={`home-spend-period-option-${preset.label}`}
            label={preset.label}
            active={periodsEqual(period, preset.period)}
            onPress={() => setPeriod(preset.period)}
          />
        ))}
      </ScrollView>

      {/* Total for the period (+ the category chips that filter it). */}
      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 13, color: muted }}>
            Total cheltuit, {formatSpendPeriodLabel(period).toLowerCase()}
            {activeCategories.size > 0 ? `, ${categoryLabelsSelected.toLowerCase()}` : ""}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <AnimatedNumber value={total} style={{ ...typography.display, color: colors.onSurface }} />
            <Text style={{ fontSize: 16, color: muted }}>lei</Text>
          </View>
          {hasPurchasePrice ? (
            <Text testID="home-overall-cost" style={{ fontSize: 13, color: muted }}>
              Cu tot cu prețul casei ({lei(purchasePrice)}): {lei(overall)}
            </Text>
          ) : null}
        </View>

        {byCategory.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            {byCategory.map((entry) => {
              const isActive = activeCategories.has(entry.category);
              return (
                <PressableScale
                  key={entry.category}
                  testID={`home-spend-filter-${entry.category}`}
                  onPress={() => toggleCategory(entry.category)}
                  scaleTo={motion.scale.tile}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${entry.label}: ${lei(entry.amount)}`}
                  style={{
                    flexBasis: "48%",
                    flexGrow: 1,
                    gap: 2,
                    padding: spacing.md,
                    borderRadius: radius.control,
                    backgroundColor: isActive ? `${HOME}29` : colors.surfaceTertiary,
                    borderWidth: 1.5,
                    borderColor: isActive ? HOME : "transparent",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name={isActive ? "checkmark-circle" : entry.icon} size={14} color={isActive ? tint : muted} />
                    <Text style={{ fontSize: 13, color: isActive ? colors.onSurface : muted }} numberOfLines={1}>{entry.label}</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{lei(entry.amount)}</Text>
                </PressableScale>
              );
            })}
          </View>
        ) : null}
      </View>

      {allRecords.length === 0 ? (
        <EmptyState icon="receipt-outline" message="Nicio cheltuială înregistrată încă." />
      ) : filteredRecords.length === 0 ? (
        <EmptyState icon="filter-outline" message="Nimic în această perioadă sau cu acest filtru." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader
            title={`${filteredRecords.length} ${filteredRecords.length === 1 ? "înregistrare" : "înregistrări"}`}
            muted
            action={filteredRecords.length > 8 ? { label: listExpanded ? "Arată mai puțin" : "Arată tot", onPress: () => setListExpanded((v) => !v), testID: "home-spend-show-more" } : undefined}
          />
          <Group inset={68}>
            {visibleRecords.map((record) => (
              <Row
                key={`${record.category}-${record.id}`}
                testID={`home-spend-record-${record.category}-${record.id}`}
                onPress={onRecordPress ? () => onRecordPress(record.category, record.entryId) : undefined}
                leading={<IconWell icon={record.icon} color={HOME} tint={tint} />}
                title={record.title}
                subtitle={[record.categoryLabel, formatDate(record.date), record.subtitle].filter(Boolean).join(", ")}
                trailing={<Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(record.amount)}</Text>}
              />
            ))}
          </Group>
        </View>
      )}
    </ScrollView>
    </SwipeBackView>
  );
}
