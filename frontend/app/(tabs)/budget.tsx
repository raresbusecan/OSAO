import React, { useCallback, useEffect, useRef, useState } from "react";
import { TabHeader, TabScreen } from "@/components/navigation/TabHeader";
import { View, Text, ScrollView, ActivityIndicator, DeviceEventEmitter } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api, apiErrorMessage } from "@/lib/api";
import { REFRESH_EVENT } from "@/lib/refresh";
import { useFocusEffect } from "expo-router";
import { useTabDepth } from "@/lib/navigation/returnTrail";
import { notifyAction } from "@/lib/confirm";
import { BudgetSpaceDetailPage } from "@/components/dashboard/BudgetSpaceDetailPage";
import { profileFromSpace, detectSpaceType, SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { BudgetOverviewPage } from "@/components/dashboard/BudgetOverviewPage";
import { RecurringBillRow, RecurringGroups, isRecurringPayment } from "@/components/dashboard/RecurringBillRow";
import { BudgetPaceCard } from "@/components/dashboard/BudgetPaceCard";
import { mergeLabels, normalizePace, type BudgetPace } from "@/lib/budget/pace";
import { SwipeItemRow } from "@/components/dashboard/SwipeItemRow";
import { IncomeSheet } from "@/components/dashboard/IncomeSheet";
import { LABEL_KIND, primeBudgetPlan, pickSummary, monthSpend, type BudgetPlan, type BudgetPlanSummary } from "@/lib/budget/plan";
import { useRouter } from "expo-router";
import { todoHref } from "@/lib/dashboard/spaceDue";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { SectionHeader, Group, IconWell, InfoButton, Button, Field, EmptyState, Row, Pill, CircleButton } from "@/components/ui/primitives";
import { useTourScroll, useTourTarget } from "@/components/ui/tourTargets";
import { useAutoTour } from "@/lib/useAutoTour";
import { SHOW_TOUR_TEST_BUTTON, startTour, type TourCtx } from "@/lib/tours";
import { motion } from "@/lib/motion";
import { lei, roDate, roCount, parseLocaleNumber } from "@/lib/format";
import { goalPace, localDay, type GoalPace } from "@/lib/budget/goal";
import { DateField } from "@/components/ui/DateField";
import { formatDateInput, isValidDateInput } from "@/lib/spaces/car/utils/dateInput";

type SavingsGoal = { name?: string | null; target_amount: number; current_amount: number; target_date: string | null } | null;
type SpaceKindMeta = { kind: SpaceKind; label: string; icon: keyof typeof Ionicons.glyphMap };

/** The goal's "YYYY-MM-DD..." as a local Date at noon (no tz day shift). */
function goalDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

// The same type->space label map Item::SPENDING_TYPE_SPACE uses on the
// backend for the Monthly Expenses breakdown -- GET /budget's `spending`
// is keyed by these labels (English KEYS, never shown -- the screen shows
// SPACE_KIND_LABEL's Romanian name), so "spent" always means "every real
// record from that space".
const SPACE_KIND_META: Partial<Record<SpaceKind, { label: string; icon: keyof typeof Ionicons.glyphMap }>> = {
  car: { label: "Car", icon: "car-outline" },
  home: { label: "Home", icon: "home-outline" },
  grocery: { label: "Grocery", icon: "cart-outline" },
  expenses: { label: "Expenses", icon: "receipt-outline" },
};

export default function BudgetScreen() {
  const { card, colors, spacing, radius, typography, isDark } = useTheme();

  // Real spend per space label: this month + last month + a 3-month
  // average. No per-space limits ("Buget simplu", 2026-11-02): every space
  // spends out of the one De cheltuit (income − Pui deoparte).
  const [spending, setSpending] = useState<Record<string, { this_month: number; last_month: number; avg_last_3_months: number }>>({});
  // Home-only: monthly commitment from active Recurring items --
  // deliberately separate from `spent` (see BudgetController::index).
  const [recurring, setRecurring] = useState<Record<string, number>>({});
  // Calendar purchases still ahead this month, per label -- also inside
  // `spent`, shown apart as "planificat" (BudgetController::plannedForLabel).
  const [planned, setPlanned] = useState<Record<string, number>>({});
  const [recurringBills, setRecurringBills] = useState<any[]>([]);
  // "Ritmul lunii" (lib/budget/pace.ts): per-day spend + Calendar purchases
  // per label, in the user's timezone. Shown only with an income plan (no
  // plan = no budget); the backend always sends it.
  const [pace, setPace] = useState<BudgetPace | null>(null);
  const [savingsGoal, setSavingsGoal] = useState<SavingsGoal>(null);
  // Every space kind the user actually has at least one space for --
  // "other" spaces don't feed the spending aggregation, so no row.
  const [spaceKinds, setSpaceKinds] = useState<SpaceKindMeta[]>([]);
  const [loading, setLoading] = useState(true);
  // The income plan (null = no income set yet: onboarding + spend per space).
  const [planSummary, setPlanSummary] = useState<BudgetPlanSummary | null>(null);
  // String(space id) -> kind / name, for a credit's linked space (its note
  // in the space detail, its subtitle under Plăți recurente).
  const [spaceKindById, setSpaceKindById] = useState<Record<string, SpaceKind>>({});
  const [spaceNameById, setSpaceNameById] = useState<Record<string, string>>({});

  // Every space row opens this detail page (its spend, no limit).
  const [spaceDetailFor, setSpaceDetailFor] = useState<{ label: string; icon: keyof typeof Ionicons.glyphMap } | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  // Return trail (lib/navigation/returnTrail.ts): a sub-page open = "deep",
  // so leaving Buget by a tab tap is remembered for 60 s.
  useTabDepth("budget", !!spaceDetailFor || showOverview);

  const [incomeOpen, setIncomeOpen] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  // A 422 on set_aside (> income) -- shown inline under the field.
  const [incomeFieldError, setIncomeFieldError] = useState<string | null>(null);
  const router = useRouter();

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("");
  const [goalName, setGoalName] = useState("");
  /** "ZZ.LL.AAAA" (DateField's format), "" = no date. */
  const [goalDate, setGoalDate] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  // First-use tour (lib/tours.ts "budget"): what it points at, and the
  // page's ScrollView so a step can scroll its target into view. "budget.top"
  // = the onboarding card without a plan, the pace card with one;
  // "budget.split" = the income strip (plan only).
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const tourScroll = useTourScroll("budget", scrollRef);
  const topTarget = useTourTarget("budget.top");
  const stripTarget = useTourTarget("budget.split");
  const spacesTarget = useTourTarget("budget.spaces");
  const recurringTarget = useTourTarget("budget.recurring");

  const load = useCallback(async () => {
    try {
      const [b, spacesRes] = await Promise.all([api.getBudget(), api.listSpaces()]);
      setSpending(b.spending || {});
      setRecurring(b.recurring || {});
      setPlanned(b.planned || {});
      setPace(b.pace && b.pace.labels && b.pace.days_in_month > 0 ? normalizePace(b.pace) : null);
      setRecurringBills((b.recurringBills || []).filter(isRecurringPayment));
      setSavingsGoal(b.savingsGoal || null);
      primeBudgetPlan(b);
      setPlanSummary(pickSummary(b));

      const seen = new Set<SpaceKind>();
      const kinds: SpaceKindMeta[] = [];
      const byId: Record<string, SpaceKind> = {};
      const nameById: Record<string, string> = {};
      (spacesRes.spaces || []).forEach((s: any) => {
        const kind = detectSpaceType(s, profileFromSpace(s));
        byId[String(s.id)] = kind;
        nameById[String(s.id)] = s.name ?? "";
        const meta = SPACE_KIND_META[kind];
        if (meta && !seen.has(kind)) {
          seen.add(kind);
          kinds.push({ kind, ...meta });
        }
      });
      setSpaceKinds(kinds);
      setSpaceKindById(byId);
      setSpaceNameById(nameById);
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
    setGoalName(savingsGoal?.name ?? "");
    setGoalDate(savingsGoal?.target_date ? formatDateInput(goalDay(savingsGoal.target_date)) : "");
    setEditingGoal(true);
  };

  const saveGoal = async () => {
    if (!goalTarget.trim()) return;
    setSavingGoal(true);
    try {
      await api.saveSavingsGoal({
        target_amount: parseLocaleNumber(goalTarget) || 0,
        current_amount: parseLocaleNumber((goalCurrent || "0")) || 0,
        name: goalName.trim() || null,
        target_date: sheetGoalDay,
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
  // The sheet's date as "YYYY-MM-DD" (null = none), for saving and its preview.
  const sheetGoalDay = isValidDateInput(goalDate) ? goalDate.split(".").reverse().join("-") : null;

  const plan: BudgetPlan | null = planSummary?.plan ?? null;
  const hasCredit = (planSummary?.credit.count ?? 0) > 0;
  // Active credits. A rate linked to a car/home is SHOWN with that space
  // (a note in its detail + the "Credite" group under Plăți recurente) but
  // COUNTED only in De cheltuit, like a bill -- never in the space's spend.
  const creditItems = planSummary?.credit.items ?? [];
  const creditByKind: Partial<Record<SpaceKind, number>> = {};
  creditItems.forEach((c) => {
    const k = c.linked_space_id != null ? spaceKindById[String(c.linked_space_id)] : undefined;
    if (k) creditByKind[k] = (creditByKind[k] ?? 0) + Number(c.amount || 0);
  });
  const creditsMonthly = creditItems.reduce((s, c) => s + Number(c.amount || 0), 0);

  // ---- Income plan: Venit -> Pui deoparte -> De cheltuit ----
  const saveIncome = async (income: number, setAside: number) => {
    setSavingIncome(true);
    setIncomeFieldError(null);
    try {
      await api.saveBudgetPlan({ monthly_income: income, set_aside: setAside });
      setIncomeOpen(false);
      await load();
    } catch (error: any) {
      const fieldMsg = error?.body?.errors?.set_aside?.[0];
      if (typeof fieldMsg === "string" && fieldMsg) setIncomeFieldError(fieldMsg);
      // Anything else (e.g. 503 "Bugetul se actualizează…" before the
      // backend migration ran): the server's own message.
      else notifyAction("Nu am putut salva venitul", apiErrorMessage(error, "A apărut o eroare.", "monthly_income"));
    } finally {
      setSavingIncome(false);
    }
  };

  // De cheltuit vs EVERY label's spend + the credit rates -- the shared
  // monthSpend() so Acasă's "Mai ai" and the overview agree. `this_month`
  // already folds in each space's recurring bills (flat monthly) and
  // Calendar purchases still ahead; the rates are added on top. On screen
  // "Cheltuit" is only what was recorded; bills + rates are the hatched band.
  const E = plan ? plan.spendable : 0;
  const ms = monthSpend(spending, recurring, planned, planSummary?.credit.rates ?? 0);
  // ---- Obiectiv de economii (lib/budget/goal.ts): per day / week / month
  // to reach the target by its date -- the card's saved goal, and the
  // sheet's draft (a live preview while typing).
  const today = localDay(new Date());
  const cardGoal = savingsGoal
    ? goalPace({ target: Number(savingsGoal.target_amount), current: Number(savingsGoal.current_amount), targetDate: savingsGoal.target_date, today, setAside: plan?.set_aside })
    : ({ status: "none" } as GoalPace);
  const sheetGoal = goalPace({
    target: parseLocaleNumber(goalTarget) || 0,
    current: parseLocaleNumber(goalCurrent || "0") || 0,
    targetDate: sheetGoalDay,
    today,
    setAside: plan?.set_aside,
  });

  // ---- Ritmul lunii (lib/budget/pace.ts): with a plan only, every label
  // against the one De cheltuit. ----
  const paceT = pace?.today ?? 0;
  const paceD = pace?.days_in_month ?? 0;
  const paceMerged = pace && plan ? mergeLabels(Object.values(pace.labels), paceD) : null;

  // ---- Cheltuit pe spații: informational only (2026-11-02, user
  // decision: one budget, no per-space limits). Recorded spend
  // this month per space and its share of the total, highest first. ----
  const recordedOf = (label: string) =>
    Math.max(0, Number(spending[label]?.this_month || 0) - (recurring[label] || 0) - (planned[label] || 0));
  // A label with spend but no space of its kind (a Calendar purchase lands
  // on "Expenses" without a Cheltuieli space) still gets a row -- same rule
  // as BudgetOverviewPage.
  const extraKinds: SpaceKindMeta[] = Object.keys(spending)
    .filter((label) => !spaceKinds.some((k) => k.label === label) && LABEL_KIND[label] && recordedOf(label) > 0)
    .map((label) => ({ kind: LABEL_KIND[label].kind, label, icon: LABEL_KIND[label].icon }));
  const spaceRows = [...spaceKinds, ...extraKinds]
    .map((meta) => ({ ...meta, spent: recordedOf(meta.label) }))
    .sort((a, b) => b.spent - a.spent);
  const rowsTotal = spaceRows.reduce((sum, r) => sum + r.spent, 0);

  const tourCtx: TourCtx = { hasPlan: !!plan, hasSpaces: spaceKinds.length > 0, hasCredit };
  useAutoTour("budget", {
    ready: !loading && !spaceDetailFor && !showOverview && !incomeOpen && !editingGoal,
    ctx: tourCtx,
  });

  // Only the root page has the tab header; the sub-pages bring their own TopBar.
  const onRootPage = !(spaceDetailFor || showOverview);
  const tabHeader = onRootPage ? <TabHeader title="Buget" info="budget.page" profileTestID="budget-profile" /> : undefined;

  return (
    <TabScreen testID="budget-screen" header={tabHeader}>
      {spaceDetailFor ? (
        <BudgetSpaceDetailPage
          category={spaceDetailFor.label}
          icon={spaceDetailFor.icon}
          pace={pace && pace.labels[spaceDetailFor.label] ? { ...pace.labels[spaceDetailFor.label], today: pace.today, daysInMonth: pace.days_in_month, month: pace.month } : undefined}
          creditNote={(() => {
            const k = LABEL_KIND[spaceDetailFor.label]?.kind;
            const amount = k ? creditByKind[k] : 0;
            return amount ? `+ rată ${lei(Math.round(amount))} pe lună, intră în De cheltuit` : undefined;
          })()}
          onBack={() => setSpaceDetailFor(null)}
        />
      ) : showOverview ? (
        <BudgetOverviewPage
          spending={spending}
          spaceKinds={spaceKinds}
          recurring={recurring}
          planned={planned}
          spendable={plan ? E : null}
          creditRates={planSummary?.credit.rates ?? 0}
          onBack={() => setShowOverview(false)}
        />
      ) : (
      <ScrollView ref={scrollRef} {...tourScroll} contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 140, gap: spacing.section }}>

        {SHOW_TOUR_TEST_BUTTON ? (
          // TEMP for testing -- see SHOW_TOUR_TEST_BUTTON (lib/tours.ts).
          <View style={{ flexDirection: "row" }}>
            <Pill testID="budget-tour-test" icon="play-circle-outline" label="Pornește ghidul" onPress={() => startTour("budget", tourCtx)} />
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.onSurfaceTertiary} />
        ) : (
          <>
            {!plan ? (
              <View testID="income-onboarding" {...topTarget} style={{ ...card, borderRadius: radius.lg, padding: spacing.gutter, gap: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="wallet-outline" size={20} color={colors.onSurface} />
                </View>
                <View style={{ gap: spacing.xs }}>
                  <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }}>Pornește de la venitul tău</Text>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary }}>
                    Spune-ne cât câștigi net pe lună și cât vrei să pui deoparte. Restul e ce ai de cheltuit, iar Ritmul lunii îți arată zi de zi cum stai.
                  </Text>
                </View>
                <Button testID="income-onboarding-add" label="Adaugă venitul" onPress={() => setIncomeOpen(true)} />
              </View>
            ) : (
              // Income strip (mockup Simplu1): Venit · Pui deoparte · De
              // cheltuit. Tap anywhere (or the pencil) = the income sheet.
              // Tour step "plan" points here.
              <View {...stripTarget}>
                <PressableScale
                  testID="income-strip"
                  onPress={() => setIncomeOpen(true)}
                  scaleTo={motion.scale.card}
                  accessibilityRole="button"
                  accessibilityLabel={`Venitul tău: ${lei(Math.round(plan.monthly_income))}, pui deoparte ${lei(Math.round(plan.set_aside))}, de cheltuit ${lei(Math.round(E))}. Modifică`}
                  style={{ ...card, borderRadius: radius.card, paddingHorizontal: spacing.lg, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                >
                  {([
                    ["Venit", lei(Math.round(plan.monthly_income)), colors.onSurface],
                    ["Pui deoparte", plan.set_aside > 0 ? `− ${lei(Math.round(plan.set_aside))}` : "0", plan.set_aside > 0 ? colors.success : colors.onSurfaceTertiary],
                    ["De cheltuit", lei(Math.round(E)), colors.onSurface],
                  ] as const).map(([label, value, tone]) => (
                    <View key={label} style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{label}</Text>
                      <Text style={{ fontSize: 16, fontWeight: "600", color: tone, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
                    </View>
                  ))}
                  <CircleButton testID="income-strip-edit" icon="pencil" label="Modifică venitul" onPress={() => setIncomeOpen(true)} />
                </PressableScale>
              </View>
            )}

            {plan && pace && paceMerged ? (
              // Tour step 1 with a plan (without one it's the onboarding card).
              <View {...topTarget}>
                <BudgetPaceCard
                  E={E}
                  R={ms.recurring}
                  pAhead={ms.planned}
                  S={ms.recorded}
                  t={paceT}
                  D={paceD}
                  daily={paceMerged.daily}
                  events={paceMerged.events}
                  month={pace.month}
                  onPress={() => setShowOverview(true)}
                />
              </View>
            ) : null}

            <View style={{ gap: spacing.sm }} testID="section-spaces">
              <SectionHeader title="Cheltuit pe spații" info="budget.spaces" />
              {spaceRows.length === 0 ? (
                <View {...spacesTarget} style={{ ...card, borderRadius: radius.card }}>
                  <EmptyState icon="wallet-outline" message="Creează un spațiu Mașină, Casă, Cumpărături sau Cheltuieli și vezi aici cât cheltuiești în fiecare." />
                </View>
              ) : (
                <Group inset={spacing.lg}>
                  {spaceRows.map((row, i) => {
                    const name = SPACE_KIND_LABEL[row.kind] ?? row.label;
                    const color = SPACE_IDENTITY_COLORS[row.kind] ?? colors.onSurfaceTertiary;
                    const share = rowsTotal > 0 ? row.spent / rowsTotal : 0;
                    const pct = Math.round(share * 100);
                    const shareText = row.spent > 0 ? `${pct < 1 ? "sub 1" : pct}% din ce ai cheltuit` : "Nimic cheltuit luna asta";
                    return (
                      // Tour step "spaces" points at the first row (after sorting).
                      <View key={row.label} {...(i === 0 ? spacesTarget : {})}>
                      <PressableScale
                        testID={`space-spent-${row.kind}`}
                        onPress={() => setSpaceDetailFor({ label: row.label, icon: row.icon })}
                        scaleTo={1}
                        pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
                        accessibilityRole="button"
                        accessibilityLabel={`${name}: ${lei(Math.round(row.spent))} luna asta, ${shareText}. Vezi detalii`}
                        style={{ paddingHorizontal: spacing.lg, paddingVertical: 12, gap: spacing.sm, minHeight: 48, backgroundColor: colors.surfaceSecondary }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                          <Text style={{ ...typography.body, flex: 1, color: colors.onSurface }} numberOfLines={1}>{name}</Text>
                          <Text style={{ fontSize: 15, fontWeight: "600", color: row.spent > 0 ? colors.onSurface : colors.onSurfaceTertiary, fontVariant: ["tabular-nums"] }}>{lei(Math.round(row.spent))}</Text>
                          <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
                        </View>
                        {row.spent > 0 ? (
                          // Its share of what was spent -- not a limit.
                          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
                            <View style={{ width: `${Math.max(2, share * 100)}%`, height: "100%", borderRadius: 2, backgroundColor: color }} />
                          </View>
                        ) : null}
                        <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>{shareText}</Text>
                      </PressableScale>
                      </View>
                    );
                  })}
                </Group>
              )}
            </View>

            {/* Economii (plan or not): filled on the 1st of each month with
                Pui deoparte + what was left of De cheltuit (overspending is
                taken out -- credit rates included, user decision 2026-11-02). */}
            <View style={{ gap: spacing.sm }} testID="section-savings">
              <SectionHeader title="Economii" info="budget.savings" />
              <PressableScale
                testID="savings-goal-card"
                onPress={openEditGoal}
                scaleTo={motion.scale.card}
                accessibilityRole="button"
                accessibilityLabel={`Economii: ${lei(Math.round(savingsGoal?.current_amount ?? 0))}${savingsGoal && savingsGoal.target_amount > 0 ? ` din ținta de ${lei(Math.round(savingsGoal.target_amount))}${savingsGoal.name ? ` pentru ${savingsGoal.name}` : ""}` : ""}. ${goalPaceText(cardGoal, plan?.set_aside, savingsGoal?.target_date)} Modifică obiectivul`}
                style={{ ...card, borderRadius: radius.card, padding: spacing.lg, gap: 10 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <IconWell icon="wallet-outline" color={goalIsNegative ? colors.error : colors.success} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 20, fontWeight: "600", color: goalIsNegative ? colors.error : colors.onSurface, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
                      {lei(Math.round((savingsGoal?.current_amount ?? 0) * 100) / 100)}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>
                      {savingsGoal && savingsGoal.target_amount > 0
                        ? `${savingsGoal.name ? `${savingsGoal.name} · ` : ""}din ${lei(Math.round(savingsGoal.target_amount))}`
                        : "Pune-ți o țintă"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
                </View>
                {savingsGoal && savingsGoal.target_amount > 0 ? (
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
                    <View style={{ width: `${Math.max(0, Math.min(1, savingsGoal.current_amount / savingsGoal.target_amount)) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: colors.success }} />
                  </View>
                ) : null}
                <GoalPaceBlock goal={cardGoal} setAside={plan?.set_aside} date={savingsGoal?.target_date} testID="savings-goal-pace" />
                {/* No goal yet: a nudge to set one (how Economii fills up
                    lives in the (i) help, budget.savings). */}
                {cardGoal.status === "none" ? (
                  <Text testID="savings-goal-hint" style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>
                    Obiectivele pe termen lung aduc recompense pe măsură. Pune-ți o țintă și o perioadă alese de tine.
                  </Text>
                ) : null}
                {goalIsNegative ? (
                  <Text style={{ fontSize: 13, lineHeight: 18, color: colors.error }}>
                    Ai cheltuit cu {lei(Math.round(Math.abs(savingsGoal!.current_amount)))} mai mult decât ai avut.
                  </Text>
                ) : null}
              </PressableScale>
            </View>

            <View style={{ gap: spacing.sm }} testID="section-recurring">
              {/* Tour step 4. */}
              <View {...recurringTarget}>
                <SectionHeader
                  title="Plăți recurente"
                  info="budget.recurring"
                  right={ms.bills + ms.rates > 0 ? `${lei(Math.round(ms.bills + ms.rates))} / lună` : undefined}
                />
              </View>
              {recurringBills.length === 0 && creditItems.length === 0 ? (
                <View style={{ ...card, borderRadius: radius.card }}>
                  <EmptyState icon="repeat" message="Nicio plată recurentă. Le adaugi din spațiul Casă, la Plăți recurente." />
                </View>
              ) : (
                <View style={{ gap: spacing.lg }}>
                  {recurringBills.length > 0 ? (
                    <RecurringGroups
                      items={recurringBills}
                      renderRow={(bill) => (
                        <SwipeItemRow key={bill.id} item={bill} onChanged={load}>
                          <RecurringBillRow testID={`recurring-bill-${bill.id}`} item={bill} onPress={() => router.navigate(todoHref(bill) as any)} />
                        </SwipeItemRow>
                      )}
                    />
                  ) : null}
                  {/* Credit rates -- listed with the bills (they're due like
                      one) and counted in De cheltuit like them, never in a
                      space. No swipe: a rate is a reminder, not something to
                      resolve. */}
                  {creditItems.length > 0 ? (
                    <View style={{ gap: spacing.sm }} testID="recurring-group-credit">
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurfaceSecondary }}>{`Credite · ${creditItems.length}`}</Text>
                          <InfoButton topic="budget.credit" />
                        </View>
                        <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{`${lei(Math.round(creditsMonthly))} / lună`}</Text>
                      </View>
                      <Group inset={68}>
                        {creditItems.map((c) => {
                          const spaceName = c.linked_space_id != null ? spaceNameById[String(c.linked_space_id)] : "";
                          return (
                            <Row
                              key={String(c.id)}
                              testID={`recurring-credit-${c.id}`}
                              onPress={c.space_id != null ? () => router.navigate(todoHref({ ...c, type: "expense_credit" }) as any) : undefined}
                              leading={<IconWell icon="card-outline" color={SPACE_IDENTITY_COLORS.expenses!} tint={spaceTextColor("expenses", isDark) ?? undefined} />}
                              title={c.title}
                              subtitle={`${spaceName ? `${spaceName} · ` : ""}credit · intră în De cheltuit`}
                              trailing={
                                <View style={{ alignItems: "flex-end", gap: 2 }}>
                                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Number(c.amount))}</Text>
                                  {c.next_due ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{roDate(c.next_due, { short: true })}</Text> : null}
                                </View>
                              }
                            />
                          );
                        })}
                      </Group>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
      )}

      <IncomeSheet
        visible={incomeOpen}
        onClose={() => {
          setIncomeOpen(false);
          setIncomeFieldError(null);
        }}
        serverError={incomeFieldError}
        onEdit={() => setIncomeFieldError(null)}
        initialIncome={plan?.monthly_income ?? null}
        initialSetAside={plan ? plan.set_aside : null}
        bills={ms.bills}
        rates={ms.rates}
        saving={savingIncome}
        onSave={saveIncome}
      />
      <Sheet
        visible={editingGoal}
        onClose={() => setEditingGoal(false)}
        title="Obiectiv de economii"
        info="budget.savings"
        icon="wallet-outline"
        tone={colors.success}
        footer={<Button testID="goal-save-button" label="Salvează obiectivul" onPress={saveGoal} loading={savingGoal} disabled={!goalTarget.trim()} />}
      >
        <Field testID="goal-target-input" label="Vreau să strâng" value={goalTarget} onChangeText={setGoalTarget} placeholder="ex. 10000" keyboardType="decimal-pad" suffix="lei" big tone={colors.success} autoFocus />
        <DateField testID="goal-date-input" label="Până când" value={goalDate} onChange={setGoalDate} range="future" clearable placeholder="Alege data (opțional)" />
        <Field testID="goal-name-input" label="Pentru ce (opțional)" value={goalName} onChangeText={setGoalName} placeholder="ex. Vacanță" maxLength={80} tone={colors.success} />
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
        <GoalPaceBlock goal={sheetGoal} setAside={plan?.set_aside} date={sheetGoalDay} testID="goal-sheet-pace" />
      </Sheet>
    </TabScreen>
  );
}

/** One plain sentence for the goal's state (also the card's a11y text). */
function goalPaceText(goal: GoalPace, setAside: number | null | undefined, date: string | null | undefined): string {
  const up = (n: number) => lei(Math.ceil(n));
  switch (goal.status) {
    case "none":
      return "";
    case "reached":
      return "Ai strâns toată suma. Felicitări!";
    case "no-date":
      return "Alege până când vrei să strângi banii și îți arătăm cât să pui deoparte pe zi, pe săptămână și pe lună.";
    case "overdue":
      return `Data a trecut și mai ai ${up(goal.remaining)} de strâns. Alege o dată nouă.`;
    case "ok": {
      const until = `Până pe ${roDate(goalDay(date!), { withYear: true })} mai ai ${up(goal.remaining)} de strâns, în ${roCount(goal.days, "zi", "zile")}.`;
      if (goal.onTrack == null) return until;
      return goal.onTrack
        ? `${until} Cu cei ${lei(Math.round(setAside ?? 0))} puși deoparte pe lună ajungi la timp.`
        : `${until} ${setAside ? `Doar din cei ${lei(Math.round(setAside))} puși deoparte pe lună nu ajungi.` : "Nu pui nimic deoparte lunar."} Ia în calcul ${up(goal.perMonth)} pe lună.`;
    }
  }
}

/** Obiectiv de economii: the state sentence and, with a date ahead, how
 * much to put aside per day / week / month (rounded up, so it's enough). */
function GoalPaceBlock({ goal, setAside, date, testID }: { goal: GoalPace; setAside: number | null | undefined; date: string | null | undefined; testID?: string }) {
  const { colors, spacing, radius } = useTheme();
  if (goal.status === "none") return null;
  const text = goalPaceText(goal, setAside, date);
  const tone = goal.status === "reached" ? colors.success : goal.status === "overdue" ? colors.error : colors.onSurfaceSecondary;
  return (
    <View testID={testID} style={{ gap: spacing.sm }}>
      {goal.status === "ok" ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {(
            [
              ["pe zi", goal.perDay],
              ["pe săptămână", goal.perWeek],
              ["pe lună", goal.perMonth],
            ] as const
          ).map(([label, amount]) => (
            <View key={label} style={{ flex: 1, paddingVertical: spacing.sm, paddingHorizontal: 10, borderRadius: radius.control, backgroundColor: colors.surfaceTertiary, gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
                {lei(Math.ceil(amount))}
              </Text>
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }} numberOfLines={1}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={{ fontSize: 13, lineHeight: 18, color: tone }}>{text}</Text>
    </View>
  );
}
