import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, DeviceEventEmitter } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { TopBar, Identity, SectionHeader, Group, Row, IconWell, EmptyState } from "@/components/ui/primitives";
import { capitalize, lei, roCount, roDate } from "@/lib/format";
import { todoHref, todoTitle } from "@/lib/dashboard/spaceDue";
import { useFocusEffect, useRouter } from "expo-router";
import { REFRESH_EVENT } from "@/lib/refresh";
import { GuiltFreeChip } from "@/components/dashboard/GuiltFree";
import { fmtLei, weekBars, type PaceEvent } from "@/lib/budget/pace";

export type BudgetSpaceDetailPageProps = {
  /** The budget KEY ("Car", "Home"...) -- what the API takes; the page
   * shows SPACE_KIND_LABEL's Romanian name instead. */
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
  onBack: () => void;
  /** This space's slice of GET /budget's `pace` (lib/budget/pace.ts) --
   * absent on an older backend: no weekly card then. */
  pace?: { daily: number[]; events: PaceEvent[]; today: number; daysInMonth: number; month: string };
  /** "+ rată 900 lei pe lună, socotită la Credit" for a linked credit. */
  creditNote?: string;
  /** This month's fără vină spend in this space (not in Necesități). */
  guiltFreeThisMonth?: number;
};

type MonthTotal = { year: number; month: number; label: string; total: number };
/** `planned`: a Calendar purchase whose day hasn't come (EventSpend) --
 * listed, but not spent yet. */
type SpaceItem = { id: number | string; item_id?: number | string; space_id?: number | null; type: string; title: string; amount: number | null; currency: string | null; due_at: string | null; planned?: boolean; guilt_free?: boolean };

function monthShort(m: MonthTotal): string {
  return new Date(m.year, m.month, 1).toLocaleDateString("ro-RO", { month: "short" }).replace(".", "");
}

function monthLong(m: MonthTotal): string {
  return capitalize(new Date(m.year, m.month, 1).toLocaleDateString("ro-RO", { month: "long" }));
}

/**
 * Opened from a space's row on the Budget tab -- informational only (no
 * per-space limit since 2026-11-02: every space spends from ONE Necesități
 * envelope): this month's spend by week, the last 4 months and the recent
 * records. Pulls GET /api/budget/spaces/{category}, the same type->space
 * map the Budget tab is built from.
 */
export function BudgetSpaceDetailPage({ category, icon, onBack, pace, creditNote, guiltFreeThisMonth = 0 }: BudgetSpaceDetailPageProps) {
  const router = useRouter();
  const { card, colors, spacing, radius, typography, isDark } = useTheme();
  const kind = category.toLowerCase() as SpaceKind;
  const name = SPACE_KIND_LABEL[kind] ?? category;
  const color = SPACE_IDENTITY_COLORS[kind] ?? colors.onSurface;
  const tint = spaceTextColor(kind, isDark) ?? color;

  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<MonthTotal[]>([]);
  const [items, setItems] = useState<SpaceItem[]>([]);
  const [selected, setSelected] = useState<{ year: number; month: number } | null>(null);
  const [recurringMonthly, setRecurringMonthly] = useState(0);
  // This month's Calendar purchases still ahead -- inside this month's
  // total, shown apart as "planificat".
  const [planned, setPlanned] = useState(0);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    let request = 0;
    const load = async () => {
      const current = ++request;
      try {
        const r = await api.getBudgetSpaceDetail(category);
        if (!mounted || current !== request) return;
        setMonths(r.months || []);
        setItems(r.items || []);
        setRecurringMonthly(r.recurring_monthly || 0);
        setPlanned(r.planned || 0);
      } catch {
      } finally {
        if (mounted && current === request) setLoading(false);
      }
    };
    void load();
    const subscription = DeviceEventEmitter.addListener(REFRESH_EVENT, load);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [category]));

  const thisMonth = months[months.length - 1];
  const lastMonth = months[months.length - 2];
  // Recorded spend of a month: the server total minus the recurring bills
  // (folded into every month) and, for this month, the planned purchases.
  const recordedOf = (m: MonthTotal | undefined) =>
    m ? Math.max(0, m.total - recurringMonthly - (m === thisMonth ? planned : 0)) : 0;

  // This month against last month; null when there's nothing to compare
  // against yet rather than a misleading 0% or infinity.
  // Recorded spend only (recurring bills are the same every month and
  // would just dilute the change; planned purchases aren't spent yet).
  const recordedNow = recordedOf(thisMonth);
  const recordedBefore = recordedOf(lastMonth);
  const monthOverMonth = !thisMonth || !lastMonth || recordedBefore <= 0 ? null : ((recordedNow - recordedBefore) / recordedBefore) * 100;

  const maxTotal = Math.max(1, ...months.map((m) => recordedOf(m)));

  const selectedItems = useMemo(() => {
    if (!selected) return items;
    return items.filter((it) => {
      if (!it.due_at) return false;
      const d = new Date(it.due_at);
      return d.getFullYear() === selected.year && d.getMonth() === selected.month;
    });
  }, [items, selected]);

  // Always the server-computed total (months[].total), never re-summed
  // from `selectedItems` -- recurring bills are folded into that total
  // but never appear as rows, so summing the list would drop them.
  const selectedMonth = selected ? months.find((m) => m.year === selected.year && m.month === selected.month) : thisMonth;
  // The server total folds this space's recurring bills into every
  // month (and this month's planned purchases); on screen "cheltuit" is
  // only what was recorded, the rest listed apart (same rule as Buget).
  const selectedRecorded = recordedOf(selectedMonth);
  const selectedPlanned = selectedMonth && selectedMonth === thisMonth ? planned : 0;

  // ---- This month by week (current month, needs GET /budget's `pace`).
  // Kept without the old dashed "normal" per week: with no per-space
  // limit there's no normal to draw, but WHEN in the month the money went
  // (one big expense vs a steady drip) still reads at a glance. ----
  const showsCurrent = !selected || (!!thisMonth && selected.year === thisMonth.year && selected.month === thisMonth.month);
  const showWeeks = !!pace && !!thisMonth && showsCurrent;
  const paceMonthName = pace ? new Date(Number(pace.month.slice(0, 4)), Number(pace.month.slice(5, 7)) - 1, 1).toLocaleDateString("ro-RO", { month: "long" }) : "";
  const weeks = showWeeks && pace ? weekBars(pace.daily, pace.daysInMonth, pace.today, new Date(Number(pace.month.slice(0, 4)), Number(pace.month.slice(5, 7)) - 1, 1).getDay()) : [];
  const weekMax = Math.max(1, ...weeks.map((w) => w.value));
  const currentWeek = weeks.find((w) => w.when === "current");
  // The 4-month card shows the big amount only when the weekly card
  // doesn't already show this month.
  const showMonthAmount = !showWeeks;

  const toggleMonth = (m: MonthTotal) => {
    const isSame = selected?.year === m.year && selected?.month === m.month;
    setSelected(isSame ? null : { year: m.year, month: m.month });
  };

  return (
    <ScrollView
      testID="budget-space-detail-page"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="budget-space-back" />
      <Identity color={color} kicker="Buget" title={name} info="budget.spaceDetail" />

      {loading ? (
        <ActivityIndicator color={colors.onSurfaceTertiary} />
      ) : (
        <>
          {showWeeks && pace ? (
            <View testID="budget-space-weeks" style={{ ...card, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}>
              <View style={{ gap: 2 }}>
                <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary }}>{`Cheltuit în ${paceMonthName}`}</Text>
                <Text style={{ ...typography.display, color: colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>{`${fmtLei(recordedNow)} lei`}</Text>
                {[
                  recurringMonthly > 0 ? `+ ${fmtLei(recurringMonthly)} lei facturi recurente de plătit` : null,
                  planned > 0 ? `+ ${fmtLei(planned)} lei planificat în Calendar` : null,
                  guiltFreeThisMonth > 0 ? `+ ${fmtLei(guiltFreeThisMonth)} lei fără vină, socotiți separat` : null,
                  creditNote || null,
                ]
                  .filter(Boolean)
                  .map((line) => (
                    <Text key={line!} style={{ ...typography.caption, lineHeight: 18, color: colors.onSurfaceTertiary }}>{line}</Text>
                  ))}
              </View>

              {weeks.length > 0 ? (
                <View style={{ gap: spacing.sm }}>
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={weeks.map((w) => `${w.start}–${w.end}: ${w.when === "future" ? "urmează" : `${fmtLei(w.value)} lei`}`).join("; ")}
                    style={{ flexDirection: "row", gap: spacing.md }}
                  >
                    {weeks.map((w) => {
                      const barH = w.when === "future" ? 6 : Math.max(4, (w.value / weekMax) * 96);
                      return (
                        <View key={w.start} style={{ flex: 1, gap: 6, alignItems: "center" }}>
                          <View style={{ width: "100%", height: 96, justifyContent: "flex-end" }}>
                            <View
                              style={{
                                width: "100%",
                                height: barH,
                                borderRadius: radius.sm,
                                backgroundColor: w.when === "future" ? colors.surfaceTertiary : color,
                                opacity: w.when === "current" ? 0.75 : 1,
                              }}
                            />
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: w.when === "current" ? "600" : "400", color: w.when === "current" ? colors.onSurface : colors.onSurfaceTertiary }}>
                            {`${w.start}–${w.end}`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  {currentWeek ? (
                    <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary }}>
                      {`Săptămâna asta: ${fmtLei(currentWeek.value)} lei.`}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={{ ...card, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
                {showMonthAmount ? (selected && selectedMonth ? monthLong(selectedMonth) : "Luna asta") : selected && selectedMonth && !showsCurrent ? monthLong(selectedMonth) : "Ultimele 4 luni"}
              </Text>
              {showMonthAmount || (selected && !showsCurrent) ? (
              <>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <Text style={{ ...typography.display, color: colors.onSurface }}>{lei(selectedRecorded)}</Text>
              </View>
              {recurringMonthly > 0 ? (
                <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>
                  + {lei(recurringMonthly)} facturi recurente încă neplătite
                </Text>
              ) : null}
              {selectedPlanned > 0 ? (
                <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>
                  + {lei(selectedPlanned)} cumpărături planificate în Calendar
                </Text>
              ) : null}
              </>
              ) : null}
              {!selected && lastMonth ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Luna trecută: {lei(recordedOf(lastMonth))}</Text>
                  {monthOverMonth !== null ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                      <Ionicons
                        name={monthOverMonth > 0 ? "arrow-up" : monthOverMonth < 0 ? "arrow-down" : "remove"}
                        size={12}
                        color={monthOverMonth > 0 ? colors.error : monthOverMonth < 0 ? colors.success : colors.onSurfaceTertiary}
                      />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: monthOverMonth > 0 ? colors.error : monthOverMonth < 0 ? colors.success : colors.onSurfaceTertiary }}>
                        {Math.abs(Math.round(monthOverMonth))}%
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : selected ? (
                <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 }}>{roCount(selectedItems.length, "înregistrare", "înregistrări")}</Text>
              ) : null}
            </View>

            {months.length > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.md, height: 110, paddingTop: spacing.sm }}>
                {months.map((m, i) => {
                  const isSelected = selected ? selected.year === m.year && selected.month === m.month : i === months.length - 1;
                  return (
                    <Pressable
                      key={`${m.year}-${m.month}`}
                      testID={`budget-space-chart-bar-${m.year}-${m.month}`}
                      onPress={() => toggleMonth(m)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${monthLong(m)}, ${lei(recordedOf(m))}`}
                      style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center", gap: 6 }}
                    >
                      <View style={{ width: "100%", height: Math.max(4, (recordedOf(m) / maxTotal) * 78), borderRadius: radius.sm, backgroundColor: isSelected ? color : colors.surfaceTertiary }} />
                      <Text style={{ fontSize: 12, fontWeight: isSelected ? "600" : "400", color: isSelected ? colors.onSurface : colors.onSurfaceTertiary }}>{monthShort(m)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={selected && selectedMonth ? `Înregistrări din ${monthLong(selectedMonth).toLowerCase()}` : "Recente"} />
            {selectedItems.length === 0 ? (
              <View style={{ ...card, borderRadius: radius.card }}>
                <EmptyState icon={icon} message="Nimic înregistrat aici." />
              </View>
            ) : (
              <Group inset={68}>
                {selectedItems.slice(0, 30).map((it) => (
                  <Row
                    key={it.id}
                    testID={`budget-space-item-${it.id}`}
                    onPress={() => router.navigate(todoHref(it) as any)}
                    leading={<IconWell icon={it.type === "custom_event" ? "calendar-outline" : icon} color={color} tint={tint} />}
                    title={todoTitle(it).replace(/^Cumpărături -- /, "")}
                    subtitle={
                      it.due_at
                        ? `${it.planned ? "Planificat pe " : ""}${roDate(it.due_at)}${it.type === "custom_event" ? " · din Calendar" : ""}`
                        : null
                    }
                    trailing={
                      <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
                        <Text style={{ fontSize: 15, fontWeight: it.planned ? "400" : "600", color: it.planned || it.guilt_free ? colors.onSurfaceTertiary : colors.onSurface }}>{lei(it.amount ?? 0)}</Text>
                        {it.guilt_free ? <GuiltFreeChip /> : null}
                      </View>
                    }
                  />
                ))}
              </Group>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}
