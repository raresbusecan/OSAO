import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction, confirmAction } from "@/lib/confirm";
import { SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, SPACE_BUTTON_FILL, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { TopBar, Identity, SectionHeader, Group, Row, IconWell, Button, Field, EmptyState, readableOn } from "@/components/ui/primitives";
import { PressableScale } from "@/components/ui/PressableScale";
import { capitalize, lei, roCount, roDate } from "@/lib/format";

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
};

type MonthTotal = { year: number; month: number; label: string; total: number };
type SpaceItem = { id: number | string; type: string; title: string; amount: number | null; currency: string | null; due_at: string | null };

// Three fixed buffers over the 3-month spending average -- "how much
// headroom over what I actually spend here", not the overall savings
// goal. Echilibrat is the sane middle default.
const BUDGET_PRESETS: { key: string; label: string; pct: number; hint: string }[] = [
  { key: "conservative", label: "Conservator", pct: 0.05, hint: "Marjă mică de siguranță" },
  { key: "balanced", label: "Echilibrat", pct: 0.2, hint: "Recomandat" },
  { key: "flexible", label: "Flexibil", pct: 0.35, hint: "Loc pentru luni neprevăzute" },
];

function roundToTen(n: number): number {
  return Math.round(n / 10) * 10;
}

function monthShort(m: MonthTotal): string {
  return new Date(m.year, m.month, 1).toLocaleDateString("ro-RO", { month: "short" }).replace(".", "");
}

function monthLong(m: MonthTotal): string {
  return capitalize(new Date(m.year, m.month, 1).toLocaleDateString("ro-RO", { month: "long" }));
}

/**
 * Opened from a space's row on the Budget tab -- that space's spend over
 * the last 4 months, its budget (presets over the real average, or a
 * manual amount) and its recent records. Pulls GET
 * /api/budget/spaces/{category}, the same type->space map the Budget
 * tab is built from.
 */
export function BudgetSpaceDetailPage({ category, icon, monthlyLimit, onBack, onLimitSaved }: BudgetSpaceDetailPageProps) {
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
  // null = the saved budget matches no preset (manual value, or nothing
  // saved yet). Synced to what's actually saved by the effect below --
  // reopening the page reflects the real last decision, not a default.
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [localLimit, setLocalLimit] = useState(monthlyLimit);
  const [savingPreset, setSavingPreset] = useState(false);
  const [manualAmount, setManualAmount] = useState(monthlyLimit ? String(monthlyLimit) : "");
  const [savingManual, setSavingManual] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recurringMonthly, setRecurringMonthly] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await api.getBudgetSpaceDetail(category);
        if (!mounted) return;
        setMonths(r.months || []);
        setItems(r.items || []);
        setRecurringMonthly(r.recurring_monthly || 0);
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

  // This month against last month; null when there's nothing to compare
  // against yet rather than a misleading 0% or infinity.
  const monthOverMonth = useMemo(() => {
    if (!thisMonth || !lastMonth || lastMonth.total <= 0) return null;
    return ((thisMonth.total - lastMonth.total) / lastMonth.total) * 100;
  }, [thisMonth, lastMonth]);

  const maxTotal = Math.max(1, ...months.map((m) => m.total));

  // months is always the 4 most recent (oldest first, current last) --
  // the same 3-whole-past-months window as the tab's avg_last_3_months.
  const avgLast3 = months.length === 4 ? (months[0].total + months[1].total + months[2].total) / 3 : 0;

  // A new space has no 3 full past months yet -- falls back to last
  // month, then this month, so presets work early. Only with nothing
  // ever spent does this hit 0 and leave just the manual field.
  const budgetBase = avgLast3 > 0 ? avgLast3 : lastMonth?.total || thisMonth?.total || 0;
  const budgetBaseLabel = avgLast3 > 0 ? "media ultimelor 3 luni" : lastMonth?.total ? "luna trecută" : thisMonth?.total ? "luna asta" : null;

  const presetAmount = (pct: number) => roundToTen(budgetBase * (1 + pct));

  useEffect(() => {
    if (!localLimit || budgetBase <= 0) {
      setSelectedPreset(null);
      return;
    }
    const match = BUDGET_PRESETS.find((p) => presetAmount(p.pct) === localLimit);
    setSelectedPreset(match ? match.key : null);
    // presetAmount is derived fresh from budgetBase each render; budgetBase is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localLimit, budgetBase]);

  const saveLimitPreset = async () => {
    const preset = BUDGET_PRESETS.find((p) => p.key === selectedPreset);
    if (!preset) return;
    const amount = presetAmount(preset.pct);
    setSavingPreset(true);
    try {
      await api.saveBudgetLimit({ category, monthly_limit: amount });
      setLocalLimit(amount);
      setManualAmount(String(amount));
      onLimitSaved?.();
    } catch (error: any) {
      notifyAction("Nu am putut salva bugetul", error?.message || "A apărut o eroare.");
    } finally {
      setSavingPreset(false);
    }
  };

  const saveManualAmount = async () => {
    const amount = Number(manualAmount.replace(",", ".")) || 0;
    if (amount <= 0) return;
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

  const selectedPresetObj = BUDGET_PRESETS.find((p) => p.key === selectedPreset) ?? null;
  const presetIsSaved = !!selectedPresetObj && presetAmount(selectedPresetObj.pct) === localLimit;

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
  const selectedTotal = selectedMonth?.total ?? 0;

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
      <Identity color={color} kicker="Buget" title={name} />

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
                <Text style={{ ...typography.display, color: colors.onSurface }}>{lei(selectedTotal)}</Text>
                {localLimit ? <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>din {lei(localLimit)}</Text> : null}
              </View>
              {!selected && lastMonth ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Luna trecută: {lei(lastMonth.total)}</Text>
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
                      accessibilityLabel={`${monthLong(m)}, ${lei(m.total)}`}
                      style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center", gap: 6 }}
                    >
                      <View style={{ width: "100%", height: Math.max(4, (m.total / maxTotal) * 78), borderRadius: 6, backgroundColor: isSelected ? color : colors.surfaceTertiary }} />
                      <Text style={{ fontSize: 12, fontWeight: isSelected ? "600" : "400", color: isSelected ? colors.onSurface : colors.onSurfaceTertiary }}>{monthShort(m)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Budget -- never gated on 3 months of history: presets show
              once there's SOME base to take a % of; with nothing spent
              yet only the manual amount makes sense. */}
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Bugetul lunar" />
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary, paddingHorizontal: 4 }}>
              {budgetBaseLabel
                ? `Pornind de la ${budgetBaseLabel}: ${lei(Math.round(budgetBase))}.`
                : "Niciun istoric aici încă. Pune o sumă mai jos."}
            </Text>

            {budgetBase > 0 ? (
              <Group inset={52}>
                {BUDGET_PRESETS.map((preset) => {
                  const amount = presetAmount(preset.pct);
                  const isSelected = selectedPreset === preset.key;
                  return (
                    <PressableScale
                      key={preset.key}
                      testID={`budget-preset-${preset.key}`}
                      onPress={() => setSelectedPreset(preset.key)}
                      scaleTo={1}
                      pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${preset.label}, ${lei(amount)}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 64, backgroundColor: colors.surfaceSecondary }}
                    >
                      <View
                        style={{
                          width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
                          backgroundColor: isSelected ? color : "transparent",
                          borderWidth: isSelected ? 0 : 2, borderColor: colors.borderStrong,
                        }}
                      >
                        {isSelected ? <Ionicons name="checkmark" size={14} color={readableOn(color)} /> : null}
                      </View>
                      <View style={{ flex: 1, paddingVertical: 10 }}>
                        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{preset.label}</Text>
                        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 }}>+{Math.round(preset.pct * 100)}%, {preset.hint.toLowerCase()}</Text>
                      </View>
                      <Text style={{ fontSize: 15, fontWeight: "600", color: isSelected ? tint : colors.onSurface }}>{lei(amount)}</Text>
                    </PressableScale>
                  );
                })}
              </Group>
            ) : null}

            {budgetBase > 0 && selectedPresetObj && !presetIsSaved ? (
              <Button
                testID="budget-preset-save"
                label={`Setează ${lei(presetAmount(selectedPresetObj.pct))} pe lună`}
                tone={buttonFill}
                onPress={saveLimitPreset}
                loading={savingPreset}
              />
            ) : null}

            {/* Manual amount -- always here: presets are a shortcut,
                not the only way in. */}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Field
                  testID="budget-manual-input"
                  label={budgetBase > 0 ? "Sau o sumă a ta" : "Suma lunară"}
                  value={manualAmount}
                  onChangeText={setManualAmount}
                  placeholder="ex. 1000"
                  keyboardType="decimal-pad"
                  suffix="lei"
                  tone={color}
                />
              </View>
              <Button
                testID="budget-manual-save"
                label="Salvează"
                variant="secondary"
                onPress={saveManualAmount}
                loading={savingManual}
                disabled={!manualAmount.trim() || Number(manualAmount.replace(",", ".")) === localLimit}
              />
            </View>

            {localLimit ? (
              <Button testID="budget-delete" variant="ghost" icon="trash-outline" label="Șterge bugetul" onPress={deleteBudget} loading={deleting} />
            ) : null}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={selected && selectedMonth ? `Înregistrări din ${monthLong(selectedMonth).toLowerCase()}` : "Recente"} />
            {recurringMonthly > 0 ? (
              <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary, paddingHorizontal: 4 }}>
                Totalul include {lei(recurringMonthly)} pe lună din plăți recurente, care nu apar ca rânduri aici.
              </Text>
            ) : null}
            {selectedItems.length === 0 ? (
              <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card }}>
                <EmptyState icon={icon} message="Nimic înregistrat aici." />
              </View>
            ) : (
              <Group inset={68}>
                {selectedItems.slice(0, 30).map((it) => (
                  <Row
                    key={it.id}
                    leading={<IconWell icon={icon} color={color} tint={tint} />}
                    title={it.title.replace(/^Cumpărături -- /, "")}
                    subtitle={it.due_at ? roDate(it.due_at) : null}
                    trailing={<Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(it.amount ?? 0)}</Text>}
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
