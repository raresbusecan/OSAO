import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Switch, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { CarData } from "./car.data.types";
import {
  getCarExpenseRecords,
  getTotalCarExpenses,
  filterRecordsByArchived,
  filterRecordsByPeriod,
  formatPeriodLabel,
  type CarExpenseCategory,
  type CarExpensePeriod,
  type CarExpenseRecord,
} from "@/lib/spaces/car/calculations/expenses.calculations";
import { formatCarDate, formatCarNumber } from "./utils/carFormatters";
import { isRecentToday } from "@/lib/spaces/car/utils/recency";
import type { CarProfile } from "@/lib/spaces/spaceProfile";

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
const PERIOD_PRESETS: { label: string; period: CarExpensePeriod }[] = [
  { label: "All time", period: { kind: "all" } },
  { label: "Last 3 months", period: { kind: "months", count: 3 } },
  { label: "Last 6 months", period: { kind: "months", count: 6 } },
  { label: "Last year", period: { kind: "months", count: 12 } },
  { label: "Last 2 years", period: { kind: "years", count: 2 } },
  { label: "Last 3 years", period: { kind: "years", count: 3 } },
];

function periodsEqual(a: CarExpensePeriod, b: CarExpensePeriod): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "all") return true;
  return (a as { count: number }).count === (b as { count: number }).count;
}

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
  const { colors, spacing, radius } = useTheme();

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

  // "All time" by default. A custom 1-12 month count is selectable from
  // inside the picker (customMonths) for anything the fixed presets don't
  // cover, e.g. "last 2 months" or "last 4".
  const [period, setPeriod] = useState<CarExpensePeriod>({ kind: "all" });
  const [usingCustom, setUsingCustom] = useState(false);
  const [customMonths, setCustomMonths] = useState(2);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);

  // ALL starts capped at 5 -- category chips + period + archived toggle
  // already narrow things down, so one "Show more" tap is enough instead
  // of a full month-by-month browser.
  const [allExpanded, setAllExpanded] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);

  const selectPreset = (preset: CarExpensePeriod) => {
    setPeriod(preset);
    setUsingCustom(false);
    setPeriodPickerOpen(false);
  };

  const selectCustom = () => {
    setUsingCustom(true);
    setPeriod({ kind: "months", count: customMonths });
  };

  const adjustCustomMonths = (delta: number) => {
    const next = Math.min(12, Math.max(1, customMonths + delta));
    setCustomMonths(next);
    setPeriod({ kind: "months", count: next });
  };

  const allRecords = useMemo(() => getCarExpenseRecords(carData), [carData]);

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

  const renderRecordRow = (record: CarExpenseRecord, isLast: boolean) => (
    <Pressable
      key={`${record.category}-${record.id}`}
      testID={`expense-record-${record.category}-${record.id}`}
      onPress={() => onRecordPress?.(record.category, record.id)}
      disabled={!onRecordPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.md,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceTertiary,
          alignItems: "center",
          justifyContent: "center",
          opacity: record.archived ? 0.5 : 1,
        }}
      >
        <Ionicons name={record.icon} size={17} color={colors.onSurface} />
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: record.archived ? colors.onSurfaceTertiary : colors.onSurface,
            }}
          >
            {record.title}
          </Text>

          {record.archived ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: radius.pill ?? 999,
                backgroundColor: colors.surfaceTertiary,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                ARCHIVED
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }}>
          {record.categoryLabel} · {formatCarDate(record.date)}
          {record.subtitle ? ` · ${record.subtitle}` : ""}
        </Text>
      </View>

      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>
        {formatCarNumber(record.amount)} RON
      </Text>

      {onRecordPress ? (
        <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
      ) : null}
    </Pressable>
  );

  return (
    <ScrollView
      testID="car-expenses-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        paddingBottom: 150,
      }}
    >
      {/* HEADER */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
        }}
      >
        <Pressable
          testID="expenses-back"
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSecondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: colors.onSurface,
            letterSpacing: -0.4,
          }}
        >
          Expenses
        </Text>
      </View>

      {/* TOTAL */}
      <View
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderRadius: radius.lg,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        }}
      >
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: colors.onSurfaceTertiary,
                marginBottom: 4,
              }}
            >
              TOTAL SPENT
            </Text>

            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: "800",
                  color: colors.onSurface,
                  letterSpacing: -0.6,
                }}
              >
                {formatCarNumber(total)}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurfaceTertiary }}>
                RON
              </Text>
            </View>

            <Text style={{ marginTop: 4, fontSize: 12, color: colors.onSurfaceTertiary }}>
              {formatPeriodLabel(period)}
              {!includeArchived ? " · archived excluded" : ""}
              {activeCategories.size > 0 ? ` · ${categoryLabelsSelected}` : ""}
            </Text>
          </View>

          {hasPurchasePrice ? (
            <>
              <View
                style={{
                  width: StyleSheet.hairlineWidth,
                  backgroundColor: colors.border,
                  marginHorizontal: spacing.md,
                }}
              />

              <View style={{ flex: 1 }} testID="car-overall-cost">
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: colors.onSurfaceTertiary,
                    marginBottom: 4,
                  }}
                >
                  OVERALL
                </Text>

                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <Text
                    style={{
                      fontSize: 30,
                      fontWeight: "800",
                      color: colors.onSurface,
                      letterSpacing: -0.6,
                    }}
                  >
                    {formatCarNumber(overall)}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurfaceTertiary }}>
                    RON
                  </Text>
                </View>

                <Text style={{ marginTop: 4, fontSize: 12, color: colors.onSurfaceTertiary }}>
                  {formatCarNumber(purchasePrice)} RON purchase
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {byCategory.length > 0 ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: spacing.sm,
              marginTop: spacing.md,
              paddingTop: spacing.md,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            }}
          >
            {byCategory.map((entry, index) => {
              const isActive = activeCategories.has(entry.category);
              // A 2-per-row wrap: the last item is alone on its row only
              // when it would've started a fresh row by itself (even
              // index, nothing after it) -- e.g. 1 or 3 categories present.
              const isAlone = index === byCategory.length - 1 && index % 2 === 0;

              return (
                <Pressable
                  key={entry.category}
                  testID={`expense-filter-${entry.category}`}
                  onPress={() => toggleCategory(entry.category)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={{
                    flexBasis: "48%",
                    flexGrow: 1,
                    gap: 4,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: isActive ? colors.onSurface : colors.surfaceTertiary,
                    alignItems: isAlone ? "center" : "flex-start",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {isActive ? (
                      <Ionicons name="checkmark" size={12} color={colors.surface} />
                    ) : (
                      <Ionicons name={entry.icon} size={12} color={colors.onSurfaceTertiary} />
                    )}
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: isActive ? colors.surface : colors.onSurfaceTertiary,
                      }}
                      numberOfLines={1}
                    >
                      {entry.label}
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: isActive ? colors.surface : colors.onSurface,
                    }}
                    numberOfLines={1}
                  >
                    {formatCarNumber(entry.amount)} RON
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* PERIOD (dropdown) + ARCHIVED toggle -- affect TOTAL SPENT, the
          category breakdown chips above, and the list below. Never
          OVERALL. */}
      <View
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderRadius: radius.lg,
          padding: spacing.lg,
          marginBottom: spacing.lg,
          gap: spacing.md,
        }}
      >
        <Pressable
          testID="expense-period-trigger"
          onPress={() => setPeriodPickerOpen(true)}
          accessibilityRole="button"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }}>
            Period
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
              {formatPeriodLabel(period)}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.onSurfaceTertiary} />
          </View>
        </Pressable>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }}>
            Include archived
          </Text>

          <Switch
            testID="expense-include-archived-toggle"
            value={includeArchived}
            onValueChange={setIncludeArchived}
            trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
          />
        </View>
      </View>

      {/* PERIOD PICKER */}
      <Modal
        visible={periodPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPeriodPickerOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => setPeriodPickerOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          />

          <View
            style={{
              backgroundColor: colors.surface,
              padding: spacing.xl,
              gap: spacing.xs ?? 4,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: colors.onSurface,
                marginBottom: spacing.sm,
              }}
            >
              Period
            </Text>

            {PERIOD_PRESETS.map((preset) => {
              const isActive = !usingCustom && periodsEqual(period, preset.period);

              return (
                <Pressable
                  key={preset.label}
                  testID={`expense-period-option-${preset.label}`}
                  onPress={() => selectPreset(preset.period)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: spacing.md,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: isActive ? "700" : "500",
                      color: colors.onSurface,
                    }}
                  >
                    {preset.label}
                  </Text>
                  {isActive ? (
                    <Ionicons name="checkmark" size={18} color={colors.onSurface} />
                  ) : null}
                </Pressable>
              );
            })}

            <Pressable
              testID="expense-period-option-custom"
              onPress={selectCustom}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: spacing.md,
                borderBottomWidth: usingCustom ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: usingCustom ? "700" : "500",
                  color: colors.onSurface,
                }}
              >
                Custom
              </Text>
              {usingCustom ? (
                <Ionicons name="checkmark" size={18} color={colors.onSurface} />
              ) : null}
            </Pressable>

            {usingCustom ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: spacing.lg,
                  paddingVertical: spacing.md,
                }}
              >
                <Pressable
                  testID="expense-period-custom-minus"
                  onPress={() => adjustCustomMonths(-1)}
                  disabled={customMonths <= 1}
                  hitSlop={8}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceSecondary,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: customMonths <= 1 ? 0.4 : 1,
                  }}
                >
                  <Ionicons name="remove" size={18} color={colors.onSurface} />
                </Pressable>

                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: colors.onSurface,
                    minWidth: 110,
                    textAlign: "center",
                  }}
                >
                  Last {customMonths} {customMonths === 1 ? "month" : "months"}
                </Text>

                <Pressable
                  testID="expense-period-custom-plus"
                  onPress={() => adjustCustomMonths(1)}
                  disabled={customMonths >= 12}
                  hitSlop={8}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceSecondary,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: customMonths >= 12 ? 0.4 : 1,
                  }}
                >
                  <Ionicons name="add" size={18} color={colors.onSurface} />
                </Pressable>
              </View>
            ) : null}

            <Pressable
              testID="expense-period-done"
              onPress={() => setPeriodPickerOpen(false)}
              style={{
                marginTop: spacing.md,
                minHeight: 48,
                borderRadius: radius.md,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.surface }}>
                Done
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* LIST */}
      {allRecords.length === 0 ? (
        <View
          style={{
            alignItems: "center",
            paddingVertical: spacing["3xl"] ?? 48,
            gap: spacing.sm,
          }}
        >
          <Ionicons name="receipt-outline" size={28} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center" }}>
            No expenses recorded yet. Add Fuel, Maintenance, a Document or an
            Expense from the menu to see them here.
          </Text>
        </View>
      ) : filteredRecords.length === 0 ? (
        <View
          style={{
            alignItems: "center",
            paddingVertical: spacing["3xl"] ?? 48,
            gap: spacing.sm,
          }}
        >
          <Ionicons name="filter-outline" size={28} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center" }}>
            {activeCategories.size > 0
              ? `No ${categoryLabelsSelected.toLowerCase()} records in this period.`
              : "No records in this period."}
          </Text>
          <Pressable
            onPress={() => {
              setActiveCategories(new Set());
              selectPreset({ kind: "all" });
              setIncludeArchived(true);
            }}
            hitSlop={8}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
              Reset filters
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* RECENT -- recorded today, nothing else. Same rule as the
              dashboard: once today ends these rows just move down into
              ALL below, no tag to remove. */}
          {recentRecords.length > 0 ? (
            <>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 0.6,
                  color: colors.onSurfaceTertiary,
                  textTransform: "uppercase",
                  marginBottom: spacing.sm,
                }}
              >
                Recent
              </Text>

              <View
                style={{
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: radius.lg,
                  overflow: "hidden",
                }}
              >
                {(recentExpanded ? recentRecords : recentRecords.slice(0, 5)).map((record, index, visible) =>
                  renderRecordRow(record, index === visible.length - 1),
                )}
              </View>

              {!recentExpanded && recentRecords.length > 5 ? (
                <Pressable
                  testID="expenses-recent-show-more"
                  onPress={() => setRecentExpanded(true)}
                  style={{
                    alignItems: "center",
                    paddingVertical: spacing.sm,
                    marginBottom: spacing.lg,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
                    Show more ({recentRecords.length - 5})
                  </Text>
                </Pressable>
              ) : (
                <View style={{ marginBottom: spacing.lg }} />
              )}
            </>
          ) : null}

          {olderRecords.length > 0 ? (
            <>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 0.6,
                  color: colors.onSurfaceTertiary,
                  textTransform: "uppercase",
                  marginBottom: spacing.sm,
                }}
              >
                All
              </Text>

              <View
                style={{
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: radius.lg,
                  overflow: "hidden",
                }}
              >
                {(allExpanded ? olderRecords : olderRecords.slice(0, 5)).map((record, index, visible) =>
                  renderRecordRow(record, index === visible.length - 1),
                )}
              </View>

              {!allExpanded && olderRecords.length > 5 ? (
                <Pressable
                  testID="expenses-all-show-more"
                  onPress={() => setAllExpanded(true)}
                  style={{
                    alignItems: "center",
                    paddingVertical: spacing.sm,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
                    Show more ({olderRecords.length - 5})
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
