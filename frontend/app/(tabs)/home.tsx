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
import { Card, Chip, Group, Row, SectionHeader, IconWell } from "@/components/ui/primitives";
import { motion, useReducedMotion } from "@/lib/motion";
import { capitalize, lei, roCount, roDate } from "@/lib/format";
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
  const { colors, spacing, radius, isDark, typography } = useTheme();
  const { user } = useAuth();
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
  const muted = colors.onSurfaceTertiary;

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
          color: SPACE_IDENTITY_COLORS[kind] ?? muted,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [monthly, totalBudget, muted]);

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
  const remaining = totalBudget - monthly.total;
  const initial = (user?.name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.section }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={muted} />}
      >
        {/* Header -- date + greeting; the avatar opens Settings (where
            sign-out now lives, behind a confirmation). */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 13, color: muted }}>
              {capitalize(now.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }))}
            </Text>
            <Text style={{ ...typography.title, color: colors.onSurface }}>{greeting(user?.name)}</Text>
          </View>
          <PressableScale
            onPress={() => router.push("/settings")}
            testID="home-greeting-settings-link"
            accessibilityRole="button"
            accessibilityLabel="Profil și setări"
            scaleTo={motion.scale.control}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{initial}</Text>
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
              accessibilityLabel={`Cheltuit în ${monthName}: ${lei(Math.round(monthly.total))}`}
              scaleTo={motion.scale.card}
              style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md + 2 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ fontSize: 13, color: muted }}>Cheltuit în {monthName}</Text>
                {totalBudget > 0 ? <Text style={{ fontSize: 13, color: muted }}>buget {lei(totalBudget)}</Text> : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <AnimatedNumber countUpOnMount value={monthly.total} style={{ ...typography.hero, color: colors.onSurface }} />
                <Text style={{ fontSize: 17, fontWeight: "500", color: muted }}>lei</Text>
              </View>

              <SpendBar segments={segments} track={colors.surfaceTertiary} />

              {segments.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm, columnGap: spacing.lg }}>
                  {segments.map((s) => (
                    <View key={s.key} style={{ width: "46%", flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
                      <Text style={{ flex: 1, fontSize: 14, color: colors.onSurfaceSecondary }} numberOfLines={1}>{s.label}</Text>
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
                    ? `Mai ai ${lei(Math.round(remaining))} pentru ${roCount(daysLeft, "zi", "zile")}`
                    : `Ai depășit bugetul cu ${lei(Math.round(-remaining))}`}
                </Text>
              ) : (
                <Text style={{ fontSize: 13, fontWeight: "500", color: colors.onSurface }}>Setează un buget lunar</Text>
              )}
            </PressableScale>

            {/* De făcut -- the most urgent few; "Vezi tot" opens the
                carousel, which knows where each item resolves. */}
            <View style={{ gap: spacing.sm }}>
              <SectionHeader
                title={`De făcut${todoRows.length > 0 ? ` (${todoRows.length})` : ""}`}
                action={todoRows.length > 0 ? { label: "Vezi tot", onPress: () => setTodoSheetVisible(true), testID: "home-widget-todo" } : undefined}
              />
              {todoRows.length === 0 ? (
                <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg }}>
                  <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
                  <Text style={{ fontSize: 15, color: colors.onSurface }}>Ești la zi. Nimic de făcut.</Text>
                </Card>
              ) : (
                <Group inset={36}>
                  {todoRows.slice(0, 4).map((row) => {
                    const space = row.space ? spaceById.get(String(row.space.id)) : undefined;
                    const kind = space?.kind;
                    const dotColor = kind ? SPACE_IDENTITY_COLORS[kind] ?? muted : CUSTOM_EVENT_COLOR;
                    const subColor = kind ? spaceTextColor(kind, isDark) ?? muted : row.space ? muted : spaceTextColor("custom", isDark);
                    const chip =
                      row.urgency === "overdue"
                        ? <Chip label={`Restant ${roCount(Math.max(1, -row.days), "zi", "zile")}`} color={colors.error} />
                        : row.urgency === "today"
                          ? <Chip label="Azi" color={colors.warning} />
                          : <Chip label={row.days === 1 ? "Mâine" : `în ${roCount(row.days, "zi", "zile")}`} color={muted} filled={false} />;
                    return (
                      <Row
                        key={`${row.type}-${row.id}`}
                        onPress={() => setTodoSheetVisible(true)}
                        leading={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />}
                        title={row.title}
                        subtitle={space?.name ?? row.space?.name ?? "Personal"}
                        subtitleColor={subColor}
                        trailing={chip}
                      />
                    );
                  })}
                </Group>
              )}
            </View>

            {/* Spațiile tale */}
            <View style={{ gap: spacing.sm }}>
              <SectionHeader title="Spațiile tale" />
              {spaces.length === 0 ? (
                <Group>
                  <Row
                    onPress={() => router.push("/spaces")}
                    leading={<Ionicons name="add-circle-outline" size={22} color={colors.onSurface} />}
                    title="Creează primul tău spațiu"
                    chevron
                  />
                </Group>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md - 2 }}>
                  {spaces.map((s) => {
                    const todos = todoCountBySpace.get(s.id) ?? 0;
                    // Spend is only known per KIND; attribute it to a space
                    // only when it's the sole space of that kind.
                    const spend = kindCount.get(s.kind) === 1 ? segments.find((seg) => seg.kind === s.kind)?.amount ?? 0 : 0;
                    const value = todos > 0 ? `${todos} de făcut` : spend > 0 ? lei(Math.round(spend)) : "La zi";
                    const fill = SPACE_IDENTITY_COLORS[s.kind] ?? muted;
                    return (
                      <PressableScale
                        key={s.id}
                        onPress={() => router.push(`/${s.id}`)}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.name}, ${value}`}
                        style={{ width: "48.4%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.card, padding: spacing.md + 2, gap: spacing.md }}
                      >
                        <IconWell icon={KIND_ICON[s.kind] ?? "apps-outline"} color={fill} tint={spaceTextColor(s.kind, isDark)} size={34} />
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
              <View style={{ gap: spacing.sm }}>
                <SectionHeader title="Plăți recurente" />
                <Group>
                  {nextBills.map((bill: any) => (
                    <Row
                      key={bill.id}
                      testID={`home-recurring-${bill.id}`}
                      onPress={() => router.push("/calendar")}
                      title={bill.title}
                      subtitle={roDate(bill.due_at)}
                      trailing={
                        bill.amount != null ? (
                          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Number(bill.amount))}</Text>
                        ) : null
                      }
                    />
                  ))}
                </Group>
              </View>
            ) : null}

            {goal ? (
              <PressableScale
                testID="home-widget-savings"
                onPress={() => router.push("/budget")}
                accessibilityRole="button"
                accessibilityLabel="Obiectiv de economii"
                scaleTo={motion.scale.card}
                style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.sm }}
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
            flexShrink: 1,
            backgroundColor: s.color,
            width: grow.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.min(100, s.share * 100)}%`] }),
          }}
        />
      ))}
    </View>
  );
}
