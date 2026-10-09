import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction, confirmAction } from "@/lib/confirm";
import { SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, SPACE_BUTTON_FILL, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { TopBar, Identity, SectionHeader, Group, Row, IconWell, Button, Field, EmptyState, hexToRgba } from "@/components/ui/primitives";
import { PressableScale } from "@/components/ui/PressableScale";
import { capitalize, lei, roCount, roDate } from "@/lib/format";
import { GuiltFreeChip } from "@/components/dashboard/GuiltFree";
import { jarAmounts, parseAmount, ENVELOPE_TOLERANCE, type BudgetPlan } from "@/lib/budget/plan";

export type BudgetSpaceDetailPageProps = {
  /** The budget KEY ("Car", "Home"...) -- what the API takes; the page
   * shows SPACE_KIND_LABEL's Romanian name instead. */
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
  monthlyLimit?: number;
  onBack: () => void;
  /** Called after this page saves, changes or deletes the limit, so the
   * Budget tab (which this page doesn't own) picks it up on back. */
  onLimitSaved?: () => void;
  /** The income plan, or null (then: a plain amount, no envelope). */
  plan?: BudgetPlan | null;
  /** GET /budget's `suggested[category]`, null without a plan. */
  suggested?: number | null;
  /** Σ the OTHER spaces' limits -- for the over-envelope warning. */
  otherLimitsTotal?: number;
};

type MonthTotal = { year: number; month: number; label: string; total: number };
/** `planned`: a Calendar purchase whose day hasn't come (EventSpend) --
 * listed, but not spent yet. */
type SpaceItem = { id: number | string; type: string; title: string; amount: number | null; currency: string | null; due_at: string | null; planned?: boolean; guilt_free?: boolean };

/** "Partea {X} din necesități" -- the space name in the genitive. */
const NAME_GENITIVE: Record<string, string> = { car: "Mașinii", home: "Casei", grocery: "Cumpărăturilor", expenses: "Cheltuielilor" };

function monthShort(m: MonthTotal): string {
  return new Date(m.year, m.month, 1).toLocaleDateString("ro-RO", { month: "short" }).replace(".", "");
}

function monthLong(m: MonthTotal): string {
  return capitalize(new Date(m.year, m.month, 1).toLocaleDateString("ro-RO", { month: "long" }));
}

/**
 * Opened from a space's row on the Budget tab -- that space's spend over
 * the last 4 months, its budget (one amount: its share of Necesități when
 * an income plan exists, with a "Sugerat" pill) and its recent records. Pulls GET
 * /api/budget/spaces/{category}, the same type->space map the Budget
 * tab is built from.
 */
export function BudgetSpaceDetailPage({ category, icon, monthlyLimit, onBack, onLimitSaved, plan = null, suggested = null, otherLimitsTotal = 0 }: BudgetSpaceDetailPageProps) {
  const { colors, spacing, radius, typography, isDark } = useTheme();
  const kind = category.toLowerCase() as SpaceKind;
  const name = SPACE_KIND_LABEL[kind] ?? category;
  const color = SPACE_IDENTITY_COLORS[kind] ?? colors.onSurface;
  const tint = spaceTextColor(kind, isDark) ?? color;
  const buttonFill = SPACE_BUTTON_FILL[kind];

  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<MonthTotal[]>([]);
  const [items, setItems] = useState<SpaceItem[]>([]);
  const [selected, setSelected] = useState<{ year: number; month: number } | null>(null);
  const [localLimit, setLocalLimit] = useState(monthlyLimit);
  const [manualAmount, setManualAmount] = useState(monthlyLimit != null ? String(monthlyLimit) : "");
  const [savingManual, setSavingManual] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recurringMonthly, setRecurringMonthly] = useState(0);
  // This month's Calendar purchases still ahead -- inside this month's
  // total, shown apart as "planificat".
  const [planned, setPlanned] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await api.getBudgetSpaceDetail(category);
        if (!mounted) return;
        setMonths(r.months || []);
        setItems(r.items || []);
        setRecurringMonthly(r.recurring_monthly || 0);
        setPlanned(r.planned || 0);
      } catch {
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [category]);

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

  // months is always the 4 most recent (oldest first, current last) --
  // the same 3-whole-past-months window as the tab's avg_last_3_months.
  const avgLast3 = months.length === 4 ? (months[0].total + months[1].total + months[2].total) / 3 : 0;

  // A new space has no 3 full past months yet -- falls back to last
  // month, then this month -- the no-plan hint. Only with nothing
  // ever spent does this hit 0.
  const budgetBase = avgLast3 > 0 ? avgLast3 : lastMonth?.total || thisMonth?.total || 0;
  const budgetBaseLabel = avgLast3 > 0 ? "media ultimelor 3 luni" : lastMonth?.total ? "luna trecută" : thisMonth?.total ? "luna asta" : null;

  const saveManualAmount = async () => {
    const amount = parseAmount(manualAmount);
    if (!(amount > 0)) return;
    setSavingManual(true);
    try {
      await api.saveBudgetLimit({ category, monthly_limit: amount });
      setLocalLimit(amount);
      onLimitSaved?.();
    } catch (error: any) {
      notifyAction("Nu am putut salva bugetul", error?.message || "A apărut o eroare.");
    } finally {
      setSavingManual(false);
    }
  };

  const deleteBudget = async () => {
    const confirmed = await confirmAction("Ștergi bugetul?", `${name} rămâne fără limită lunară. Cheltuielile nu se șterg.`, { confirmLabel: "Șterge", destructive: true });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await api.deleteBudgetLimit(category);
      setLocalLimit(undefined);
      setManualAmount("");
      onLimitSaved?.();
    } catch (error: any) {
      notifyAction("Nu am putut șterge bugetul", error?.message || "A apărut o eroare.");
    } finally {
      setDeleting(false);
    }
  };

  // ---- Budget as a share of Necesități ----
  const envelope = plan ? jarAmounts(plan.monthly_income, plan.split).needs : 0;
  const typed = parseAmount(manualAmount);
  const typedOk = Number.isFinite(typed) && typed > 0;
  // Under 1 leu over doesn't count (a fractional envelope can't be matched
  // by whole-lei limits -- see ENVELOPE_TOLERANCE).
  const overRaw = plan && typedOk ? otherLimitsTotal + typed - envelope : 0;
  const overEnvelope = overRaw >= ENVELOPE_TOLERANCE ? Math.round(overRaw) : 0;

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
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
                {selected && selectedMonth ? monthLong(selectedMonth) : "Luna asta"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <Text style={{ ...typography.display, color: colors.onSurface }}>{lei(selectedRecorded)}</Text>
                {localLimit != null ? <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>din {lei(localLimit)}</Text> : null}
              </View>
              {recurringMonthly > 0 ? (
                <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>
                  + {lei(recurringMonthly)} facturi recurente încă neplătite, socotite în buget
                  {localLimit != null && selectedRecorded <= localLimit && selectedRecorded + recurringMonthly > localLimit
                    ? `. Depășesc bugetul cu ${lei(Math.round(selectedRecorded + recurringMonthly - localLimit))}.`
                    : ""}
                </Text>
              ) : null}
              {selectedPlanned > 0 ? (
                <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>
                  + {lei(selectedPlanned)} cumpărături planificate în Calendar, socotite în buget
                </Text>
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
                      <View style={{ width: "100%", height: Math.max(4, (recordedOf(m) / maxTotal) * 78), borderRadius: 6, backgroundColor: isSelected ? color : colors.surfaceTertiary }} />
                      <Text style={{ fontSize: 12, fontWeight: isSelected ? "600" : "400", color: isSelected ? colors.onSurface : colors.onSurfaceTertiary }}>{monthShort(m)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Budget -- one amount. With an income plan it's this space's
              share of Necesități (caption: % of needs / income, a
              "Sugerat" pill from GET /budget's suggested split, a warning
              when all spaces together pass the envelope -- saving is
              still allowed). Without a plan, a plain monthly amount. */}
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Bugetul lunar" />
            <Field
              testID="budget-manual-input"
              label={plan ? `Partea ${NAME_GENITIVE[kind] ?? name} din necesități (${lei(Math.round(envelope))})` : "Suma lunară"}
              value={manualAmount}
              onChangeText={setManualAmount}
              placeholder="ex. 1000"
              keyboardType="decimal-pad"
              suffix="lei"
              big
              tone={color}
              hint={
                plan && typedOk && envelope > 0
                  ? `${Math.round((typed / envelope) * 100)}% din necesități · ${Math.round((typed / plan.monthly_income) * 100)}% din venit`
                  : null
              }
            />
            {plan && suggested != null && suggested > 0 ? (
              <PressableScale
                testID="budget-suggested"
                onPress={() => setManualAmount(String(Math.round(suggested)))}
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel={`Folosește suma sugerată, ${lei(suggested)}`}
                style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: hexToRgba(color, 0.12) }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: tint }}>Sugerat: {lei(Math.round(suggested))}</Text>
                <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>· după cât cheltuiești aici</Text>
              </PressableScale>
            ) : null}
            {!plan ? (
              <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary, paddingHorizontal: 4 }}>
                {budgetBaseLabel ? `Pornind de la ${budgetBaseLabel}: ${lei(Math.round(budgetBase))}. ` : ""}Adaugă venitul în Buget și primești o sumă sugerată.
              </Text>
            ) : null}
            {overEnvelope > 0 ? (
              <Text testID="budget-over-envelope" accessibilityLiveRegion="polite" style={{ fontSize: 13, lineHeight: 18, color: colors.warning, paddingHorizontal: 4 }}>
                Cu {lei(Math.round(typed))}, spațiile trec de necesități cu {lei(overEnvelope)}. Ia din alt spațiu sau mărește procentul.
              </Text>
            ) : null}
            <Button
              testID="budget-manual-save"
              label={typedOk ? `Salvează ${lei(Math.round(typed * 100) / 100)} pe lună` : "Salvează"}
              tone={buttonFill}
              onPress={saveManualAmount}
              loading={savingManual}
              disabled={!typedOk || typed === localLimit}
            />
            {/* A 0 limit is still a set limit -- deletable. */}
            {localLimit != null ? (
              <Button testID="budget-delete" variant="ghost" icon="trash-outline" label="Șterge bugetul" onPress={deleteBudget} loading={deleting} />
            ) : null}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={selected && selectedMonth ? `Înregistrări din ${monthLong(selectedMonth).toLowerCase()}` : "Recente"} />
            {selectedItems.length === 0 ? (
              <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card }}>
                <EmptyState icon={icon} message="Nimic înregistrat aici." />
              </View>
            ) : (
              <Group inset={68}>
                {selectedItems.slice(0, 30).map((it) => (
                  <Row
                    key={it.id}
                    leading={<IconWell icon={it.type === "custom_event" ? "calendar-outline" : icon} color={color} tint={tint} />}
                    title={it.title.replace(/^Cumpărături -- /, "")}
                    subtitle={
                      it.due_at
                        ? `${it.planned ? "Planificat pe " : ""}${roDate(it.due_at)}${it.type === "custom_event" ? " · din Calendar" : ""}`
                        : null
                    }
                    trailing={
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
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
