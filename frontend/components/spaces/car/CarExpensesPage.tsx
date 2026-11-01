import React, { useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { PressableScale } from "@/components/ui/PressableScale";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { TopBar, Identity, Pill, SectionHeader, Group, Row, IconWell, EmptyState } from "@/components/ui/primitives";
import { motion } from "@/lib/motion";
import { GuiltFreeChip } from "@/components/dashboard/GuiltFree";
import { CAR_PERIOD_PRESETS } from "./CarPeriodSheet";
import { PeriodPicker } from "@/components/ui/PeriodPicker";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import type { CarData } from "./car.data.types";
import {
  getCarExpenseRecords,
  getTotalCarExpenses,
  filterRecordsByArchived,
  filterRecordsByPeriod,
  type CarExpenseCategory,
  type CarExpensePeriod,
  type CarExpenseRecord,
} from "@/lib/spaces/car/calculations/expenses.calculations";
import { getCurrentOdometer } from "@/lib/spaces/car/calculations/dashboard.calculations";
import { formatCarDate, formatCarNumber } from "./utils/carFormatters";
import { isRecentToday } from "@/lib/spaces/car/utils/recency";
import type { CarProfile } from "@/lib/spaces/spaceProfile";

// Same mapping as CarDashboard.tsx's statusDotColor / CarHistoryPage.tsx's
// statusDotColor -- "safe" (not yet inside the alert window) is
// success/green, the other 3 mirror DUE SOON's own tiers -- PLUS
// "archived" (gray, `colors.info`), which only exists on this page: see
// CarExpenseRecord.statusDot.
function statusDotColor(status: NonNullable<CarExpenseRecord["statusDot"]>, colors: any) {
  if (status === "archived") return colors.info;
  if (status === "safe") return colors.success;
  if (status === "critical") return colors.error;
  if (status === "medium") return colors.warning;
  return colors.caution;
}

export type CarExpensesPageProps = {
  carData: CarData;
  /** From the dedicated Car form (Edit -> Purchase price) -- used only to
   * add the purchase price into the OVERALL figure below TOTAL SPENT.
   * null/no price entered means OVERALL isn't shown at all. */
  profile?: CarProfile | null;
  onBack: () => void;
  /** Tapping a record opens it in its own category's form to edit or
   * delete it -- same edit flow as the dashboard's RECENT list, just
   * reachable from here too since this page shows every record. */
  onRecordPress?: (category: CarExpenseCategory, id: string) => void;
};

const CATEGORY_ORDER: CarExpenseCategory[] = [
  "fuel",
  "maintenance",
  "document",
  "expense",
];

// Fixed presets -- "de la 0 luna, la 3 la 6 la 12 apoi la ani". A custom
// 1-12 month count (see the stepper in the picker) covers anything in
// between that isn't one of these.

/**
 * Every record that has actually cost this car money, in one place --
 * opened from the "This month" wallet stat card on CarDashboard. Fuel,
 * Maintenance, Documents and Expenses are 4 separate forms/tables on
 * purpose (each has its own shape), but money spent doesn't care which
 * form it came from, so this page deliberately un-separates them again
 * into one dated list with one running total. All the actual aggregation
 * lives in lib/spaces/car/calculations/expenses.calculations.ts -- this
 * component only renders what that returns.
 *
 * Every filter here composes: pick Fuel + Maintenance, a 3-month window,
 * and exclude archived, and TOTAL SPENT/the list both reflect exactly
 * that combination -- not just one filter applied at a time.
 */
export function CarExpensesPage({ carData, profile, onBack, onRecordPress }: CarExpensesPageProps) {
  const { card, colors, spacing, radius, typography } = useTheme();

  // "Introdus" -- purchasePrice is always a number on a saved profile
  // (CarProfileForm defaults it to 0 rather than leaving it undefined),
  // so 0 is treated the same as "not entered": nothing to add, and
  // showing "Overall: 7,592 RON" right next to a real purchase price of
  // 0 would misleadingly look like a free car.
  const purchasePrice = profile?.purchasePrice ?? 0;
  const hasPurchasePrice = purchasePrice > 0;

  // Multi-select: any number of categories can be active at once. Empty
  // set = no restriction (everything counts), same meaning "null" used
  // to have. Selecting Fuel + Maintenance narrows TOTAL SPENT and the
  // list to just those two, combined with whatever period/archived say.
  const [activeCategories, setActiveCategories] = useState<Set<CarExpenseCategory>>(new Set());

  const toggleCategory = (category: CarExpenseCategory) => {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  // Whether archived (superseded-by-a-renewal) records count at all --
  // defaults to ON so this matches how the page behaved before the
  // toggle existed. Only affects TOTAL SPENT/breakdown/list below, never
  // OVERALL (see allTimeTotal) -- lifetime cost of ownership doesn't stop
  // being true just because a document got renewed.
  const [includeArchived, setIncludeArchived] = useState(true);

  // "All time" by default. A custom 1-12 count, in either weeks or
  // months (unit toggle, same as CarHistoryPage.tsx), is selectable from
  // inside the picker for anything the fixed presets don't cover, e.g.
  // "last 2 weeks" or "last 4 months".
  const [period, setPeriod] = useState<CarExpensePeriod>({ kind: "all" });

  // ALL starts capped at 5 -- category chips + period + archived toggle
  // already narrow things down, so one "Show more" tap is enough instead
  // of a full month-by-month browser.
  const [allExpanded, setAllExpanded] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);

  const currentOdometer = useMemo(() => getCurrentOdometer(carData), [carData]);
  const allRecords = useMemo(
    () => getCarExpenseRecords(carData, currentOdometer),
    [carData, currentOdometer],
  );

  // OVERALL is deliberately computed from allRecords, ignoring every
  // filter on this page -- it's "what has this car cost since day one",
  // a fixed figure, not something that should shrink because you're
  // looking at just Fuel in the last 3 months.
  const allTimeTotal = useMemo(() => getTotalCarExpenses(allRecords), [allRecords]);
  const overall = purchasePrice + allTimeTotal;

  // period + archived only -- what the breakdown chips' own counts are
  // based on, so a chip always shows "how much Fuel cost in this period"
  // regardless of which chips happen to be selected right now.
  const periodRecords = useMemo(
    () => filterRecordsByPeriod(filterRecordsByArchived(allRecords, includeArchived), period),
    [allRecords, includeArchived, period],
  );

  // period + archived + category selection -- drives TOTAL SPENT and the
  // list. This is the one place all the active filters actually combine.
  const filteredRecords = useMemo(
    () =>
      activeCategories.size > 0
        ? periodRecords.filter((record) => activeCategories.has(record.category))
        : periodRecords,
    [periodRecords, activeCategories],
  );
  const total = useMemo(() => getTotalCarExpenses(filteredRecords), [filteredRecords]);

  // Same "Recent" rule as the dashboard -- recorded today, nothing else.
  // Once the day changes a record just moves down into the plain list
  // below, no tag removed, nothing to do.
  const recentRecords = useMemo(
    () => filteredRecords.filter((r) => isRecentToday(r.date)),
    [filteredRecords],
  );
  const olderRecords = useMemo(
    () => filteredRecords.filter((r) => !isRecentToday(r.date)),
    [filteredRecords],
  );

  const byCategory = useMemo(() => {
    const totals = new Map<CarExpenseCategory, number>();
    periodRecords.forEach((record) => {
      totals.set(record.category, (totals.get(record.category) ?? 0) + record.amount);
    });
    return CATEGORY_ORDER.filter((category) => totals.has(category)).map((category) => ({
      category,
      amount: totals.get(category)!,
      label: periodRecords.find((r) => r.category === category)?.categoryLabel ?? category,
      icon: periodRecords.find((r) => r.category === category)!.icon,
    }));
  }, [periodRecords]);

  const categoryLabelsSelected = CATEGORY_ORDER.filter((c) => activeCategories.has(c))
    .map((c) => byCategory.find((b) => b.category === c)?.label ?? c)
    .join(", ");

  const carColors = useSpaceColors("car");
  const CAR = carColors.color;
  const tint = carColors.tint;
  const muted = colors.onSurfaceTertiary;

  const renderGroup = (title: string, records: CarExpenseRecord[], expanded: boolean, toggle: () => void, testID: string) => {
    const visible = expanded ? records : records.slice(0, 5);
    return (
      <View style={{ gap: spacing.xs }}>
        <SectionHeader
          title={title}
          muted
          action={records.length > 5 ? { label: expanded ? "Arată mai puțin" : `Arată tot (${records.length})`, onPress: toggle, testID } : undefined}
        />
        <Group inset={68}>
          {visible.map((record) => (
            <Row
              key={`${record.category}-${record.id}`}
              testID={`expense-record-${record.category}-${record.id}`}
              onPress={onRecordPress ? () => onRecordPress(record.category, record.id) : undefined}
              leading={
                <View>
                  <IconWell icon={record.icon} color={CAR} tint={tint} />
                  {record.statusDot ? (
                    <View
                      style={{
                        position: "absolute",
                        right: -3,
                        bottom: -3,
                        width: record.overdue ? 14 : 10,
                        height: record.overdue ? 14 : 10,
                        borderRadius: 7,
                        backgroundColor: statusDotColor(record.statusDot, colors),
                        borderWidth: 2,
                        borderColor: colors.surfaceSecondary,
                      }}
                    />
                  ) : null}
                </View>
              }
              title={record.title}
              subtitle={[record.categoryLabel, formatCarDate(record.date), record.subtitle, record.archived ? "arhivat" : null].filter(Boolean).join(", ")}
              dim={record.archived}
              trailing={
                <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{formatCarNumber(record.amount)} lei</Text>
                  {/* Row's title is a plain string, so the chip sits under the amount
                      (wrapped: the chip itself aligns flex-start). */}
                  {record.guiltFree ? <View><GuiltFreeChip /></View> : null}
                </View>
              }
            />
          ))}
        </Group>
      </View>
    );
  };

  return (
    <SwipeBackView onBack={onBack}>
    <ScrollView
      testID="car-expenses-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="expenses-back" />
      <Identity color={CAR} kicker="Mașină" title="Cheltuieli" subtitle="Tot ce a costat mașina, din toate formularele" info="car.expenses" />

      {/* Period -- the shared picker (same as Istoric), plus the
          archived toggle in the same row. */}
      <PeriodPicker value={period} onChange={setPeriod} presets={CAR_PERIOD_PRESETS} testIDPrefix="expenses">
        <Pill
          testID="expenses-archived-toggle"
          icon={includeArchived ? "archive" : "archive-outline"}
          label={includeArchived ? "Cu arhivate" : "Fără arhivate"}
          active={includeArchived}
          onPress={() => setIncludeArchived((v) => !v)}
        />
      </PeriodPicker>

      <View style={{ ...card, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 13, color: muted }}>
            Total cheltuit{activeCategories.size > 0 ? `, ${categoryLabelsSelected.toLowerCase()}` : ""}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <AnimatedNumber value={total} style={{ ...typography.display, color: colors.onSurface }} />
            <Text style={{ fontSize: 16, color: muted }}>lei</Text>
          </View>
          {hasPurchasePrice ? (
            <Text testID="car-overall-cost" style={{ fontSize: 13, color: muted }}>
              Cu tot cu prețul mașinii ({formatCarNumber(purchasePrice)} lei): {formatCarNumber(overall)} lei
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
                  testID={`expense-filter-${entry.category}`}
                  onPress={() => toggleCategory(entry.category)}
                  scaleTo={motion.scale.tile}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${entry.label}: ${formatCarNumber(entry.amount)} lei`}
                  style={{
                    flexBasis: "48%",
                    flexGrow: 1,
                    gap: 2,
                    padding: spacing.md,
                    borderRadius: radius.control,
                    backgroundColor: isActive ? `${CAR}29` : colors.surfaceTertiary,
                    borderWidth: 1.5,
                    borderColor: isActive ? CAR : "transparent",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name={isActive ? "checkmark-circle" : entry.icon} size={14} color={isActive ? tint : muted} />
                    <Text style={{ fontSize: 13, color: isActive ? colors.onSurface : muted }} numberOfLines={1}>{entry.label}</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{formatCarNumber(entry.amount)} lei</Text>
                </PressableScale>
              );
            })}
          </View>
        ) : null}
      </View>

      {allRecords.length === 0 ? (
        <EmptyState icon="receipt-outline" message="Nicio cheltuială înregistrată încă." />
      ) : filteredRecords.length === 0 ? (
        <EmptyState icon="filter-outline" message="Nimic în această perioadă sau cu aceste filtre." />
      ) : (
        <>
          {recentRecords.length > 0 ? renderGroup("Azi", recentRecords, recentExpanded, () => setRecentExpanded((v) => !v), "expenses-recent-show-more") : null}
          {olderRecords.length > 0 ? renderGroup(recentRecords.length > 0 ? "Vechi" : "Înregistrări", olderRecords, allExpanded, () => setAllExpanded((v) => !v), "expenses-all-show-more") : null}
        </>
      )}
    </ScrollView>
    </SwipeBackView>
  );
}
