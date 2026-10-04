import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, DeviceEventEmitter } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { useFocusEffect } from "expo-router";
import { notifyAction } from "@/lib/confirm";
import { RingProgress } from "@/components/dashboard/RingProgress";
import { BudgetSpaceDetailPage } from "@/components/dashboard/BudgetSpaceDetailPage";
import { profileFromSpace, detectSpaceType, SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { BudgetOverviewPage } from "@/components/dashboard/BudgetOverviewPage";
import { severityColor, budgetSeverity } from "@/lib/statusColors";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { PageTitle, SectionHeader, Group, Row, IconWell, Button, Field, EmptyState } from "@/components/ui/primitives";
import { motion } from "@/lib/motion";
import { capitalize, lei, roDate, roNumber } from "@/lib/format";

type BudgetLimit = { category: string; monthly_limit: number; spent: number };
type SavingsGoal = { target_amount: number; current_amount: number; target_date: string | null } | null;
type SpaceKindMeta = { kind: SpaceKind; label: string; icon: keyof typeof Ionicons.glyphMap };

// The same type->space label map Item::SPENDING_TYPE_SPACE uses on the
// backend for the Monthly Expenses breakdown -- a budget limit's
// `category` is one of these labels (English KEYS, never shown -- the
// screen shows SPACE_KIND_LABEL's Romanian name), so "spent" always
// means "every real record from that space".
const SPACE_KIND_META: Partial<Record<SpaceKind, { label: string; icon: keyof typeof Ionicons.glyphMap }>> = {
  car: { label: "Car", icon: "car-outline" },
  home: { label: "Home", icon: "home-outline" },
  grocery: { label: "Grocery", icon: "cart-outline" },
  expenses: { label: "Expenses", icon: "receipt-outline" },
};

const FREQUENCY_LABEL: Record<string, string> = { weekly: "săptămânal", monthly: "lunar", yearly: "anual" };

// Every grocery_trip's title is literally "Cumpărături -- {listName}"
// (see groceryTripToItemBody) -- the row already says which space it
// is, so that fixed prefix is stripped for display only.
function biggestExpenseTitle(title: string): string {
  return title.replace(/^Cumpărături -- /, "");
}

// Fraction of the current month already elapsed (0-1) -- what spending
// "should" be at today if a budget were spread evenly across the month.
function monthProgress(): number {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / daysInMonth;
}

// How many percentage points ahead of pace a space is -- e.g. 67% of
// the month gone but 80% of the budget spent is +13. Null once already
// over budget (that's its own, more urgent state) or under 10 points.
function paceDelta(ratio: number): number | null {
  if (ratio >= 1) return null;
  const delta = (ratio - monthProgress()) * 100;
  return delta > 10 ? Math.round(delta) : null;
}

export default function BudgetScreen() {
  const { colors, spacing, radius, typography, isDark } = useTheme();

  const [limits, setLimits] = useState<BudgetLimit[]>([]);
  // Real spend per space label, this month + last month + a 3-month
  // average -- populated whether or not a limit is set, so an unset row
  // still shows a real number to base the first budget on.
  const [spending, setSpending] = useState<Record<string, { this_month: number; last_month: number; avg_last_3_months: number }>>({});
  // This month's single largest line item per label.
  const [biggest, setBiggest] = useState<Record<string, { title: string; amount: number; from_last_month: boolean } | null>>({});
  // Home-only: monthly commitment from active Recurring items --
  // deliberately separate from `spent` (see BudgetController::index).
  const [recurring, setRecurring] = useState<Record<string, number>>({});
  const [recurringBills, setRecurringBills] = useState<any[]>([]);
  const [savingsGoal, setSavingsGoal] = useState<SavingsGoal>(null);
  // Every space kind the user actually has at least one space for --
  // "other" spaces don't feed the spending aggregation, so no row.
  const [spaceKinds, setSpaceKinds] = useState<SpaceKindMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // Every space row opens this detail page -- setting, changing and
  // deleting a budget all live inside it.
  const [spaceDetailFor, setSpaceDetailFor] = useState<{ label: string; icon: keyof typeof Ionicons.glyphMap; monthlyLimit?: number } | null>(null);
  const [showOverview, setShowOverview] = useState(false);

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, spacesRes] = await Promise.all([api.getBudget(), api.listSpaces()]);
      setLimits(b.limits || []);
      setSpending(b.spending || {});
      setBiggest(b.biggest || {});
      setRecurring(b.recurring || {});
      setRecurringBills(b.recurringBills || []);
      setSavingsGoal(b.savingsGoal || null);

      const seen = new Set<SpaceKind>();
      const kinds: SpaceKindMeta[] = [];
      (spacesRes.spaces || []).forEach((s: any) => {
        const kind = detectSpaceType(s, profileFromSpace(s));
        const meta = SPACE_KIND_META[kind];
        if (meta && !seen.has(kind)) {
          seen.add(kind);
          kinds.push({ kind, ...meta });
        }
      });
      setSpaceKinds(kinds);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => load());
    return () => sub.remove();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEditGoal = () => {
    setGoalTarget(savingsGoal ? String(savingsGoal.target_amount) : "");
    setGoalCurrent(savingsGoal ? String(savingsGoal.current_amount) : "");
    setEditingGoal(true);
  };

  const saveGoal = async () => {
    if (!goalTarget.trim()) return;
    setSavingGoal(true);
    try {
      await api.saveSavingsGoal({
        target_amount: Number(goalTarget.replace(",", ".")) || 0,
        current_amount: Number((goalCurrent || "0").replace(",", ".")) || 0,
      });
      setEditingGoal(false);
      await load();
    } catch (error: any) {
      notifyAction("Nu am putut salva obiectivul", error?.message || "A apărut o eroare.");
    } finally {
      setSavingGoal(false);
    }
  };

  const goalIsNegative = !!savingsGoal && savingsGoal.current_amount < 0;

  // Just the set-budget spaces -- the hero and BudgetOverviewPage's own
  // header total agree on scope.
  const totalBudget = limits.reduce((sum, l) => sum + l.monthly_limit, 0);
  const totalSpent = limits.reduce((sum, l) => sum + l.spent, 0);
  const totalRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const left = totalBudget - totalSpent;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="budget-screen">
      {spaceDetailFor ? (
        <BudgetSpaceDetailPage
          category={spaceDetailFor.label}
          icon={spaceDetailFor.icon}
          monthlyLimit={spaceDetailFor.monthlyLimit}
          onBack={() => setSpaceDetailFor(null)}
          onLimitSaved={load}
        />
      ) : showOverview ? (
        <BudgetOverviewPage
          limits={limits}
          spending={spending}
          spaceKinds={spaceKinds}
          onBack={() => setShowOverview(false)}
        />
      ) : (
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 140, gap: spacing.section }}>
        <PageTitle>Buget</PageTitle>

        {loading ? (
          <ActivityIndicator color={colors.onSurfaceTertiary} />
        ) : (
          <>
            {/* The whole month at a glance -- opens the overview page
                (composition ring + ranked spend list). */}
            {limits.length > 0 ? (
              <PressableScale
                testID="budget-overview-entry"
                onPress={() => setShowOverview(true)}
                scaleTo={motion.scale.card}
                accessibilityRole="button"
                accessibilityLabel={`Cheltuit din buget: ${lei(totalSpent)} din ${lei(totalBudget)}. Vezi detalii`}
                style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, flexDirection: "row", alignItems: "center", gap: 18 }}
              >
                <RingProgress
                  value={totalRatio}
                  size={96}
                  color={severityColor(budgetSeverity(totalRatio), colors)}
                  trackColor={colors.surfaceTertiary}
                  paceMarker={monthProgress()}
                  markerColor={colors.onSurfaceTertiary}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Cheltuit din buget</Text>
                  <Text style={{ ...typography.display, color: colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>{lei(totalSpent)}</Text>
                  <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>din {lei(totalBudget)}</Text>
                  <Text style={{ fontSize: 13, color: left >= 0 ? colors.success : colors.error, marginTop: 4 }}>
                    {left >= 0 ? `Mai ai ${lei(left)}` : `Ai depășit cu ${lei(-left)}`}
                  </Text>
                </View>
              </PressableScale>
            ) : spaceKinds.length > 0 ? (
              <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: 4 }}>
                <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }}>Încă nu ai un buget</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary }}>
                  Alege un spațiu mai jos și pune-i o limită lunară. Vezi apoi aici cât ai cheltuit din ea.
                </Text>
              </View>
            ) : null}

            <View style={{ gap: spacing.sm }} testID="section-limits">
              <SectionHeader title="Pe spații" />
              {spaceKinds.length === 0 ? (
                <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card }}>
                  <EmptyState icon="wallet-outline" message="Creează un spațiu Mașină, Casă, Cumpărături sau Cheltuieli ca să-i poți pune un buget." />
                </View>
              ) : (
                <Group inset={62}>
                  {spaceKinds.map((meta) => {
                    const name = SPACE_KIND_LABEL[meta.kind] ?? meta.label;
                    const color = SPACE_IDENTITY_COLORS[meta.kind] ?? colors.onSurfaceTertiary;
                    const tint = spaceTextColor(meta.kind, isDark) ?? color;
                    const limit = limits.find((l) => l.category === meta.label);
                    const spend = spending[meta.label];
                    const topItem = biggest[meta.label];
                    const recurringNote = meta.label === "Home" ? recurring["Home"] || 0 : 0;

                    const ratio = limit && limit.monthly_limit > 0 ? limit.spent / limit.monthly_limit : 0;
                    // A pace warning takes priority even under 80% --
                    // 20 points over pace a third into the month is a
                    // real early signal a plain ratio tone would miss.
                    const pace = limit ? paceDelta(ratio) : null;
                    const tone = pace !== null ? colors.warning : severityColor(budgetSeverity(ratio), colors);

                    const notes = [
                      pace !== null ? { text: `Cu ${pace}% peste ritmul lunii`, color: colors.warning } : null,
                      ratio >= 1 ? { text: `Depășit cu ${lei(limit!.spent - limit!.monthly_limit)}`, color: colors.error } : null,
                      topItem ? { text: `Cea mai mare${topItem.from_last_month ? " (luna trecută)" : ""}: ${biggestExpenseTitle(topItem.title)}, ${lei(topItem.amount)}`, color: colors.onSurfaceTertiary } : null,
                      recurringNote > 0 ? { text: `Din care ${lei(recurringNote)} plăți recurente`, color: colors.onSurfaceTertiary } : null,
                    ].filter(Boolean) as { text: string; color: string }[];

                    return (
                      <PressableScale
                        key={meta.kind}
                        testID={limit ? `space-budget-${meta.kind}` : `space-budget-unset-${meta.kind}`}
                        onPress={() => setSpaceDetailFor({ label: meta.label, icon: meta.icon, monthlyLimit: limit?.monthly_limit })}
                        scaleTo={1}
                        pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
                        accessibilityRole="button"
                        accessibilityLabel={limit ? `${name}: ${lei(limit.spent)} din ${lei(limit.monthly_limit)}` : `Setează un buget pentru ${name}`}
                        style={{ paddingHorizontal: spacing.lg, paddingVertical: 14, gap: 8, backgroundColor: colors.surfaceSecondary }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                          <IconWell icon={meta.icon} color={color} tint={tint} size={34} />
                          <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{name}</Text>
                          {limit ? (
                            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
                              <Text style={{ fontWeight: "600", color: ratio >= 1 ? colors.error : colors.onSurface }}>{roNumber(limit.spent, 2)}</Text>
                              {` / ${lei(limit.monthly_limit)}`}
                            </Text>
                          ) : (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                              <Text style={{ fontSize: 14, color: tint }}>Setează</Text>
                              <Ionicons name="chevron-forward" size={14} color={tint} />
                            </View>
                          )}
                        </View>
                        {limit ? (
                          <View style={{ marginLeft: 46, height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
                            <View style={{ width: `${Math.min(1, ratio) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: tone }} />
                          </View>
                        ) : spend ? (
                          <Text style={{ marginLeft: 46, fontSize: 13, color: colors.onSurfaceTertiary }}>
                            {lei(spend.this_month)} luna asta{spend.last_month > 0 ? `, ${lei(spend.last_month)} luna trecută` : ""}
                          </Text>
                        ) : null}
                        {limit && notes.length > 0 ? (
                          <View style={{ marginLeft: 46, gap: 2 }}>
                            {notes.map((n) => (
                              <Text key={n.text} style={{ fontSize: 13, color: n.color }} numberOfLines={2}>{n.text}</Text>
                            ))}
                          </View>
                        ) : null}
                      </PressableScale>
                    );
                  })}
                </Group>
              )}
            </View>

            {/* Savings goal -- filled up automatically at month's end
                with whatever was left in each space's budget. */}
            <PressableScale
              testID="savings-goal-card"
              onPress={openEditGoal}
              scaleTo={motion.scale.card}
              accessibilityRole="button"
              accessibilityLabel="Editează obiectivul de economii"
              style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: spacing.lg, gap: spacing.md }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <IconWell icon="wallet-outline" color={goalIsNegative ? colors.error : colors.success} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>Economii</Text>
                  <Text style={{ fontSize: 13, color: goalIsNegative ? colors.error : colors.onSurfaceTertiary, marginTop: 2 }}>
                    {savingsGoal
                      ? `${roNumber(savingsGoal.current_amount, 2)} din ${lei(savingsGoal.target_amount)}`
                      : "Pune-ți un obiectiv"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              </View>
              {savingsGoal && savingsGoal.target_amount > 0 ? (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
                  <View style={{ width: `${Math.max(0, Math.min(1, savingsGoal.current_amount / savingsGoal.target_amount)) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: colors.success }} />
                </View>
              ) : null}
              {goalIsNegative ? (
                <Text style={{ fontSize: 13, lineHeight: 18, color: colors.error }}>
                  Ai cheltuit cu {lei(Math.abs(savingsGoal!.current_amount))} peste bugetele planificate.
                </Text>
              ) : null}
            </PressableScale>

            <View style={{ gap: spacing.sm }} testID="section-recurring">
              <SectionHeader title="Plăți recurente" />
              {recurringBills.length === 0 ? (
                <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card }}>
                  <EmptyState icon="repeat" message="Nicio plată recurentă. Le adaugi din spațiul Casă, la Plăți recurente." />
                </View>
              ) : (
                <Group inset={68}>
                  {recurringBills.map((bill) => (
                    <Row
                      key={bill.id}
                      testID={`recurring-bill-${bill.id}`}
                      leading={<IconWell icon="repeat" color={SPACE_IDENTITY_COLORS.home!} tint={spaceTextColor("home", isDark)} />}
                      title={bill.title}
                      subtitle={capitalize([FREQUENCY_LABEL[bill.recurrence] || bill.recurrence, bill.due_at ? `următoarea pe ${roDate(bill.due_at)}` : null].filter(Boolean).join(", "))}
                      trailing={bill.amount != null ? <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Number(bill.amount))}</Text> : null}
                    />
                  ))}
                </Group>
              )}
            </View>
          </>
        )}
      </ScrollView>
      )}

      <Sheet
        visible={editingGoal}
        onClose={() => setEditingGoal(false)}
        title="Obiectiv de economii"
        icon="wallet-outline"
        tone={colors.success}
        footer={<Button testID="goal-save-button" label="Salvează obiectivul" onPress={saveGoal} loading={savingGoal} disabled={!goalTarget.trim()} />}
      >
        <Field testID="goal-target-input" label="Vreau să strâng" value={goalTarget} onChangeText={setGoalTarget} placeholder="ex. 10000" keyboardType="decimal-pad" suffix="lei" big tone={colors.success} autoFocus />
        <Field
          testID="goal-current-input"
          label="Am strâns deja"
          value={goalCurrent}
          onChangeText={setGoalCurrent}
          placeholder="0"
          keyboardType="decimal-pad"
          suffix="lei"
          tone={colors.success}
          hint="Se actualizează singur la final de lună. Schimbă suma doar dacă vrei s-o corectezi."
        />
      </Sheet>
    </SafeAreaView>
  );
}
