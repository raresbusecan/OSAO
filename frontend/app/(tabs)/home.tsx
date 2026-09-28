import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, DeviceEventEmitter, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { useFocusEffect, useRouter } from "expo-router";
import { RingProgress } from "@/components/dashboard/RingProgress";
import { TodoCarouselSheet } from "@/components/dashboard/TodoCarouselSheet";
import { detectSpaceType, profileFromSpace, SPACE_IDENTITY_COLORS, CUSTOM_EVENT_COLOR, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { severityColor, type SeverityTier } from "@/lib/statusColors";

function greeting(name?: string) {
  const h = new Date().getHours();
  const t = h < 5 ? "Noapte bună" : h < 12 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara";
  return name ? `${t}, ${name.split(" ")[0]}` : t;
}

const SPACE_KIND_META: Partial<Record<SpaceKind, { label: string; icon: keyof typeof Ionicons.glyphMap }>> = {
  car: { label: "Car", icon: "car-outline" },
  home: { label: "Home", icon: "home-outline" },
  grocery: { label: "Grocery", icon: "cart-outline" },
  expenses: { label: "Expenses", icon: "receipt-outline" },
};

type ActionableItem = { id: number | string; type: string; title: string; due_at: string; space: { id: number | string; name: string; icon: string } | null };
type SpaceCard = { kind: SpaceKind; label: string; icon: keyof typeof Ionicons.glyphMap; spaceId: number | string };

/**
 * Widget-grid Home -- 4-5 glanceable cards instead of a long scrolling
 * list, adapted from real dashboard patterns (Copilot Money's spend
 * ring, 2026 dashboard-grid trends: a handful of the most important
 * numbers, each in its own card, not one long feed). Every number here
 * comes from real data already built elsewhere (Budget, Calendar) --
 * nothing mocked.
 */
export default function Home() {
  const { colors, spacing, radius } = useTheme();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<{
    today: ActionableItem[]; upcoming: ActionableItem[]; overdue: ActionableItem[];
    monthlyExpenses: { total: number; sources: { spaceName: string; icon: string; amount: number }[] };
  } | null>(null);
  const [budget, setBudget] = useState<{
    limits: { category: string; monthly_limit: number; spent: number }[];
    recurringBills: any[];
    savingsGoal: { target_amount: number; current_amount: number; target_date: string | null } | null;
  } | null>(null);
  const [spaceCards, setSpaceCards] = useState<SpaceCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todoSheetVisible, setTodoSheetVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, b, spacesRes] = await Promise.all([api.dashboard(), api.getBudget(), api.listSpaces()]);
      setDashboard(d);
      setBudget(b);

      const seen = new Set<SpaceKind>();
      const kinds: SpaceCard[] = [];
      (spacesRes.spaces || []).forEach((s: any) => {
        const kind = detectSpaceType(s, profileFromSpace(s));
        const meta = SPACE_KIND_META[kind];
        if (meta && !seen.has(kind)) {
          seen.add(kind);
          kinds.push({ kind, ...meta, spaceId: s.id });
        }
      });
      setSpaceCards(kinds);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => load());
    return () => sub.remove();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totalBudget = budget ? budget.limits.reduce((sum, l) => sum + l.monthly_limit, 0) : 0;
  const totalSpent = budget ? budget.limits.reduce((sum, l) => sum + l.spent, 0) : 0;
  const budgetRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const budgetTone = budgetRatio >= 1 ? colors.error : budgetRatio >= 0.8 ? colors.warning : colors.success;

  const todoCount = dashboard ? dashboard.overdue.length + dashboard.today.length + dashboard.upcoming.length : 0;

  // The TRUE cross-space total -- every SPENDING_TYPES item this month,
  // regardless of whether that space/category even has a budget limit
  // set (BUGET TOTAL above only sums categories with a limit -- a space
  // with none set is invisible there, not "0 spent"). Same source data
  // Budget's own per-category totals come from, just rolled up here
  // instead of split by limit.
  const monthlyExpenses = dashboard?.monthlyExpenses ?? { total: 0, sources: [] };

  // Per-space breakdown for the DE FĂCUT card: each space's count colored
  // by the worst (most urgent) item it has -- overdue beats today beats
  // upcoming -- so "Car 4 in red" actually means "Car has something
  // overdue", not just "Car has 4 things eventually". Identity color/icon
  // reused from spaceCards (already correctly detected there) instead of
  // re-deriving space kind from the dashboard item's bare {id,name,icon}.
  const spaceCardById = useMemo(() => {
    const map = new Map<string, SpaceCard>();
    spaceCards.forEach((s) => map.set(String(s.spaceId), s));
    return map;
  }, [spaceCards]);

  const SEVERITY_RANK: Record<SeverityTier, number> = { safe: 0, caution: 1, warning: 2, critical: 3 };

  const todoBySpace = useMemo(() => {
    type Group = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; count: number; severity: SeverityTier };
    if (!dashboard) return [] as Group[];
    const groups = new Map<string, Group>();
    const bump = (items: ActionableItem[], severity: SeverityTier) => {
      items.forEach((item) => {
        const key = item.space ? String(item.space.id) : "custom";
        const card = item.space ? spaceCardById.get(key) : undefined;
        const existing = groups.get(key);
        if (existing) {
          existing.count += 1;
          if (SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity]) existing.severity = severity;
        } else {
          groups.set(key, {
            key,
            label: card?.label ?? item.space?.name ?? "Personale",
            icon: card?.icon ?? (item.space?.icon as keyof typeof Ionicons.glyphMap) ?? "sparkles-outline",
            color: card ? (SPACE_IDENTITY_COLORS[card.kind] ?? colors.onSurfaceTertiary) : CUSTOM_EVENT_COLOR,
            count: 1,
            severity,
          });
        }
      });
    };
    // Same 3-of-4 tiers Car/Home already use for urgency (see
    // lib/statusColors.ts) -- "caution" is reserved for a closer-but-not-
    // due-yet warning those pages show, which the dashboard's plain
    // overdue/today/upcoming split doesn't distinguish.
    bump(dashboard.overdue, "critical");
    bump(dashboard.today, "warning");
    bump(dashboard.upcoming, "safe");
    return Array.from(groups.values()).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.count - a.count);
  }, [dashboard, spaceCardById, colors.onSurfaceTertiary]);

  const goalRatio = budget?.savingsGoal && budget.savingsGoal.target_amount > 0
    ? Math.max(0, Math.min(1, budget.savingsGoal.current_amount / budget.savingsGoal.target_amount))
    : 0;

  const nextBills = (budget?.recurringBills || []).slice(0, 2);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.onSurfaceTertiary} />}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, letterSpacing: 0.4, fontWeight: "600" }}>
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
            </Text>
            <Pressable
              onPress={() => router.push("/settings")}
              testID="home-greeting-settings-link"
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
            >
              <Text style={{ fontSize: 26, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>
                {greeting(user?.name)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
          <Pressable
            onPress={signOut}
            testID="home-signout-button"
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Ionicons name="log-out-outline" size={22} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.onSurfaceTertiary} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {/* BUGET TOTAL -- full width. totalBudget === 0 means
                literally nothing in budget_categories yet (not "0 spent
                of a real budget") -- a bare "0/0 RON" read as broken, so
                that state gets its own message instead of the ring. */}
            <Pressable
              testID="home-widget-budget"
              onPress={() => router.push("/budget")}
              accessibilityRole="button"
              accessibilityLabel={totalBudget > 0 ? `Total budget: ${totalSpent} of ${totalBudget} RON` : "No budget set yet"}
              style={{ width: "100%", backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }}
            >
              {totalBudget > 0 ? (
                <>
                  <View style={{ width: 52, height: 52 }}>
                    <RingProgress value={budgetRatio} size={52} strokeWidth={7} color={budgetTone} trackColor={colors.surfaceTertiary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.4 }}>BUGET TOTAL</Text>
                    <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface, marginTop: 1 }}>
                      {totalSpent.toLocaleString("en-US")} / {totalBudget.toLocaleString("en-US")} RON
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
                </>
              ) : (
                <>
                  <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="wallet-outline" size={18} color={colors.onSurfaceTertiary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.4 }}>BUGET TOTAL</Text>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface, marginTop: 1 }}>
                      Nu ai niciun buget setat încă
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.onSurface }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.surface }}>Setează bugetul</Text>
                  </View>
                </>
              )}
            </Pressable>

            {/* CHELTUIT LUNA ACEASTA -- the true cross-space total, not
                just what has a budget limit set (see monthlyExpenses'
                own comment above). Tapping goes to Budget too, same as
                BUGET TOTAL -- there's no single "everything, unfiltered"
                detail page, and Budget's own per-category breakdown is
                the closest real one. Omitted entirely at 0 -- nothing
                spent yet this month reads as "nothing to show," not an
                empty card worth a whole row. */}
            {monthlyExpenses.total > 0 ? (
              <Pressable
                testID="home-widget-monthly-expenses"
                onPress={() => router.push("/budget")}
                accessibilityRole="button"
                accessibilityLabel={`Cheltuit luna aceasta: ${monthlyExpenses.total} RON`}
                style={{ width: "100%", backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg, gap: spacing.sm }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="card-outline" size={14} color={colors.onSurface} />
                  <Text style={{ fontSize: 11, fontWeight: "800", color: colors.onSurfaceTertiary, letterSpacing: 0.3 }}>CHELTUIT LUNA ACEASTA</Text>
                </View>
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface }}>
                  {monthlyExpenses.total.toLocaleString("en-US")} RON
                </Text>
                {monthlyExpenses.sources.length > 0 ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}>
                    {monthlyExpenses.sources.map((s) => {
                      const kind = s.spaceName.toLowerCase() as SpaceKind;
                      const identityColor = SPACE_IDENTITY_COLORS[kind] ?? colors.onSurfaceTertiary;
                      return (
                        <View key={s.spaceName} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={14} color={identityColor} />
                          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onSurface }}>{s.spaceName}</Text>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                            {s.amount.toLocaleString("en-US")}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </Pressable>
            ) : null}

            {/* DE FĂCUT -- opens the carousel, doesn't jump straight to
                Calendar: which screen actually resolves a to-do depends
                on which one it is (see TodoCarouselSheet's "Deschide").
                Full width so the per-space breakdown has room -- each
                space's own count, colored by its most urgent item. */}
            <Pressable
              testID="home-widget-todo"
              onPress={() => setTodoSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`${todoCount} things to do`}
              style={{ width: "100%", backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg, gap: spacing.sm }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="checkmark-done-outline" size={14} color={colors.onSurface} />
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.onSurfaceTertiary, letterSpacing: 0.3 }}>DE FĂCUT</Text>
              </View>
              {todoBySpace.length === 0 ? (
                <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>Nimic de făcut -- la zi.</Text>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}>
                  {todoBySpace.map((g) => (
                    <View key={g.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name={g.icon} size={14} color={g.color} />
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onSurface }}>{g.label}</Text>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: severityColor(g.severity, colors) }}>{g.count}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>

            {/* ECONOMII */}
            <Pressable
              testID="home-widget-savings"
              onPress={() => router.push("/budget")}
              accessibilityRole="button"
              accessibilityLabel="Savings goal"
              style={{ flex: 1, minWidth: "47%", backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg, gap: 6 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="trending-up-outline" size={14} color={colors.onSurface} />
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.onSurfaceTertiary, letterSpacing: 0.3 }}>ECONOMII</Text>
              </View>
              {budget?.savingsGoal ? (
                <>
                  <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface }}>
                    {budget.savingsGoal.current_amount.toLocaleString("en-US")}
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.onSurfaceTertiary }}> / {budget.savingsGoal.target_amount.toLocaleString("en-US")}</Text>
                  </Text>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
                    <View style={{ width: `${goalRatio * 100}%`, height: "100%", backgroundColor: colors.success }} />
                  </View>
                </>
              ) : (
                <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>Niciun obiectiv setat</Text>
              )}
            </Pressable>

            {/* RECURENTE APROPIATE -- full width */}
            {nextBills.length > 0 ? (
              <View style={{ width: "100%", backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg, gap: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="repeat-outline" size={14} color={colors.onSurface} />
                  <Text style={{ fontSize: 11, fontWeight: "800", color: colors.onSurfaceTertiary, letterSpacing: 0.3 }}>RECURENTE APROPIATE</Text>
                </View>
                {nextBills.map((bill: any) => (
                  <Pressable
                    key={bill.id}
                    testID={`home-recurring-${bill.id}`}
                    onPress={() => router.push("/calendar")}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{bill.title}</Text>
                    <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary }}>
                      {new Date(bill.due_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      {bill.amount != null ? ` · ${Number(bill.amount).toLocaleString("en-US")} RON` : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      <TodoCarouselSheet
        visible={todoSheetVisible}
        onClose={() => setTodoSheetVisible(false)}
        overdue={dashboard?.overdue || []}
        today={dashboard?.today || []}
        upcoming={dashboard?.upcoming || []}
        onChanged={load}
      />
    </SafeAreaView>
  );
}
