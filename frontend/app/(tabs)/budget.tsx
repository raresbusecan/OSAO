import React, { useCallback, useEffect, useRef, useState } from "react";
import { TabHeader, TabScreen } from "@/components/navigation/TabHeader";
import { View, Text, ScrollView, ActivityIndicator, DeviceEventEmitter } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "@/lib/refresh";
import { useFocusEffect } from "expo-router";
import { useTabDepth } from "@/lib/navigation/returnTrail";
import { notifyAction } from "@/lib/confirm";
import { RingProgress } from "@/components/dashboard/RingProgress";
import { BudgetSpaceDetailPage } from "@/components/dashboard/BudgetSpaceDetailPage";
import { profileFromSpace, detectSpaceType, SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { BudgetOverviewPage } from "@/components/dashboard/BudgetOverviewPage";
import { RecurringBillRow, RecurringGroups, isRecurringPayment } from "@/components/dashboard/RecurringBillRow";
import { BudgetPaceCard } from "@/components/dashboard/BudgetPaceCard";
import { mergeLabels, normalizePace, type BudgetPace } from "@/lib/budget/pace";
import { SwipeItemRow } from "@/components/dashboard/SwipeItemRow";
import { IncomeSplitCard } from "@/components/dashboard/IncomeSplitCard";
import { IncomeSheet } from "@/components/dashboard/IncomeSheet";
import { SplitSheet } from "@/components/dashboard/SplitSheet";
import { GuiltFreePage } from "@/components/dashboard/GuiltFreePage";
import { BudgetCreditPage } from "@/components/dashboard/BudgetCreditPage";
import { LABEL_KIND, DEFAULT_SPLIT, JAR_ORDER, jarFill, jarAmounts, primeBudgetPlan, needsSpend, type BudgetPlan, type BudgetPlanSummary, type BudgetSplit } from "@/lib/budget/plan";
import { useRouter } from "expo-router";
import { todoHref } from "@/lib/dashboard/spaceDue";
import { severityColor, budgetSeverity } from "@/lib/statusColors";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { SectionHeader, Group, IconWell, InfoButton, Button, Field, EmptyState, Row, Pill } from "@/components/ui/primitives";
import { useTourScroll, useTourTarget } from "@/components/ui/tourTargets";
import { useAutoTour } from "@/lib/useAutoTour";
import { SHOW_TOUR_TEST_BUTTON, startTour, type TourCtx } from "@/lib/tours";
import { motion } from "@/lib/motion";
import { lei, roNumber, roDate, parseLocaleNumber } from "@/lib/format";

type SavingsGoal = { target_amount: number; current_amount: number; target_date: string | null } | null;
type SpaceKindMeta = { kind: SpaceKind; label: string; icon: keyof typeof Ionicons.glyphMap };

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


const ONBOARDING_LEGEND: [string, string][] = [
  ["55%", "necesități"],
  ["5%", "bani fără vină"],
  ["10%", "investiții sau credit"],
  ["15%", "termen scurt"],
  ["15%", "termen lung"],
];

export default function BudgetScreen() {
  const { card, colors, spacing, radius, typography, isDark } = useTheme();

  // Real spend per space label: this month + last month + a 3-month
  // average. Since 2026-11-02 there are no per-space limits (one Necesități
  // envelope from income); GET /budget still sends `limits`, unread.
  const [spending, setSpending] = useState<Record<string, { this_month: number; last_month: number; avg_last_3_months: number }>>({});
  // Home-only: monthly commitment from active Recurring items --
  // deliberately separate from `spent` (see BudgetController::index).
  const [recurring, setRecurring] = useState<Record<string, number>>({});
  // Calendar purchases still ahead this month, per label -- also inside
  // `spent`, shown apart as "planificat" (BudgetController::plannedForLabel).
  const [planned, setPlanned] = useState<Record<string, number>>({});
  const [recurringBills, setRecurringBills] = useState<any[]>([]);
  // "Ritmul lunii" (lib/budget/pace.ts): per-day spend + Calendar purchases
  // per label, in the user's timezone. null = an older backend -> the ring.
  // Shown only with an income plan (no plan = no budget).
  const [pace, setPace] = useState<BudgetPace | null>(null);
  const [savingsGoal, setSavingsGoal] = useState<SavingsGoal>(null);
  // Every space kind the user actually has at least one space for --
  // "other" spaces don't feed the spending aggregation, so no row.
  const [spaceKinds, setSpaceKinds] = useState<SpaceKindMeta[]>([]);
  const [loading, setLoading] = useState(true);
  // Buget din venit (null plan = no income set yet: today's UI + onboarding).
  const [planSummary, setPlanSummary] = useState<BudgetPlanSummary | null>(null);
  // This month's fără vină spend per space label ("+ 120 lei fără vină,
  // socotiți separat" under a space) -- from GET /budget/guilt-free.
  const [guiltFreeByLabel, setGuiltFreeByLabel] = useState<Record<string, number>>({});
  // String(space id) -> kind, for the credit page's linked-space chips;
  // and the first Cheltuieli space, where credits are managed.
  const [spaceKindById, setSpaceKindById] = useState<Record<string, SpaceKind>>({});
  const [spaceNameById, setSpaceNameById] = useState<Record<string, string>>({});
  // String(space id) -> spaces.color, so a linked-space chip shows THAT space's colour.
  const [spaceColorById, setSpaceColorById] = useState<Record<string, string | null>>({});
  const [expensesSpaceId, setExpensesSpaceId] = useState<string | null>(null);

  // Every space row opens this detail page (its spend, no limit).
  const [spaceDetailFor, setSpaceDetailFor] = useState<{ label: string; icon: keyof typeof Ionicons.glyphMap } | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [showGuiltFree, setShowGuiltFree] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  // Return trail (lib/navigation/returnTrail.ts): a sub-page open = "deep",
  // so leaving Buget by a tab tap is remembered for 60 s.
  useTabDepth("budget", !!spaceDetailFor || showOverview || showGuiltFree || showCredit);

  const [incomeOpen, setIncomeOpen] = useState(false);
  // An income typed but not saved yet (the keep/re-split dialog was
  // dismissed) -- the sheet reopens with it instead of losing it.
  const [pendingIncome, setPendingIncome] = useState<number | null>(null);
  const [savingIncome, setSavingIncome] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [savingSplit, setSavingSplit] = useState(false);
  const router = useRouter();

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  // First-use tour (lib/tours.ts "budget"): what it points at, and the
  // page's ScrollView so a step can scroll its target into view. "budget.top"
  // = the onboarding card without a plan, the hero with one; "budget.split"
  // = the onboarding bar + legend here, or IncomeSplitCard's income block.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const tourScroll = useTourScroll("budget", scrollRef);
  const topTarget = useTourTarget("budget.top");
  const onboardingSplitTarget = useTourTarget("budget.split");
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
      setPlanSummary({
        plan: b.plan ?? null,
        necessities: b.necessities ?? { envelope: null, avg_last_3_months: 0 },
        guiltFree: b.guiltFree ?? { budget: null, spent: 0, planned: 0, count: 0 },
        credit: b.credit ?? { budget: null, rates: 0, count: 0, items: [] },
      });
      if (b.plan) {
        api
          .getGuiltFree()
          .then((g) => {
            const byLabel: Record<string, number> = {};
            (g.items || []).forEach((it) => {
              if (it.planned) return;
              byLabel[it.label] = (byLabel[it.label] || 0) + (Number(it.amount) || 0);
            });
            setGuiltFreeByLabel(byLabel);
          })
          .catch(() => {});
      } else {
        setGuiltFreeByLabel({});
      }

      const seen = new Set<SpaceKind>();
      const kinds: SpaceKindMeta[] = [];
      const byId: Record<string, SpaceKind> = {};
      const nameById: Record<string, string> = {};
      const colorById: Record<string, string | null> = {};
      let expensesId: string | null = null;
      (spacesRes.spaces || []).forEach((s: any) => {
        const kind = detectSpaceType(s, profileFromSpace(s));
        byId[String(s.id)] = kind;
        nameById[String(s.id)] = s.name ?? "";
        colorById[String(s.id)] = s.color ?? null;
        if (kind === "expenses" && !expensesId) expensesId = String(s.id);
        const meta = SPACE_KIND_META[kind];
        if (meta && !seen.has(kind)) {
          seen.add(kind);
          kinds.push({ kind, ...meta });
        }
      });
      setSpaceKinds(kinds);
      setSpaceKindById(byId);
      setSpaceNameById(nameById);
      setSpaceColorById(colorById);
      setExpensesSpaceId(expensesId);
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
        target_amount: parseLocaleNumber(goalTarget) || 0,
        current_amount: parseLocaleNumber((goalCurrent || "0")) || 0,
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

  const plan: BudgetPlan | null = planSummary?.plan ?? null;
  const envelope = plan ? jarAmounts(plan.monthly_income, plan.split).needs : 0;
  const hasCredit = (planSummary?.credit.count ?? 0) > 0;
  // Active credits. A rate linked to a car/home is SHOWN with that space
  // (a note on its row + the "Credite" group under Plăți recurente) but
  // COUNTED only in the Credit jar -- never in the space's budget.
  const creditItems = planSummary?.credit.items ?? [];
  const creditByKind: Partial<Record<SpaceKind, number>> = {};
  creditItems.forEach((c) => {
    const k = c.linked_space_id != null ? spaceKindById[String(c.linked_space_id)] : undefined;
    if (k) creditByKind[k] = (creditByKind[k] ?? 0) + Number(c.amount || 0);
  });
  const creditsMonthly = creditItems.reduce((s, c) => s + Number(c.amount || 0), 0);

  // ---- Income plan actions ----
  const savePlan = async (income: number, split: BudgetSplit) => {
    await api.saveBudgetPlan({ monthly_income: income, split });
    await load();
  };

  const saveIncome = async (income: number) => {
    const split = plan?.split ?? DEFAULT_SPLIT;
    setSavingIncome(true);
    try {
      await savePlan(income, split);
      setIncomeOpen(false);
      setPendingIncome(null);
    } catch (error: any) {
      notifyAction("Nu am putut salva venitul", error?.message || "A apărut o eroare.");
    } finally {
      setSavingIncome(false);
    }
  };

  const saveSplit = async (split: BudgetSplit) => {
    if (!plan) return;
    setSavingSplit(true);
    try {
      await savePlan(plan.monthly_income, split);
      setSplitOpen(false);
    } catch (error: any) {
      notifyAction("Nu am putut salva procentele", error?.message || "A apărut o eroare.");
    } finally {
      setSavingSplit(false);
    }
  };

  // Necesități: EVERY label's spend (fără vină already excluded by the API)
  // against the envelope -- the shared needsSpend() so Acasă's "Mai ai" and
  // the overview agree. `this_month` already folds in each space's
  // recurring bills (flat monthly) and Calendar purchases still ahead; on
  // screen "Cheltuit" is only what was recorded, the rest is "de plătit" /
  // "planificat", and the comparison with the envelope uses all three.
  const needs = needsSpend(spending, recurring, planned);
  const heroBudget = envelope;
  const heroSpent = needs.recorded;
  const heroRecurring = needs.recurring;
  const heroPlanned = needs.planned;
  const heroLeft = envelope - needs.committed;
  const heroRatio = envelope > 0 ? needs.committed / envelope : 0;
  const heroLabel = "Cheltuit din necesități";

  // ---- Ritmul lunii (lib/budget/pace.ts): with a plan only, every label
  // against the one Necesități envelope. ----
  const paceT = pace?.today ?? 0;
  const paceD = pace?.days_in_month ?? 0;
  const paceMerged = pace && plan ? mergeLabels(Object.values(pace.labels), paceD) : null;

  // ---- Cheltuit pe spații: informational only (2026-11-02, user
  // decision: one Necesități envelope, no per-space limits). Recorded spend
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
    ready: !loading && !spaceDetailFor && !showOverview && !showGuiltFree && !showCredit && !incomeOpen && !splitOpen && !editingGoal,
    ctx: tourCtx,
  });

  // Only the root page has the tab header; the sub-pages bring their own TopBar.
  const onRootPage = !(spaceDetailFor || (showGuiltFree && plan) || (showCredit && plan && planSummary && hasCredit) || showOverview);
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
            return amount ? `+ rată ${lei(Math.round(amount))} pe lună, socotită la Credit` : undefined;
          })()}
          guiltFreeThisMonth={plan ? guiltFreeByLabel[spaceDetailFor.label] || 0 : 0}
          onBack={() => setSpaceDetailFor(null)}
        />
      ) : showGuiltFree && plan ? (
        <GuiltFreePage percent={plan.split.guilt_free} onBack={() => setShowGuiltFree(false)} />
      ) : showCredit && plan && planSummary && hasCredit ? (
        <BudgetCreditPage
          percent={plan.split.third}
          budget={planSummary.credit.budget ?? 0}
          rates={planSummary.credit.rates}
          items={planSummary.credit.items}
          spaceKindById={spaceKindById}
          spaceNameById={spaceNameById}
          spaceColorById={spaceColorById}
          onOpenExpenses={expensesSpaceId ? () => router.push(`/${expensesSpaceId}` as any) : null}
          onBack={() => setShowCredit(false)}
        />
      ) : showOverview ? (
        <BudgetOverviewPage
          spending={spending}
          spaceKinds={spaceKinds}
          recurring={recurring}
          planned={planned}
          envelope={plan ? envelope : null}
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
            {/* The whole month at a glance -- opens the overview page
                (composition ring + ranked spend list). */}
            {!plan ? (
              <View testID="income-onboarding" {...topTarget} style={{ ...card, borderRadius: radius.lg, padding: spacing.gutter, gap: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="wallet-outline" size={20} color={colors.onSurface} />
                </View>
                <View style={{ gap: spacing.xs }}>
                  <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }}>Pornește de la venitul tău</Text>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary }}>
                    Spune-ne cât câștigi net pe lună. Îl împărțim în cinci, iar tot ce cheltuiești în spații se scade din necesități.
                  </Text>
                </View>
                {/* Tour step 3 ("Cele cinci părți") without a plan. */}
                <View {...onboardingSplitTarget} style={{ gap: 14 }}>
                  <View accessible accessibilityRole="image" accessibilityLabel="Împărțirea implicită: 55, 5, 10, 15, 15 la sută" style={{ flexDirection: "row", gap: 2, height: 10 }}>
                    {JAR_ORDER.map((k) => (
                      <View key={k} style={{ flex: DEFAULT_SPLIT[k], borderRadius: 5, backgroundColor: jarFill(k, colors, isDark), opacity: k === "needs" ? 0.85 : 1 }} />
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs }}>
                    {ONBOARDING_LEGEND.map(([p, t]) => (
                      <Text key={t} style={{ width: "50%", fontSize: 13, color: colors.onSurfaceTertiary }}>
                        <Text style={{ fontWeight: "600", color: colors.onSurface }}>{p}</Text> {t}
                      </Text>
                    ))}
                  </View>
                </View>
                <Button testID="income-onboarding-add" label="Adaugă venitul" onPress={() => setIncomeOpen(true)} />
              </View>
            ) : null}

            {plan ? (
              // Tour step 1 with a plan (without one it's the onboarding card).
              <View {...topTarget}>
              {pace && paceMerged ? (
                <BudgetPaceCard
                  E={heroBudget}
                  R={heroRecurring}
                  pAhead={heroPlanned}
                  S={heroSpent}
                  t={paceT}
                  D={paceD}
                  daily={paceMerged.daily}
                  events={paceMerged.events}
                  month={pace.month}
                  onPress={() => setShowOverview(true)}
                />
              ) : (
              // Older backend without `pace`: the previous ring hero.
              <PressableScale
                testID="budget-overview-entry"
                onPress={() => setShowOverview(true)}
                scaleTo={motion.scale.card}
                accessibilityRole="button"
                accessibilityLabel={`${heroLabel}: ${lei(heroSpent)} din ${lei(heroBudget)}. Vezi detalii`}
                style={{ ...card, borderRadius: radius.lg, padding: spacing.gutter, flexDirection: "row", alignItems: "center", gap: 18 }}
              >
                <RingProgress
                  value={heroRatio}
                  size={96}
                  color={severityColor(budgetSeverity(heroRatio), colors)}
                  trackColor={colors.surfaceTertiary}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{heroLabel}</Text>
                  <Text style={{ ...typography.display, color: colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>{lei(Math.round(heroSpent))}</Text>
                  <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>din {lei(Math.round(heroBudget))}</Text>
                  {heroRecurring > 0 ? (
                    <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>+ {lei(Math.round(heroRecurring))} plăți recurente de plătit</Text>
                  ) : null}
                  {heroPlanned > 0 ? (
                    <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>+ {lei(Math.round(heroPlanned))} planificat în Calendar</Text>
                  ) : null}
                  <Text style={{ fontSize: 13, color: heroLeft >= 0 ? colors.success : colors.error, marginTop: 4 }}>
                    {heroLeft >= 0 ? `Mai ai ${lei(Math.round(heroLeft))}` : `Ai depășit cu ${lei(Math.round(-heroLeft))}`}
                  </Text>
                </View>
              </PressableScale>
              )}
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

            {plan && planSummary ? (
              <IncomeSplitCard
                plan={plan}
                credit={{ rates: planSummary.credit.rates, count: planSummary.credit.count }}
                guiltFree={{ spent: planSummary.guiltFree.spent, planned: planSummary.guiltFree.planned }}
                savingsGoal={savingsGoal}
                onEditIncome={() => setIncomeOpen(true)}
                onEditSplit={() => setSplitOpen(true)}
                onOpenNeeds={() => setShowOverview(true)}
                onOpenGuiltFree={() => setShowGuiltFree(true)}
                onOpenCredit={() => setShowCredit(true)}
                onOpenGoal={openEditGoal}
              />
            ) : null}

            {/* Savings goal -- filled up automatically at month's end
                with whatever was left in each space's budget. With an
                income plan it lives in IncomeSplitCard's "Termen scurt"
                row instead. */}
            {!plan ? (
            <PressableScale
              testID="savings-goal-card"
              onPress={openEditGoal}
              scaleTo={motion.scale.card}
              accessibilityRole="button"
              accessibilityLabel="Editează obiectivul de economii"
              style={{ ...card, borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: spacing.lg, gap: spacing.md }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <IconWell icon="wallet-outline" color={goalIsNegative ? colors.error : colors.success} size={34} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>Economii</Text>
                    <InfoButton topic="budget.savings" />
                  </View>
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
            ) : null}

            <View style={{ gap: spacing.sm }} testID="section-recurring">
              {/* Tour step 4. */}
              <View {...recurringTarget}>
                <SectionHeader title="Plăți recurente" info="budget.recurring" />
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
                      one), but counted in the Credit jar, not here. No swipe:
                      a rate is a reminder, not something to resolve. */}
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
                              subtitle={`${spaceName ? `${spaceName} · ` : ""}socotită la Credit`}
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
          setPendingIncome(null);
        }}
        initialIncome={pendingIncome ?? plan?.monthly_income ?? null}
        split={plan?.split ?? DEFAULT_SPLIT}
        saving={savingIncome}
        onSave={saveIncome}
      />
      {plan && planSummary ? (
        <SplitSheet
          visible={splitOpen}
          onClose={() => setSplitOpen(false)}
          income={plan.monthly_income}
          initialSplit={plan.split}
          avgNeeds={planSummary.necessities.avg_last_3_months}
          hasCredit={hasCredit}
          creditRates={planSummary.credit.rates}
          saving={savingSplit}
          onSave={saveSplit}
        />
      ) : null}
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
    </TabScreen>
  );
}
