import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  DeviceEventEmitter,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { useFocusEffect } from "expo-router";
import { notifyAction } from "@/lib/confirm";
import { ProgressBar } from "@/components/dashboard/ProgressBar";
import { RingProgress } from "@/components/dashboard/RingProgress";
import { BudgetSpaceDetailPage } from "@/components/dashboard/BudgetSpaceDetailPage";
import { profileFromSpace, detectSpaceType, SPACE_IDENTITY_COLORS, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { BudgetOverviewPage } from "@/components/dashboard/BudgetOverviewPage";
import { severityColor, budgetSeverity } from "@/lib/statusColors";

type BudgetLimit = { category: string; monthly_limit: number; spent: number };
type SavingsGoal = { target_amount: number; current_amount: number; target_date: string | null } | null;
type SpaceKindMeta = { kind: SpaceKind; label: string; icon: keyof typeof Ionicons.glyphMap };

// The same type->space label map Item::SPENDING_TYPE_SPACE uses on the
// backend for the Monthly Expenses breakdown -- a budget limit's
// `category` is one of these labels now, never a free-typed string, so
// "spent" always means "every real record from that space", not
// whatever happened to have a matching category column filled in.
const SPACE_KIND_META: Partial<Record<SpaceKind, { label: string; icon: keyof typeof Ionicons.glyphMap }>> = {
  car: { label: "Car", icon: "car-outline" },
  home: { label: "Home", icon: "home-outline" },
  grocery: { label: "Grocery", icon: "cart-outline" },
  expenses: { label: "Expenses", icon: "receipt-outline" },
};

// Every grocery_trip's title is literally "Cumpărături -- {listName}"
// (see groceryTripToItemBody in lib/spaces/grocery/groceryItems.ts) --
// on this card the space's own icon+label already says "Grocery", so
// that fixed prefix is pure noise that eats into the 2-line budget
// before the actual list name (the one distinguishing part) even
// starts. Stripped here for display only; the stored title (used
// elsewhere, e.g. a full expense history) is untouched.
function biggestExpenseTitle(title: string): string {
  return title.replace(/^Cumpărături -- /, "");
}

// Fraction of the current month already elapsed (0-1) -- what spending
// "should" be at today if a budget were spread evenly across the month.
// Inspired by PocketGuard's "Spending Pace": comparing this to the
// actual spent/limit ratio catches a space that's on track to go over
// well before it actually crosses 100%.
function monthProgress(): number {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / daysInMonth;
}

// How many percentage points ahead of pace a space is -- e.g. 67% of
// the month gone but 80% of the budget spent is +13. Null once already
// over budget (ratio >= 1): that's its own, more urgent state (red
// ring), a pace warning on top would just be noise.
function paceDelta(ratio: number): number | null {
  if (ratio >= 1) return null;
  const pace = monthProgress();
  const delta = (ratio - pace) * 100;
  return delta > 10 ? Math.round(delta) : null;
}

export default function BudgetScreen() {
  const { colors, spacing, radius, typography } = useTheme();

  const [limits, setLimits] = useState<BudgetLimit[]>([]);
  // Real spend per space label, this month + last month + a 3-month
  // average -- populated regardless of whether a limit is set there
  // yet, so an unset card can still show real numbers (see the
  // unset-card render below) instead of a bare "set a budget" prompt
  // with nothing to base the number on.
  const [spending, setSpending] = useState<Record<string, { this_month: number; last_month: number; avg_last_3_months: number }>>({});
  // This month's single largest line item per label -- "what's
  // actually driving the number", not just the total.
  const [biggest, setBiggest] = useState<Record<string, { title: string; amount: number; from_last_month: boolean } | null>>({});
  // Home-only: total monthly commitment from active Recurring items --
  // deliberately separate from `spent` (see BudgetController::index's
  // own comment on why home_recurring stays out of SPENDING_TYPES).
  const [recurring, setRecurring] = useState<Record<string, number>>({});
  const [recurringBills, setRecurringBills] = useState<any[]>([]);
  const [savingsGoal, setSavingsGoal] = useState<SavingsGoal>(null);
  // Every space kind the user actually has at least one space for
  // (Car/Home/Grocery/Expenses -- "other" spaces don't feed the
  // spending aggregation at all, so they never get a budget card) --
  // "based on which spaces exist", not a fixed list of 4.
  const [spaceKinds, setSpaceKinds] = useState<SpaceKindMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // Every ring card (set or unset) opens this same detail page now --
  // setting, changing and deleting a budget all live inside it (its own
  // "BUGET" section), not a separate sheet here. No 3-month history
  // required: that section falls back to a plain manual amount once
  // there's nothing to base a % suggestion on.
  const [spaceDetailFor, setSpaceDetailFor] = useState<{ label: string; icon: keyof typeof Ionicons.glyphMap; monthlyLimit?: number } | null>(null);

  // Reached from the row right under the Savings Goal card -- both are
  // "whole picture" concerns (not one specific space), so they live
  // next to each other at the top of the tab.
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

  const goalProgress = savingsGoal && savingsGoal.target_amount > 0
    ? Math.max(0, Math.min(1, savingsGoal.current_amount / savingsGoal.target_amount))
    : 0;
  const goalIsNegative = !!savingsGoal && savingsGoal.current_amount < 0;

  // Just the set-budget spaces -- the same "Buget total" entry row's
  // preview and BudgetOverviewPage's own header total agree on scope
  // (spaces without a limit still show up in that page's ranked list,
  // just not in this cumulative sum).
  const totalBudgetAcrossSpaces = limits.reduce((sum, l) => sum + l.monthly_limit, 0);
  const totalSpentAcrossSpaces = limits.reduce((sum, l) => sum + l.spent, 0);

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
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140, gap: spacing.xl }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>
          Budget
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.onSurfaceTertiary} />
        ) : (
          <>
            {/* Savings goal */}
            <Pressable
              testID="savings-goal-card"
              onPress={openEditGoal}
              accessibilityRole="button"
              accessibilityLabel="Edit savings goal"
              style={{
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.sm,
                padding: spacing.lg,
                gap: spacing.sm,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ ...typography.label, color: colors.onSurfaceTertiary }}>
                  SAVINGS GOAL
                </Text>
                <Ionicons name="create-outline" size={16} color={colors.caution} />
              </View>

              {savingsGoal ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                    <Text style={{ ...typography.title, color: goalIsNegative ? colors.error : colors.onSurface }}>
                      {savingsGoal.current_amount.toLocaleString("en-US")}
                    </Text>
                    <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary }}>
                      / {savingsGoal.target_amount.toLocaleString("en-US")} RON
                    </Text>
                  </View>
                  <ProgressBar value={goalProgress} tone={goalIsNegative ? "error" : "success"} />
                  {goalIsNegative ? (
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.error }}>
                      Ai cheltuit cu {Math.abs(savingsGoal.current_amount).toLocaleString("en-US")} RON peste bugetele planificate.
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 10.5, color: colors.onSurfaceTertiary }}>
                      Se adaugă automat, la final de lună, tot ce economisești din bugetele fiecărui space.
                    </Text>
                  )}
                </>
              ) : (
                <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary }}>
                  No savings goal set yet. Tap to add one.
                </Text>
              )}
            </Pressable>

            {/* Buget total -- the entry point into BudgetOverviewPage's
                Model 3 (composition ring + ranked spend list). Right
                under Savings Goal on purpose: both answer a whole-
                picture question, not a single space's, so they sit
                together before the per-space grid below. */}
            {limits.length > 0 ? (
              <Pressable
                testID="budget-overview-entry"
                onPress={() => setShowOverview(true)}
                accessibilityRole="button"
                accessibilityLabel={`Total budget: ${totalSpentAcrossSpaces} of ${totalBudgetAcrossSpaces} RON`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.sm,
                  padding: spacing.lg,
                }}
              >
                <View style={{ flexDirection: "row" }}>
                  {limits.map((l, index) => {
                    const kind = spaceKinds.find((k) => k.label === l.category)?.kind;
                    const dotColor = (kind && SPACE_IDENTITY_COLORS[kind]) || colors.onSurfaceTertiary;
                    return (
                      <View
                        key={l.category}
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: dotColor,
                          marginLeft: index === 0 ? 0 : -4,
                          borderWidth: 2,
                          borderColor: colors.surface,
                        }}
                      />
                    );
                  })}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>Buget total</Text>
                  <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginTop: 1 }}>
                    {totalSpentAcrossSpaces.toLocaleString("en-US")} / {totalBudgetAcrossSpaces.toLocaleString("en-US")} RON · {limits.length} spaces
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            ) : null}

            {/* Space budgets -- one ring per space the user actually has,
                planned (the limit) vs. actual (real spend collected from
                that space, same source as Monthly Expenses). */}
            <View style={{ gap: spacing.md }} testID="section-limits">
              <Text style={{ ...typography.label, color: colors.onSurfaceTertiary }}>
                SPACE BUDGETS
              </Text>

              {spaceKinds.length === 0 ? (
                <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg }}>
                  <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary }}>
                    No Car, Home, Grocery or Expenses space yet -- create one to set a budget for it.
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                  {spaceKinds.map((meta) => {
                    const limit = limits.find((l) => l.category === meta.label);
                    const cardWidth = "47%" as const;

                    if (!limit) {
                      // No limit yet, but real spend still shows -- this
                      // month plus a vs.-last-month comparison, so
                      // setting a first number is an informed guess, not
                      // a blind one.
                      const spend = spending[meta.label];
                      const change = spend && spend.last_month > 0
                        ? ((spend.this_month - spend.last_month) / spend.last_month) * 100
                        : null;

                      return (
                        <Pressable
                          key={meta.kind}
                          testID={`space-budget-unset-${meta.kind}`}
                          onPress={() => setSpaceDetailFor({ label: meta.label, icon: meta.icon })}
                          accessibilityRole="button"
                          accessibilityLabel={`Set a budget for ${meta.label}`}
                          style={{
                            width: cardWidth,
                            borderRadius: radius.sm,
                            borderWidth: 1.5,
                            borderStyle: "dashed",
                            borderColor: colors.border,
                            padding: spacing.lg,
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Ionicons name={meta.icon} size={20} color={SPACE_IDENTITY_COLORS[meta.kind] ?? colors.onSurfaceTertiary} />
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>{meta.label}</Text>

                          {spend ? (
                            <>
                              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface }}>
                                {spend.this_month.toLocaleString("en-US")} <Text style={{ fontSize: 11, fontWeight: "600", color: colors.onSurfaceTertiary }}>RON</Text>
                              </Text>
                              {spend.last_month > 0 ? (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                                  {change !== null ? (
                                    <Ionicons
                                      name={change > 0 ? "arrow-up" : change < 0 ? "arrow-down" : "remove"}
                                      size={10}
                                      color={colors.onSurfaceTertiary}
                                    />
                                  ) : null}
                                  <Text style={{ fontSize: 10.5, color: colors.onSurfaceTertiary }}>
                                    vs {spend.last_month.toLocaleString("en-US")} luna trecută
                                  </Text>
                                </View>
                              ) : null}
                            </>
                          ) : null}

                          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onSurface, marginTop: 4 }}>
                            Setează un buget
                          </Text>
                        </Pressable>
                      );
                    }

                    const ratio = limit.monthly_limit > 0 ? limit.spent / limit.monthly_limit : 0;
                    // A pace warning still takes priority visually even
                    // under 80% -- 20% over pace at month's 1/3 mark is a
                    // real early signal that a plain ratio-based tone
                    // would miss until it's too late to react.
                    const pace = paceDelta(ratio);
                    const tone = pace !== null ? colors.warning : severityColor(budgetSeverity(ratio), colors);
                    const topItem = biggest[meta.label];
                    const recurringNote = meta.label === "Home" ? recurring["Home"] : 0;

                    return (
                      <Pressable
                        key={meta.kind}
                        testID={`space-budget-${meta.kind}`}
                        onPress={() => setSpaceDetailFor({ label: meta.label, icon: meta.icon, monthlyLimit: limit.monthly_limit })}
                        accessibilityRole="button"
                        accessibilityLabel={`${meta.label}: ${limit.spent} of ${limit.monthly_limit} RON`}
                        style={{
                          width: cardWidth,
                          backgroundColor: "transparent",
                          borderRadius: radius.sm,
                          padding: spacing.lg,
                          alignItems: "center",
                          gap: spacing.sm,
                          borderWidth: 1,
                          borderColor: ratio >= 1 ? colors.error : colors.border,
                        }}
                      >
                        <View style={{ width: 84, height: 84, alignItems: "center", justifyContent: "center" }}>
                          <RingProgress
                            value={ratio}
                            color={tone}
                            trackColor={colors.surfaceTertiary}
                            paceMarker={monthProgress()}
                            markerColor={colors.onSurface}
                          />
                          <Text style={{ position: "absolute", fontSize: 15, fontWeight: "800", color: colors.onSurface }}>
                            {Math.round(ratio * 100)}%
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons name={meta.icon} size={13} color={SPACE_IDENTITY_COLORS[meta.kind] ?? colors.onSurface} />
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>{meta.label}</Text>
                        </View>
                        <Text style={{ fontSize: 11.5, color: ratio >= 1 ? colors.error : colors.onSurfaceTertiary, fontWeight: ratio >= 1 ? "700" : "400" }}>
                          {limit.spent.toLocaleString("en-US")} / {limit.monthly_limit.toLocaleString("en-US")} RON
                        </Text>

                        {pace !== null ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Ionicons name="trending-up" size={11} color={colors.warning} />
                            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.warning }}>
                              {pace}% peste ritmul normal
                            </Text>
                          </View>
                        ) : null}

                        {topItem ? (
                          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4, width: "100%" }}>
                            <Ionicons name="flame-outline" size={11} color={colors.onSurfaceTertiary} style={{ marginTop: 1.5 }} />
                            <Text style={{ fontSize: 10.5, color: colors.onSurfaceTertiary, lineHeight: 13, textAlign: "center", flex: 1 }} numberOfLines={3}>
                              Cea mai mare {topItem.from_last_month ? "(luna trecută)" : ""}: {biggestExpenseTitle(topItem.title)} · {topItem.amount.toLocaleString("en-US")} RON
                            </Text>
                          </View>
                        ) : null}

                        {recurringNote > 0 ? (
                          <Text style={{ fontSize: 10.5, color: colors.onSurfaceTertiary }}>
                            din care {recurringNote.toLocaleString("en-US")} RON recurente
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Recurring bills */}
            <View style={{ gap: spacing.md }} testID="section-recurring">
              <Text style={{ ...typography.label, color: colors.onSurfaceTertiary }}>
                RECURRING BILLS
              </Text>

              {recurringBills.length === 0 ? (
                <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg }}>
                  <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary }}>
                    Nothing recurring yet -- add one from a Home space's Recurring category.
                  </Text>
                </View>
              ) : (
                <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
                  {recurringBills.map((bill, index) => (
                    <View
                      key={bill.id}
                      testID={`recurring-bill-${bill.id}`}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: spacing.md,
                        paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                        borderBottomWidth: index === recurringBills.length - 1 ? 0 : StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <Ionicons name="repeat-outline" size={18} color={colors.onSurfaceTertiary} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.body, color: colors.onSurface }}>{bill.title}</Text>
                        <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary }}>
                          {bill.recurrence}
                          {bill.due_at ? ` · next ${new Date(bill.due_at).toLocaleDateString()}` : ""}
                        </Text>
                      </View>
                      {bill.amount != null ? (
                        <Text style={{ ...typography.body, color: colors.onSurface }}>
                          {Number(bill.amount).toLocaleString("en-US")} {bill.currency || "RON"}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
      )}

      {/* Edit savings goal */}
      <Modal visible={editingGoal} animationType="slide" transparent onRequestClose={() => setEditingGoal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable onPress={() => setEditingGoal(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />
          <View style={{ backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
            <Text style={{ ...typography.subtitle, color: colors.onSurface }}>Savings Goal</Text>
            <TextInput
              testID="goal-target-input"
              value={goalTarget}
              onChangeText={setGoalTarget}
              placeholder="Target amount (RON)"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="decimal-pad"
              autoFocus
              style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16 }}
            />
            <TextInput
              testID="goal-current-input"
              value={goalCurrent}
              onChangeText={setGoalCurrent}
              placeholder="Saved so far (RON)"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="decimal-pad"
              style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16 }}
            />
            <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginTop: -8 }}>
              Se actualizează automat la final de lună -- schimbă suma aici doar dacă vrei să o corectezi manual.
            </Text>
            <Pressable
              testID="goal-save-button"
              onPress={saveGoal}
              disabled={savingGoal || !goalTarget.trim()}
              accessibilityRole="button"
              accessibilityLabel="Save goal"
              accessibilityState={{ busy: savingGoal, disabled: savingGoal || !goalTarget.trim() }}
              style={{ backgroundColor: colors.brandPrimary, opacity: savingGoal || !goalTarget.trim() ? 0.5 : 1, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" }}
            >
              {savingGoal ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 }}>Save Goal</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
