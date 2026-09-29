import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
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
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

function formatAmount(value: number): string {
  return value.toLocaleString("en-US");
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
  const { colors, spacing, radius } = useTheme();

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
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
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

  const renderRecord = (record: HomeSpendRecord, isLast: boolean) => (
    <Pressable
      key={`${record.category}-${record.id}`}
      testID={`home-spend-record-${record.category}-${record.id}`}
      onPress={() => onRecordPress?.(record.category, record.entryId)}
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
          backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={record.icon} size={17} color={SPACE_IDENTITY_COLORS.home} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
          {record.title}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }} numberOfLines={1}>
          {record.categoryLabel} · {formatDate(record.date)}
          {record.subtitle ? ` · ${record.subtitle}` : ""}
        </Text>
      </View>

      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>
        {formatAmount(record.amount)} RON
      </Text>

      {onRecordPress ? <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} /> : null}
    </Pressable>
  );

  return (
    <ScrollView
      testID="home-spend-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 150 }}
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
          testID="home-spend-back"
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.md,
            backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="wallet-outline" size={17} color={SPACE_IDENTITY_COLORS.home} />
        </View>

        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 }}>
          Cheltuieli
        </Text>
      </View>

      {/* TOTAL */}
      <View
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        }}
      >
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: 4 }}>
              TOTAL CHELTUIT
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Text
                style={{ flexShrink: 1, fontSize: hasPurchasePrice ? 22 : 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.6 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {formatAmount(total)}
              </Text>
              <Text style={{ flexShrink: 0, fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary }}>RON</Text>
            </View>
            <Text style={{ marginTop: 4, fontSize: 12, color: colors.onSurfaceTertiary }} numberOfLines={1}>
              {formatSpendPeriodLabel(period)}
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

              <View style={{ flex: 1, minWidth: 0 }} testID="home-overall-cost">
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: 4 }}>
                  OVERALL
                </Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                  <Text
                    style={{ flexShrink: 1, fontSize: 22, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.6 }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {formatAmount(overall)}
                  </Text>
                  <Text style={{ flexShrink: 0, fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary }}>RON</Text>
                </View>
                <Text style={{ marginTop: 4, fontSize: 12, color: colors.onSurfaceTertiary }} numberOfLines={1}>
                  {formatAmount(purchasePrice)} RON purchase
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
              const isAlone = index === byCategory.length - 1 && index % 2 === 0;

              return (
                <Pressable
                  key={entry.category}
                  testID={`home-spend-filter-${entry.category}`}
                  onPress={() => toggleCategory(entry.category)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={{
                    flexBasis: "48%",
                    flexGrow: 1,
                    gap: 4,
                    padding: spacing.md,
                    borderRadius: radius.md,
                    // Selected state stays neutral black/white, never
                    // the identity color -- same rule as everywhere
                    // else in the app (see frontend/CLAUDE.md).
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
                      style={{ fontSize: 11, fontWeight: "600", color: isActive ? colors.surface : colors.onSurfaceTertiary }}
                      numberOfLines={1}
                    >
                      {entry.label}
                    </Text>
                  </View>
                  <Text
                    style={{ fontSize: 15, fontWeight: "800", color: isActive ? colors.surface : colors.onSurface }}
                    numberOfLines={1}
                  >
                    {formatAmount(entry.amount)} RON
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* PERIOD -- same modal bottom-sheet trigger as CarExpensesPage/
          CarHistoryPage's own "Period" row (the app's one established
          period-filter model), just without their custom weeks/months
          stepper -- Home's 5 fixed presets don't need one. */}
      <View
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        }}
      >
        <Pressable
          testID="home-spend-period-trigger"
          onPress={() => setPeriodPickerOpen(true)}
          accessibilityRole="button"
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }}>Perioadă</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
              {formatSpendPeriodLabel(period)}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.onSurfaceTertiary} />
          </View>
        </Pressable>
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
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm }}>
              Perioadă
            </Text>

            {PERIOD_PRESETS.map((preset) => {
              const isActive = periodsEqual(period, preset.period);
              return (
                <Pressable
                  key={preset.label}
                  testID={`home-spend-period-option-${preset.label}`}
                  onPress={() => {
                    setPeriod(preset.period);
                    setPeriodPickerOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: spacing.md,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: isActive ? "700" : "500", color: colors.onSurface }}>
                    {preset.label}
                  </Text>
                  {isActive ? <Ionicons name="checkmark" size={18} color={colors.onSurface} /> : null}
                </Pressable>
              );
            })}

            <Pressable
              testID="home-spend-period-done"
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
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.surface }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* LIST */}
      {allRecords.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
          <Ionicons name="receipt-outline" size={28} color={SPACE_IDENTITY_COLORS.home} />
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center" }}>
            Nicio cheltuială înregistrată încă.
          </Text>
        </View>
      ) : filteredRecords.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
          <Ionicons name="filter-outline" size={28} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center" }}>
            Nimic în această perioadă/filtru.
          </Text>
        </View>
      ) : (
        <>
          <View
            style={{
              backgroundColor: colors.surfaceSecondary,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.sm,
              overflow: "hidden",
            }}
          >
            {visibleRecords.map((record, index) => renderRecord(record, index === visibleRecords.length - 1))}
          </View>

          {filteredRecords.length > 8 ? (
            <Pressable
              testID="home-spend-show-more"
              onPress={() => setListExpanded((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                paddingVertical: spacing.sm,
                marginTop: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
                {listExpanded ? "Arată mai puțin" : `Arată mai mult (${filteredRecords.length - 8})`}
              </Text>
              <Ionicons name={listExpanded ? "chevron-up" : "chevron-down"} size={13} color={colors.onSurfaceTertiary} />
            </Pressable>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
