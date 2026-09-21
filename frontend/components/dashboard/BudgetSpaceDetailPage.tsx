import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction, confirmAction } from "@/lib/confirm";

export type BudgetSpaceDetailPageProps = {
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
  monthlyLimit?: number;
  onBack: () => void;
  /** Called after this page's own "BUGET" section saves, changes or
   * deletes the limit (preset, manual amount or delete), so the Budget
   * tab's ring cards -- which this page doesn't own -- pick it up once
   * the user goes back. Setting a budget is entirely self-contained
   * here now, there's no separate edit sheet to open. */
  onLimitSaved?: () => void;
};

type MonthTotal = { year: number; month: number; label: string; total: number };
type SpaceItem = { id: number | string; type: string; title: string; amount: number | null; currency: string | null; due_at: string | null };

// Three fixed buffers over the 3-month spending average -- not a
// generic "savings goal" (that's the separate, single overall target
// on the Budget tab itself); this is specifically "how much headroom
// over what I actually spend here". Percentages picked so Conservator
// stays close to actual history and Flexibil comfortably covers a
// spike month, with Echilibrat as the sane middle default.
const BUDGET_PRESETS: { key: string; label: string; pct: number; hint: string }[] = [
  { key: "conservative", label: "Conservator", pct: 0.05, hint: "marjă mică de siguranță" },
  { key: "balanced", label: "Echilibrat", pct: 0.2, hint: "recomandat" },
  { key: "flexible", label: "Flexibil", pct: 0.35, hint: "loc pentru luni neprevăzute" },
];

function roundToTen(n: number): number {
  return Math.round(n / 10) * 10;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

/**
 * Opened by tapping a space's ring card on the Budget tab -- a real
 * "this space's spending" section instead of just editing the limit
 * number. Pulls from GET /api/budget/spaces/{category}, which uses the
 * exact same type->space-label map the ring itself is built from, so
 * there's no per-space special-casing here (unlike Car's own
 * CarExpensesPage or the standalone Expenses space's own
 * ExpensesDetailPage, both of which stay untouched -- this is a
 * separate, Budget-owned view, not a deep link into either).
 */
export function BudgetSpaceDetailPage({ category, icon, monthlyLimit, onBack, onLimitSaved }: BudgetSpaceDetailPageProps) {
  const { colors, spacing, radius } = useTheme();

  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<MonthTotal[]>([]);
  const [items, setItems] = useState<SpaceItem[]>([]);
  const [selected, setSelected] = useState<{ year: number; month: number } | null>(null);
  // null = the saved budget doesn't match any preset's amount (a manual
  // custom value, or nothing saved yet) -- no preset should look picked
  // in that case. Synced to whatever's actually saved by the effect
  // below, not defaulted to "balanced": the whole point is that
  // reopening this page reflects the real last decision, not a guess.
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

  // "Grad de comparație" -- how this month is trending against last
  // month, not just a bare total. null when there's nothing to compare
  // against yet (no data last month) rather than a misleading 0%/∞.
  const monthOverMonth = useMemo(() => {
    if (!thisMonth || !lastMonth || lastMonth.total <= 0) return null;
    return ((thisMonth.total - lastMonth.total) / lastMonth.total) * 100;
  }, [thisMonth, lastMonth]);

  const maxTotal = Math.max(1, ...months.map((m) => m.total));

  // months is always the 4 most recent (oldest first, current last) --
  // the same 3-whole-past-months window the Budget tab's own
  // avg_last_3_months already uses, just derived here from what this
  // page already fetched instead of a second field on the API.
  const avgLast3 = months.length === 4 ? (months[0].total + months[1].total + months[2].total) / 3 : 0;

  // A brand-new app/space has no 3 full past months yet -- falls back
  // to last month, then this month, so presets still have SOMETHING to
  // work from well before the 3-month average is real. Only when
  // literally nothing has ever been spent here does this hit 0, and
  // the presets grid gets skipped in favor of the manual field alone.
  const budgetBase = avgLast3 > 0 ? avgLast3 : lastMonth?.total || thisMonth?.total || 0;
  const budgetBaseLabel = avgLast3 > 0 ? "Media ultimelor 3 luni" : lastMonth?.total ? "Luna trecută" : thisMonth?.total ? "Luna asta" : null;

  const presetAmount = (pct: number) => roundToTen(budgetBase * (1 + pct));

  // Reflect the actual saved limit's preset, every time either changes
  // -- on first load (once budgetBase is known) and again right after
  // a save, so what's highlighted always matches what's really stored,
  // never a stale default.
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
    const confirmed = await confirmAction(
      "Remove limit",
      `Remove the monthly budget for "${category}"?`,
      { confirmLabel: "Remove", destructive: true },
    );
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

  const selectedItems = useMemo(() => {
    if (!selected) return items;
    return items.filter((it) => {
      if (!it.due_at) return false;
      const d = new Date(it.due_at);
      return d.getFullYear() === selected.year && d.getMonth() === selected.month;
    });
  }, [items, selected]);

  // Always the server-computed total for that month (months[].total),
  // never re-summed from `selectedItems` -- a recurring bill is folded
  // into that total but never appears as a row in `items` (see
  // recurring_monthly below), so summing the filtered list here used to
  // silently drop it the moment a month got tapped, while the default
  // (untapped) view showed the correct, higher number. Both now agree.
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
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 150 }}
    >
      {/* HEADER */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl }}>
        <Pressable
          testID="budget-space-back"
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
          <Ionicons name={icon} size={20} color={colors.onSurface} />
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 }}>{category}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.onSurfaceTertiary} />
      ) : (
        <>
          {/* TOTAL + comparison */}
          <View style={{ marginBottom: spacing.xl }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.6 }}>
                {selectedTotal.toLocaleString("en-US")}
              </Text>
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
                RON{localLimit ? ` / ${localLimit.toLocaleString("en-US")} RON` : ""}
              </Text>
            </View>

            {!selected && lastMonth ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
                  Luna trecută: {lastMonth.total.toLocaleString("en-US")} RON
                </Text>
                {monthOverMonth !== null ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Ionicons
                      name={monthOverMonth > 0 ? "arrow-up" : monthOverMonth < 0 ? "arrow-down" : "remove"}
                      size={11}
                      color={monthOverMonth > 0 ? colors.error : monthOverMonth < 0 ? colors.success : colors.onSurfaceTertiary}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: monthOverMonth > 0 ? colors.error : monthOverMonth < 0 ? colors.success : colors.onSurfaceTertiary,
                      }}
                    >
                      {Math.abs(Math.round(monthOverMonth))}%
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : selected ? (
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 4 }}>
                {months.find((m) => m.year === selected.year && m.month === selected.month)?.label} · {selectedItems.length} înregistrări
              </Text>
            ) : null}
          </View>

          {/* TREND CHART */}
          {months.length > 0 ? (
            <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg, marginBottom: spacing.xl }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 100, gap: spacing.md }}>
                {months.map((m) => {
                  const isSelected = selected?.year === m.year && selected?.month === m.month;
                  const barHeight = Math.max(6, (m.total / maxTotal) * 90);
                  return (
                    <Pressable
                      key={`${m.year}-${m.month}`}
                      testID={`budget-space-chart-bar-${m.year}-${m.month}`}
                      onPress={() => toggleMonth(m)}
                      accessibilityRole="button"
                      accessibilityLabel={`${m.label}, ${m.total} RON`}
                      style={{ flex: 1, alignItems: "center", gap: 6 }}
                    >
                      <View
                        style={{
                          width: "100%",
                          height: barHeight,
                          borderRadius: 6,
                          backgroundColor: isSelected ? colors.onSurface : colors.surfaceTertiary,
                          alignItems: "center",
                          justifyContent: "flex-start",
                        }}
                      >
                        {isSelected ? (
                          <Text style={{ fontSize: 10, fontWeight: "800", color: colors.surface, marginTop: 6 }}>
                            {m.total.toLocaleString("en-US")}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 10.5, fontWeight: isSelected ? "800" : "600", color: isSelected ? colors.onSurface : colors.onSurfaceTertiary }}>
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* BUDGET -- always accessible, never gated on 3 months of
              history: presets only show once there's SOME base (this or
              last month, falling back from the 3-month average) to take
              a % of; with truly nothing spent yet, only the manual field
              below makes sense, and that's still right here. */}
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1, color: colors.onSurfaceTertiary, marginBottom: 10 }}>
              BUGET
            </Text>

            {budgetBaseLabel ? (
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, marginBottom: spacing.md }}>
                {budgetBaseLabel}: <Text style={{ fontWeight: "700", color: colors.onSurface }}>{Math.round(budgetBase).toLocaleString("en-US")} RON</Text>
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, marginBottom: spacing.md }}>
                Niciun istoric de cheltuieli aici încă -- setează o sumă manual mai jos.
              </Text>
            )}

            {budgetBase > 0 ? (
              <>
                <View style={{ gap: spacing.sm }}>
                  {BUDGET_PRESETS.map((preset) => {
                    const amount = presetAmount(preset.pct);
                    const isSelected = selectedPreset === preset.key;
                    return (
                      <Pressable
                        key={preset.key}
                        testID={`budget-preset-${preset.key}`}
                        onPress={() => setSelectedPreset(preset.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${preset.label}, ${amount} RON`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing.md,
                          backgroundColor: "transparent",
                          borderWidth: isSelected ? 1.5 : 1,
                          borderColor: isSelected ? colors.success : colors.border,
                          borderRadius: radius.sm,
                          paddingHorizontal: spacing.lg,
                          paddingVertical: 14,
                        }}
                      >
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isSelected ? colors.success : "transparent",
                            borderWidth: isSelected ? 0 : 2,
                            borderColor: colors.border,
                          }}
                        >
                          {isSelected ? <Ionicons name="checkmark" size={13} color={colors.onBrandPrimary} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: isSelected ? colors.success : colors.onSurface }}>
                            {preset.label}
                          </Text>
                          <Text style={{ fontSize: 11, color: isSelected ? colors.success : colors.onSurfaceTertiary, marginTop: 1 }}>
                            +{Math.round(preset.pct * 100)}% peste bază · {preset.hint}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: isSelected ? colors.success : colors.onSurface }}>
                          {amount.toLocaleString("en-US")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {selectedPresetObj ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg, marginTop: spacing.md }}>
                    <Ionicons name="trending-up-outline" size={18} color={colors.success} />
                    <Text style={{ fontSize: 12.5, color: colors.onSurfaceTertiary, flex: 1 }}>
                      Economisești până la{" "}
                      <Text style={{ fontWeight: "700", color: colors.success }}>
                        {(presetAmount(selectedPresetObj.pct) - Math.round(budgetBase)).toLocaleString("en-US")} RON/lună
                      </Text>{" "}
                      dacă rămâi la nivelul obișnuit de cheltuieli.
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  testID="budget-preset-save"
                  onPress={saveLimitPreset}
                  disabled={savingPreset || !selectedPresetObj}
                  accessibilityRole="button"
                  accessibilityLabel={selectedPresetObj ? `Set budget to ${presetAmount(selectedPresetObj.pct)} RON` : "Choose a preset first"}
                  accessibilityState={{ busy: savingPreset, disabled: savingPreset || !selectedPresetObj }}
                  style={{
                    backgroundColor: colors.brandPrimary,
                    opacity: savingPreset || !selectedPresetObj ? 0.5 : 1,
                    borderRadius: radius.sm,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginTop: spacing.md,
                  }}
                >
                  {savingPreset ? (
                    <ActivityIndicator color={colors.onBrandPrimary} />
                  ) : (
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onBrandPrimary }}>
                      {selectedPresetObj
                        ? `Setează bugetul la ${presetAmount(selectedPresetObj.pct).toLocaleString("en-US")} RON`
                        : "Alege una dintre opțiunile de mai sus"}
                    </Text>
                  )}
                </Pressable>
              </>
            ) : null}

            {/* Manual amount -- always here, never behind a separate
                sheet: presets are a shortcut, not the only way in. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: budgetBase > 0 ? spacing.lg : 0 }}>
              <TextInput
                testID="budget-manual-input"
                value={manualAmount}
                onChangeText={setManualAmount}
                placeholder="Sau introdu o sumă manual (RON)"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="decimal-pad"
                style={{ flex: 1, minWidth: 0, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 15 }}
              />
              <Pressable
                testID="budget-manual-save"
                onPress={saveManualAmount}
                disabled={savingManual || !manualAmount.trim()}
                accessibilityRole="button"
                accessibilityLabel="Save budget"
                accessibilityState={{ busy: savingManual, disabled: savingManual || !manualAmount.trim() }}
                style={{ backgroundColor: colors.brandPrimary, opacity: savingManual || !manualAmount.trim() ? 0.5 : 1, paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" }}
              >
                {savingManual ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                  <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 }}>Salvează</Text>
                )}
              </Pressable>
            </View>

            {localLimit ? (
              <Pressable
                testID="budget-delete"
                onPress={deleteBudget}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Remove budget"
                style={{ minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.sm }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.error }}>
                  {deleting ? "Se șterge..." : "Șterge bugetul"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* LIST */}
          <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 1, color: colors.onSurfaceTertiary, marginBottom: 10 }}>
            {selected ? "ÎNREGISTRĂRI" : "RECENT"}
          </Text>

          {recurringMonthly > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.sm }}>
              <Ionicons name="repeat-outline" size={15} color={colors.onSurfaceTertiary} />
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, flex: 1 }}>
                + {recurringMonthly.toLocaleString("en-US")} RON recurente incluse mai sus, în fiecare lună -- nu apar ca înregistrare individuală aici.
              </Text>
            </View>
          ) : null}

          {selectedItems.length === 0 ? (
            <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg }}>
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Nimic înregistrat aici.</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
              {selectedItems.slice(0, 30).map((it, index) => (
                <View
                  key={it.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    borderBottomWidth: index === Math.min(selectedItems.length, 30) - 1 ? 0 : StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Ionicons name={icon} size={16} color={colors.onSurfaceTertiary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
                      {it.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 }}>{formatDate(it.due_at)}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>
                    {(it.amount ?? 0).toLocaleString("en-US")}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
