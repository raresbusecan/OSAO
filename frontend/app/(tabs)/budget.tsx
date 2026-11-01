import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, DeviceEventEmitter } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { useFocusEffect } from "expo-router";
import { useTabDepth } from "@/lib/navigation/returnTrail";
import { notifyAction, chooseAction } from "@/lib/confirm";
import { RingProgress } from "@/components/dashboard/RingProgress";
import { BudgetSpaceDetailPage } from "@/components/dashboard/BudgetSpaceDetailPage";
import { profileFromSpace, detectSpaceType, SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { BudgetOverviewPage } from "@/components/dashboard/BudgetOverviewPage";
import { RecurringBillRow, RecurringGroups, isRecurringPayment } from "@/components/dashboard/RecurringBillRow";
import { BudgetSplitBar, budgetUpcomingNote, budgetUpcomingSuffix, upcomingWords } from "@/components/dashboard/BudgetSplitBar";
import { SwipeItemRow } from "@/components/dashboard/SwipeItemRow";
import { IncomeSplitCard } from "@/components/dashboard/IncomeSplitCard";
import { IncomeSheet } from "@/components/dashboard/IncomeSheet";
import { SplitSheet } from "@/components/dashboard/SplitSheet";
import { ResplitSheet } from "@/components/dashboard/ResplitSheet";
import { GuiltFreePage } from "@/components/dashboard/GuiltFreePage";
import { BudgetCreditPage } from "@/components/dashboard/BudgetCreditPage";
import { DEFAULT_SPLIT, JAR_ORDER, jarFill, jarAmounts, primeBudgetPlan, unallocated, needsSpend, envelopeStatus, roundSuggested, type BudgetPlan, type BudgetPlanSummary, type BudgetSplit } from "@/lib/budget/plan";
import { useRouter } from "expo-router";
import { todoHref } from "@/lib/dashboard/spaceDue";
import { severityColor, budgetSeverity } from "@/lib/statusColors";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { PageTitle, SectionHeader, Group, IconWell, InfoButton, Button, Field, EmptyState, Row, Pill } from "@/components/ui/primitives";
import { useTourScroll, useTourTarget } from "@/components/ui/tourTargets";
import { useAutoTour } from "@/lib/useAutoTour";
import { SHOW_TOUR_TEST_BUTTON, startTour, type TourCtx } from "@/lib/tours";
import { motion } from "@/lib/motion";
import { lei, roNumber, roDate, parseLocaleNumber } from "@/lib/format";

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


// Every grocery_trip's title is literally "Cumpărături -- {listName}"
// (see groceryTripToItemBody) -- the row already says which space it
// is, so that fixed prefix is stripped for display only.
function biggestExpenseTitle(title: string): string {
  return title.replace(/^Cumpărături -- /, "");
}

const ONBOARDING_LEGEND: [string, string][] = [
  ["55%", "necesități"],
  ["5%", "bani fără vină"],
  ["10%", "investiții sau credit"],
  ["15%", "termen scurt"],
  ["15%", "termen lung"],
];

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** "sept." -- last month, short, for "Cea mai mare în sept.". */
function lastMonthShort(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toLocaleDateString("ro-RO", { month: "short" });
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
  const { card, colors, spacing, radius, typography, isDark } = useTheme();

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
  // Calendar purchases still ahead this month, per label -- also inside
  // `spent`, shown apart as "planificat" (BudgetController::plannedForLabel).
  const [planned, setPlanned] = useState<Record<string, number>>({});
  const [recurringBills, setRecurringBills] = useState<any[]>([]);
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

  // Every space row opens this detail page -- setting, changing and
  // deleting a budget all live inside it.
  const [spaceDetailFor, setSpaceDetailFor] = useState<{ label: string; icon: keyof typeof Ionicons.glyphMap; monthlyLimit?: number } | null>(null);
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
  const [resplitOpen, setResplitOpen] = useState(false);
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
      setLimits(b.limits || []);
      setSpending(b.spending || {});
      setBiggest(b.biggest || {});
      setRecurring(b.recurring || {});
      setPlanned(b.planned || {});
      setRecurringBills((b.recurringBills || []).filter(isRecurringPayment));
      setSavingsGoal(b.savingsGoal || null);
      primeBudgetPlan(b);
      setPlanSummary({
        plan: b.plan ?? null,
        necessities: b.necessities ?? { envelope: null, avg_last_3_months: 0 },
        guiltFree: b.guiltFree ?? { budget: null, spent: 0, planned: 0, count: 0 },
        credit: b.credit ?? { budget: null, rates: 0, count: 0, items: [] },
        suggested: b.suggested ?? null,
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
    const firstTime = !plan;
    const split = plan?.split ?? DEFAULT_SPLIT;
    let resplit = false;
    if (firstTime && limits.length > 0) {
      // Decision 9: existing per-space limits -- keep them, or re-split
      // the needs share over the spaces. Asked with the sheet closed (the
      // in-app dialog can't sit on top of an open sheet on web).
      setIncomeOpen(false);
      const current = limits.reduce((sum, l) => sum + l.monthly_limit, 0);
      const currentPct = Math.round((current / income) * 100);
      const needs = jarAmounts(income, split).needs;
      const choice = await chooseAction(
        "Ai deja bugete pe spații",
        `Bugetele de acum: ${lei(current)}, ${currentPct}% din venit. Necesitățile (${split.needs}%) înseamnă ${lei(Math.round(needs))}.`,
        [
          { key: "keep", label: "Păstrez bugetele actuale" },
          { key: "resplit", label: `Reîmpart cei ${split.needs}% pe spații`, secondary: true },
        ],
      );
      if (!choice) {
        setPendingIncome(income);
        setIncomeOpen(true);
        return;
      }
      resplit = choice === "resplit";
    } else if (firstTime && spaceKinds.length > 0) {
      // No budgets yet: every space gets its share right away (the sheet
      // opens prefilled with the suggested split; nothing saved unasked).
      resplit = true;
    }
    setSavingIncome(true);
    try {
      await savePlan(income, split);
      setIncomeOpen(false);
      setPendingIncome(null);
      if (resplit) setResplitOpen(true);
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

  // Just the set-budget spaces -- the hero and BudgetOverviewPage's own
  // header total agree on scope.
  const totalBudget = limits.reduce((sum, l) => sum + l.monthly_limit, 0);
  // `spent` from the API already folds in each space's recurring bills
  // as a flat monthly amount (BudgetController::monthlySumForLabel --
  // the savings rollover depends on that). On screen they're split:
  // "Cheltuit" is only what was actually recorded, the recurring part
  // is "de plătit", Calendar purchases still ahead are "planificat", and
  // the comparison with the budget uses all three.
  const totalCommitted = limits.reduce((sum, l) => sum + l.spent, 0);
  const totalRecurring = limits.reduce((sum, l) => sum + (recurring[l.category] || 0), 0);
  const totalPlanned = limits.reduce((sum, l) => sum + (planned[l.category] || 0), 0);
  const totalSpent = Math.max(0, totalCommitted - totalRecurring - totalPlanned);
  const totalRatio = totalBudget > 0 ? totalCommitted / totalBudget : 0;
  const left = totalBudget - totalCommitted;

  // With a plan the hero is "Cheltuit din necesități": EVERY label's spend
  // (fără vină already excluded by the API), against the envelope -- the
  // shared needsSpend() so Acasă's "Mai ai" and the drill-down agree.
  const needs = needsSpend(spending, recurring, planned);
  const needsCommitted = needs.committed;
  const needsRecurring = needs.recurring;
  const needsPlanned = needs.planned;
  const needsRecorded = needs.recorded;
  const needsLeft = envelope - needsCommitted;
  const allocated = limits.reduce((sum, l) => sum + l.monthly_limit, 0);
  const notAllocated = plan ? unallocated(envelope, limits) : 0;
  const allocStatus = envelopeStatus(notAllocated);
  const needsSegments = plan && envelope > 0
    ? spaceKinds
        .map((k) => ({ color: SPACE_IDENTITY_COLORS[k.kind] ?? colors.onSurfaceTertiary, share: (limits.find((l) => l.category === k.label)?.monthly_limit ?? 0) / Math.max(envelope, allocated) }))
        .filter((seg) => seg.share > 0)
    : [];

  const heroBudget = plan ? envelope : totalBudget;
  const heroSpent = plan ? needsRecorded : totalSpent;
  const heroRecurring = plan ? needsRecurring : totalRecurring;
  const heroPlanned = plan ? needsPlanned : totalPlanned;
  const heroLeft = plan ? needsLeft : left;
  const heroRatio = plan ? (envelope > 0 ? needsCommitted / envelope : 0) : totalRatio;
  const heroLabel = plan ? "Cheltuit din necesități" : "Cheltuit din buget";

  const tourCtx: TourCtx = { hasPlan: !!plan, hasSpaces: spaceKinds.length > 0, hasBudgets: limits.length > 0, hasCredit };
  useAutoTour("budget", {
    ready: !loading && !spaceDetailFor && !showOverview && !showGuiltFree && !showCredit && !incomeOpen && !splitOpen && !resplitOpen && !editingGoal,
    ctx: tourCtx,
  });

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="budget-screen">
      {spaceDetailFor ? (
        <BudgetSpaceDetailPage
          category={spaceDetailFor.label}
          icon={spaceDetailFor.icon}
          monthlyLimit={spaceDetailFor.monthlyLimit}
          plan={plan}
          suggested={roundSuggested(planSummary?.suggested, envelope)?.[spaceDetailFor.label] ?? null}
          otherLimitsTotal={limits.filter((l) => l.category !== spaceDetailFor.label).reduce((sum, l) => sum + l.monthly_limit, 0)}
          onBack={() => setSpaceDetailFor(null)}
          onLimitSaved={load}
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
          limits={limits}
          spending={spending}
          spaceKinds={spaceKinds}
          recurring={recurring}
          planned={planned}
          envelope={plan ? envelope : null}
          onBack={() => setShowOverview(false)}
        />
      ) : (
      <ScrollView ref={scrollRef} {...tourScroll} contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 140, gap: spacing.section }}>
        <PageTitle info="budget.page">Buget</PageTitle>

        {SHOW_TOUR_TEST_BUTTON ? (
          // TEMP for testing -- see SHOW_TOUR_TEST_BUTTON (lib/tours.ts).
          <View style={{ flexDirection: "row", marginTop: -spacing.md }}>
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
                    Spune-ne cât câștigi net pe lună. Îl împărțim în cinci și fiecare spațiu își primește bugetul din necesități.
                  </Text>
                </View>
                {/* Tour step 2 ("Cele cinci părți") without a plan. */}
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

            {plan || limits.length > 0 ? (
              // Tour step 1 with a plan (without one it's the onboarding card).
              <View {...(plan ? topTarget : {})}>
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
                  paceMarker={monthProgress()}
                  markerColor={colors.onSurfaceTertiary}
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
              </View>
            ) : null}

            {plan && planSummary ? (
              <IncomeSplitCard
                plan={plan}
                needs={{ recorded: needsRecorded, recurring: needsRecurring, planned: needsPlanned }}
                guiltFree={{ spent: planSummary.guiltFree.spent, planned: planSummary.guiltFree.planned }}
                credit={{ rates: planSummary.credit.rates, count: planSummary.credit.count }}
                savingsGoal={savingsGoal}
                needsSegments={needsSegments}
                onEditIncome={() => setIncomeOpen(true)}
                onEditSplit={() => setSplitOpen(true)}
                onOpenNeeds={() => setShowOverview(true)}
                onOpenGuiltFree={() => setShowGuiltFree(true)}
                onOpenCredit={() => setShowCredit(true)}
                onOpenGoal={openEditGoal}
              />
            ) : null}

            <View style={{ gap: spacing.sm }} testID="section-limits">
              <SectionHeader
                title={plan ? "Necesități pe spații" : "Pe spații"}
                info="budget.spaces"
                action={plan && spaceKinds.length > 0 ? { label: "Reîmparte", onPress: () => setResplitOpen(true), testID: "resplit-open", tone: colors.onSurface } : undefined}
              />
              {spaceKinds.length === 0 ? (
                <View {...spacesTarget} style={{ ...card, borderRadius: radius.card }}>
                  <EmptyState icon="wallet-outline" message="Creează un spațiu Mașină, Casă, Cumpărături sau Cheltuieli ca să-i poți pune un buget." />
                </View>
              ) : (
                <Group inset={62}>
                  {spaceKinds.map((meta, i) => {
                    const name = SPACE_KIND_LABEL[meta.kind] ?? meta.label;
                    const color = SPACE_IDENTITY_COLORS[meta.kind] ?? colors.onSurfaceTertiary;
                    const tint = spaceTextColor(meta.kind, isDark) ?? color;
                    const limit = limits.find((l) => l.category === meta.label);
                    const spend = spending[meta.label];
                    const topItem = biggest[meta.label];
                    const rec = recurring[meta.label] || 0;
                    const plannedAmt = planned[meta.label] || 0;
                    // Not spent yet: bills to pay + Calendar purchases ahead.
                    const up = rec + plannedAmt;
                    // Recorded spend only; the rest shown apart (hatched).
                    const recorded = Math.max(0, (limit ? limit.spent : spend?.this_month ?? 0) - up);

                    // Tone and pace from what was actually SPENT -- the bills
                    // still to pay sit in the bar's faded part (BudgetSplitBar)
                    // and get their own note, instead of turning an untouched
                    // budget red on the 1st of the month.
                    // A 0 limit is a real limit: any spend is already over it.
                    const ratio = !limit ? 0 : limit.monthly_limit > 0 ? recorded / limit.monthly_limit : recorded > 0 ? 2 : 0;
                    // A pace warning takes priority even under 80% --
                    // 20 points over pace a third into the month is a
                    // real early signal a plain ratio tone would miss.
                    const pace = limit ? paceDelta(ratio) : null;
                    const tone = pace !== null ? colors.warning : severityColor(budgetSeverity(ratio), colors);

                    const upcomingNote = limit ? budgetUpcomingNote(recorded, up, limit.monthly_limit, plannedAmt) : null;
                    // At most two notes, most urgent first. Whenever the bar
                    // holds bills not paid yet, one of them says so.
                    const notes = ([
                      limit && recorded > limit.monthly_limit
                        ? { text: `Depășit cu ${lei(recorded - limit.monthly_limit)}`, color: colors.error }
                        : null,
                      upcomingNote ? { text: upcomingNote.text, color: upcomingNote.tone === "warning" ? colors.warning : colors.onSurfaceTertiary } : null,
                      pace !== null ? { text: `Cu ${pace}% peste ritmul lunii`, color: colors.warning } : null,
                      plan && guiltFreeByLabel[meta.label] > 0 ? { text: `+ ${lei(Math.round(guiltFreeByLabel[meta.label]))} fără vină, socotiți separat`, color: colors.onSurfaceTertiary } : null,
                      topItem ? { text: `Cea mai mare${topItem.from_last_month ? " în " + lastMonthShort() : ""}: ${shorten(biggestExpenseTitle(topItem.title), 18)}, ${lei(topItem.amount)}`, color: colors.onSurfaceTertiary } : null,
                    ].filter(Boolean) as { text: string; color: string }[]).slice(0, 2);
                    // A linked credit's rate: its own line, outside the
                    // 2-note cap, shown with or without a limit.
                    const creditNote = creditByKind[meta.kind] ? `+ rată ${lei(Math.round(creditByKind[meta.kind]!))} pe lună, socotită la Credit` : null;

                    return (
                      // Tour step 3 points at the first space row.
                      <View key={meta.kind} {...(i === 0 ? spacesTarget : {})}>
                      <PressableScale
                        testID={limit ? `space-budget-${meta.kind}` : `space-budget-unset-${meta.kind}`}
                        onPress={() => setSpaceDetailFor({ label: meta.label, icon: meta.icon, monthlyLimit: limit?.monthly_limit })}
                        scaleTo={1}
                        pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
                        accessibilityRole="button"
                        accessibilityLabel={limit ? `${name}: ${lei(recorded)} cheltuiți din ${lei(limit.monthly_limit)}${up > 0 ? `, ${upcomingWords(rec, plannedAmt, lei)}` : ""}` : `Setează un buget pentru ${name}`}
                        style={{ paddingHorizontal: spacing.lg, paddingVertical: 14, gap: spacing.sm, backgroundColor: colors.surfaceSecondary }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                          <IconWell icon={meta.icon} color={color} tint={tint} size={34} />
                          <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>
                            {name}
                            {plan && limit && envelope > 0 ? (
                              <Text style={{ fontWeight: "400", color: colors.onSurfaceTertiary }}>{` · ${Math.round((limit.monthly_limit / envelope) * 100)}%`}</Text>
                            ) : null}
                          </Text>
                          {limit ? (
                            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
                              <Text style={{ fontWeight: "600", color: recorded > limit.monthly_limit ? colors.error : colors.onSurface }}>{roNumber(recorded, 2)}</Text>
                              {`${budgetUpcomingSuffix(up)} / ${lei(limit.monthly_limit)}`}
                            </Text>
                          ) : (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                              <Text style={{ fontSize: 14, color: tint }}>Setează</Text>
                              <Ionicons name="chevron-forward" size={14} color={tint} />
                            </View>
                          )}
                        </View>
                        {limit ? (
                          <BudgetSplitBar style={{ marginLeft: 46 }} recorded={recorded} upcoming={up} limit={limit.monthly_limit} color={tone} upcomingColor={color} />
                        ) : spend ? (
                          <Text style={{ marginLeft: 46, fontSize: 13, color: colors.onSurfaceTertiary }}>
                            {lei(recorded)} luna asta{up > 0 ? ` ${upcomingWords(rec, plannedAmt, lei)}` : ""}
                          </Text>
                        ) : null}
                        {limit && notes.length > 0 ? (
                          <View style={{ marginLeft: 46, gap: 2 }}>
                            {notes.map((n) => (
                              <Text key={n.text} style={{ fontSize: 13, lineHeight: 18, color: n.color }}>{n.text}</Text>
                            ))}
                          </View>
                        ) : null}
                        {creditNote ? (
                          <Text testID={`space-credit-note-${meta.kind}`} style={{ marginLeft: 46, fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>{creditNote}</Text>
                        ) : null}
                      </PressableScale>
                      </View>
                    );
                  })}
                  {plan ? (
                    <View testID="needs-footer" style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 48, backgroundColor: colors.surfaceSecondary }}>
                      <Ionicons
                        name={allocStatus === "exact" ? "checkmark" : allocStatus === "under" ? "ellipse-outline" : "alert-circle-outline"}
                        size={16}
                        color={allocStatus === "exact" ? colors.success : allocStatus === "under" ? colors.onSurfaceTertiary : colors.warning}
                      />
                      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: allocStatus === "over" ? colors.warning : colors.onSurfaceTertiary }}>
                        {allocStatus === "over"
                          ? `Bugetele trec de necesități cu ${lei(Math.round(-notAllocated))}`
                          : `Împărțit: ${roNumber(Math.round(allocated))} din ${lei(Math.round(envelope))}${allocStatus === "under" ? ` · Nealocat ${lei(Math.round(notAllocated))}` : ""}`}
                      </Text>
                    </View>
                  ) : null}
                </Group>
              )}
            </View>

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
      {plan ? (
        <ResplitSheet
          visible={resplitOpen}
          onClose={() => setResplitOpen(false)}
          envelope={envelope}
          suggested={planSummary?.suggested ?? null}
          spaces={spaceKinds}
          onSaved={load}
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
    </SafeAreaView>
  );
}
