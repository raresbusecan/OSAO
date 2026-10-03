import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, DeviceEventEmitter, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { useFocusEffect, useRouter } from "expo-router";
import { TodoCarouselSheet } from "@/components/dashboard/TodoCarouselSheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { motion, useReducedMotion } from "@/lib/motion";
import {
  detectSpaceType,
  profileFromSpace,
  SPACE_IDENTITY_COLORS,
  SPACE_KIND_LABEL,
  CUSTOM_EVENT_COLOR,
  spaceTextColor,
  type SpaceKind,
} from "@/lib/spaces/spaceProfile";

function greeting(name?: string) {
  const h = new Date().getHours();
  const t = h < 5 ? "Noapte bună" : h < 12 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara";
  return name ? `${t}, ${name.split(" ")[0]}` : t;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lei = (n: number) => `${Math.round(n).toLocaleString("ro-RO")} lei`;

const KIND_ICON: Partial<Record<SpaceKind, keyof typeof Ionicons.glyphMap>> = {
  car: "car-outline",
  home: "home-outline",
  grocery: "cart-outline",
  expenses: "receipt-outline",
};

/** Backend's monthlyExpenses.sources[].spaceName is the space KIND's
 * English label (Item::SPENDING_TYPE_SPACE), not a user-given name. */
const SOURCE_KIND: Record<string, SpaceKind> = { Car: "car", Home: "home", Grocery: "grocery", Expenses: "expenses" };

type ActionableItem = { id: number | string; type: string; title: string; due_at: string; space: { id: number | string; name: string; icon: string } | null };
type SpaceCard = { id: string; name: string; kind: SpaceKind };
type Urgency = "overdue" | "today" | "upcoming";
type TodoRow = ActionableItem & { urgency: Urgency; days: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Home tab, 2026-10 redesign: one hero card answering "where did this
 * month's money go" (the cross-space total, split by space color), then
 * what needs doing, then the spaces themselves. Every number comes from
 * real data (api.dashboard / api.getBudget / api.listSpaces) -- nothing
 * mocked. The hero's count-up and bar fill are the app's one unprompted
 * motion; everything else only moves when touched.
 */
export default function Home() {
  const { colors, spacing, radius, isDark } = useTheme();
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
  const [spaces, setSpaces] = useState<SpaceCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todoSheetVisible, setTodoSheetVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, b, spacesRes] = await Promise.all([api.dashboard(), api.getBudget(), api.listSpaces()]);
      setDashboard(d);
      setBudget(b);
      setSpaces(
        (spacesRes.spaces || []).map((s: any) => ({
          id: String(s.id),
          name: s.name,
          kind: detectSpaceType(s, profileFromSpace(s)),
        })),
      );
    } catch {}
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => load());
    return () => sub.remove();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const now = new Date();
  const totalBudget = budget ? budget.limits.reduce((sum, l) => sum + l.monthly_limit, 0) : 0;
  const monthly = dashboard?.monthlyExpenses ?? { total: 0, sources: [] };
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  const monthName = now.toLocaleDateString("ro-RO", { month: "long" });

  // Bar segments: each space kind's share of the month, against the
  // budget when there is one (so the empty track IS what's left), else
  // against the total itself (a pure split, no remaining track).
  const segments = useMemo(() => {
    const scale = Math.max(totalBudget, monthly.total, 1);
    return monthly.sources
      .map((s) => {
        const kind = SOURCE_KIND[s.spaceName] ?? "other";
        return {
          key: s.spaceName,
          kind,
          label: SPACE_KIND_LABEL[kind] ?? s.spaceName,
          amount: s.amount,
          share: s.amount / scale,
          color: SPACE_IDENTITY_COLORS[kind] ?? colors.onSurfaceTertiary,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [monthly, totalBudget, colors.onSurfaceTertiary]);

  const todoRows = useMemo<TodoRow[]>(() => {
    if (!dashboard) return [];
    const today = startOfDay(new Date());
    const tag = (items: ActionableItem[], urgency: Urgency) =>
      items.map((it) => ({ ...it, urgency, days: Math.round((startOfDay(new Date(it.due_at)) - today) / DAY_MS) }));
    return [...tag(dashboard.overdue, "overdue"), ...tag(dashboard.today, "today"), ...tag(dashboard.upcoming, "upcoming")];
  }, [dashboard]);

  const todoCountBySpace = useMemo(() => {
    const m = new Map<string, number>();
    todoRows.forEach((r) => r.space && m.set(String(r.space.id), (m.get(String(r.space.id)) ?? 0) + 1));
    return m;
  }, [todoRows]);

  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const kindCount = useMemo(() => {
    const m = new Map<SpaceKind, number>();
    spaces.forEach((s) => m.set(s.kind, (m.get(s.kind) ?? 0) + 1));
    return m;
  }, [spaces]);

  const goal = budget?.savingsGoal ?? null;
  const goalRatio = goal && goal.target_amount > 0 ? Math.max(0, Math.min(1, goal.current_amount / goal.target_amount)) : 0;
  const nextBills = (budget?.recurringBills || []).slice(0, 3);

  const card = { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg + 4 } as const;
  const sectionTitle = { fontSize: 17, fontWeight: "600" as const, color: colors.onSurface };
  const muted = colors.onSurfaceTertiary;

  const remaining = totalBudget - monthly.total;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg + 4, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={muted} />}
      >
        {/* Header -- the greeting and the avatar both open Settings. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <PressableScale
            onPress={() => router.push("/settings")}
            testID="home-greeting-settings-link"
            accessibilityRole="button"
            accessibilityLabel="Deschide setările"
            style={{ flex: 1, gap: 2 }}
          >
            <Text style={{ fontSize: 13, color: muted }}>
              {capitalize(now.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }))}
            </Text>
            <Text style={{ fontSize: 24, fontWeight: "600", color: colors.onSurface, letterSpacing: -0.4 }}>
              {greeting(user?.name)}
            </Text>
          </PressableScale>
          <PressableScale
            onPress={signOut}
            testID="home-signout-button"
            accessibilityRole="button"
            accessibilityLabel="Ieși din cont"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="log-out-outline" size={20} color={muted} />
          </PressableScale>
        </View>

        {loading ? (
          <ActivityIndicator color={muted} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {/* Hero -- this month's spend, split by space. */}
            <PressableScale
              testID="home-widget-budget"
              onPress={() => router.push("/budget")}
              accessibilityRole="button"
              accessibilityLabel={`Cheltuit în ${monthName}: ${lei(monthly.total)}`}
              scaleTo={0.985}
              style={{ ...card, gap: spacing.md + 2 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ fontSize: 13, color: muted }}>Cheltuit în {monthName}</Text>
                {totalBudget > 0 ? <Text style={{ fontSize: 13, color: muted }}>buget {lei(totalBudget)}</Text> : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <AnimatedNumber value={monthly.total} style={{ fontSize: 40, fontWeight: "600", letterSpacing: -1.2, color: colors.onSurface }} />
                <Text style={{ fontSize: 17, fontWeight: "500", color: muted }}>lei</Text>
              </View>

              <SpendBar segments={segments} track={colors.surfaceTertiary} />

              {segments.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm, columnGap: spacing.lg }}>
                  {segments.map((s) => (
                    <View key={s.key} style={{ width: "46%", flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
                      <Text style={{ flex: 1, fontSize: 14, color: colors.onSurfaceSecondary, opacity: 0.8 }} numberOfLines={1}>{s.label}</Text>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurface, fontVariant: ["tabular-nums"] }}>
                        {Math.round(s.amount).toLocaleString("ro-RO")}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 14, color: muted }}>Nicio cheltuială înregistrată luna asta.</Text>
              )}

              {totalBudget > 0 ? (
                <Text style={{ fontSize: 13, fontWeight: "500", color: remaining >= 0 ? colors.success : colors.error }}>
                  {remaining >= 0
                    ? `Mai ai ${lei(remaining)} pentru ${daysLeft} ${daysLeft === 1 ? "zi" : "de zile"}`
                    : `Ai depășit bugetul cu ${lei(-remaining)}`}
                </Text>
              ) : (
                <Text style={{ fontSize: 13, fontWeight: "500", color: colors.onSurface }}>Setează un buget lunar</Text>
              )}
            </PressableScale>

            {/* De făcut -- the most urgent few; "Vezi tot" opens the
                carousel, which knows where each item resolves. */}
            <View style={{ gap: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={sectionTitle}>De făcut{todoRows.length > 0 ? ` (${todoRows.length})` : ""}</Text>
                {todoRows.length > 0 ? (
                  <PressableScale
                    onPress={() => setTodoSheetVisible(true)}
                    testID="home-widget-todo"
                    accessibilityRole="button"
                    style={{ paddingVertical: 10, paddingLeft: spacing.md }}
                  >
                    <Text style={{ fontSize: 14, color: muted }}>Vezi tot</Text>
                  </PressableScale>
                ) : null}
              </View>
              <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg - 4, overflow: "hidden" }}>
                {todoRows.length === 0 ? (
                  <View style={{ padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
                    <Text style={{ fontSize: 15, color: colors.onSurface }}>Ești la zi. Nimic de făcut.</Text>
                  </View>
                ) : (
                  todoRows.slice(0, 4).map((row, i) => (
                    <TodoRowView
                      key={`${row.type}-${row.id}`}
                      row={row}
                      first={i === 0}
                      space={row.space ? spaceById.get(String(row.space.id)) : undefined}
                      onPress={() => setTodoSheetVisible(true)}
                    />
                  ))
                )}
              </View>
            </View>

            {/* Spațiile tale */}
            <View style={{ gap: spacing.md }}>
              <Text style={sectionTitle}>Spațiile tale</Text>
              {spaces.length === 0 ? (
                <PressableScale
                  onPress={() => router.push("/spaces")}
                  accessibilityRole="button"
                  style={{ ...card, flexDirection: "row", alignItems: "center", gap: spacing.md }}
                >
                  <Ionicons name="add-circle-outline" size={22} color={colors.onSurface} />
                  <Text style={{ flex: 1, fontSize: 15, color: colors.onSurface }}>Creează primul tău spațiu</Text>
                  <Ionicons name="chevron-forward" size={18} color={muted} />
                </PressableScale>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md - 2 }}>
                  {spaces.map((s) => {
                    const todos = todoCountBySpace.get(s.id) ?? 0;
                    // Spend is only known per KIND; attribute it to a space
                    // only when it's the sole space of that kind.
                    const spend = kindCount.get(s.kind) === 1
                      ? segments.find((seg) => seg.kind === s.kind)?.amount ?? 0
                      : 0;
                    const value = todos > 0 ? `${todos} de făcut` : spend > 0 ? lei(spend) : "La zi";
                    const tint = spaceTextColor(s.kind, isDark) ?? colors.onSurface;
                    const fill = SPACE_IDENTITY_COLORS[s.kind] ?? colors.onSurfaceTertiary;
                    return (
                      <PressableScale
                        key={s.id}
                        onPress={() => router.push(`/${s.id}`)}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.name}, ${value}`}
                        style={{ width: "48.4%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg - 4, padding: spacing.md + 2, gap: spacing.md }}
                      >
                        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${fill}29`, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name={KIND_ICON[s.kind] ?? "apps-outline"} size={18} color={tint} />
                        </View>
                        <View>
                          <Text style={{ fontSize: 13, color: muted }} numberOfLines={1}>{s.name}</Text>
                          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{value}</Text>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Plăți recurente -- the next few bills, then savings. */}
            {nextBills.length > 0 ? (
              <View style={{ gap: spacing.md }}>
                <Text style={sectionTitle}>Plăți recurente</Text>
                <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg - 4, overflow: "hidden" }}>
                  {nextBills.map((bill: any, i: number) => (
                    <PressableScale
                      key={bill.id}
                      testID={`home-recurring-${bill.id}`}
                      onPress={() => router.push("/calendar")}
                      scaleTo={0.99}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 56,
                        borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{bill.title}</Text>
                        <Text style={{ fontSize: 13, color: muted }}>
                          {new Date(bill.due_at).toLocaleDateString("ro-RO", { day: "numeric", month: "long" })}
                        </Text>
                      </View>
                      {bill.amount != null ? (
                        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Number(bill.amount))}</Text>
                      ) : null}
                    </PressableScale>
                  ))}
                </View>
              </View>
            ) : null}

            {goal ? (
              <PressableScale
                testID="home-widget-savings"
                onPress={() => router.push("/budget")}
                accessibilityRole="button"
                accessibilityLabel="Obiectiv de economii"
                scaleTo={0.985}
                style={{ ...card, gap: spacing.sm }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Text style={{ fontSize: 13, color: muted }}>Economii</Text>
                  <Text style={{ fontSize: 13, color: muted }}>{Math.round(goalRatio * 100)}%</Text>
                </View>
                <Text style={{ fontSize: 22, fontWeight: "600", color: colors.onSurface }}>
                  {lei(goal.current_amount)}
                  <Text style={{ fontSize: 14, fontWeight: "400", color: muted }}> din {lei(goal.target_amount)}</Text>
                </Text>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
                  <View style={{ width: `${goalRatio * 100}%`, height: "100%", backgroundColor: colors.success, borderRadius: 3 }} />
                </View>
              </PressableScale>
            ) : null}
          </>
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

/** One "De făcut" row: space dot, title + space name, urgency chip. */
function TodoRowView({ row, first, space, onPress }: { row: TodoRow; first: boolean; space?: SpaceCard; onPress: () => void }) {
  const { colors, spacing, isDark } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const kind = space?.kind;
  const subtitleColor = kind ? spaceTextColor(kind, isDark) ?? muted : row.space ? muted : CUSTOM_EVENT_COLOR;
  const chip =
    row.urgency === "overdue"
      ? { text: `Restant ${Math.max(1, -row.days)} ${-row.days === 1 ? "zi" : "zile"}`, color: colors.error, filled: true }
      : row.urgency === "today"
        ? { text: "Azi", color: colors.warning, filled: true }
        : { text: row.days === 1 ? "Mâine" : `în ${row.days} zile`, color: muted, filled: false };
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${row.title}, ${chip.text}`}
      style={{
        flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60,
        borderTopWidth: first ? 0 : 1, borderTopColor: colors.border,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: kind ? SPACE_IDENTITY_COLORS[kind] ?? muted : CUSTOM_EVENT_COLOR }} />
      <View style={{ flex: 1, paddingVertical: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{row.title}</Text>
        <Text style={{ fontSize: 13, color: subtitleColor }} numberOfLines={1}>{space?.name ?? row.space?.name ?? "Personal"}</Text>
      </View>
      <Text
        style={{
          fontSize: 12, fontWeight: chip.filled ? "600" : "500", color: chip.color, overflow: "hidden",
          backgroundColor: chip.filled ? `${chip.color}1F` : "transparent",
          paddingHorizontal: chip.filled ? 8 : 0, paddingVertical: 4, borderRadius: 6,
        }}
      >
        {chip.text}
      </Text>
    </PressableScale>
  );
}

/** The hero's split bar -- grows from empty once per mount (skipped
 * under reduced motion), segment widths are each space's share. */
function SpendBar({ segments, track }: { segments: { key: string; share: number; color: string }[]; track: string }) {
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      grow.setValue(1);
      return;
    }
    const a = Animated.timing(grow, { toValue: 1, delay: 120, useNativeDriver: false, ...motion.reveal });
    a.start();
    return () => a.stop();
  }, [grow, reduced]);

  return (
    <View style={{ flexDirection: "row", gap: 3, height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: track }}>
      {segments.map((s) => (
        <Animated.View
          key={s.key}
          style={{
            backgroundColor: s.color,
            width: grow.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.min(100, s.share * 100)}%`] }),
          }}
        />
      ))}
    </View>
  );
}
