import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, DeviceEventEmitter, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ReorderHandle, ReorderList, type ReorderRenderParams } from "@/components/ui/ReorderList";
import { HoldGroup, HoldInert, HoldItem, useHoldGroup } from "@/components/ui/Hold";
import { reorderSubset } from "@/lib/holdGeometry";
import type { HoldAction } from "@/lib/holdMenu";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "@/lib/refresh";
import { useFocusEffect, useRouter } from "expo-router";
import { TodoCarouselSheet } from "@/components/dashboard/TodoCarouselSheet";
import { isRecurringPayment } from "@/components/dashboard/RecurringBillRow";
import { needsSpend } from "@/lib/budget/plan";
import { HomeWidget, type HomeCtx } from "@/components/home/HomeWidgets";
import { CatalogSheet, TemplatesSheet, WidgetSettingsSheet } from "@/components/home/LayoutSheets";
import { serviceKmStatus } from "@/lib/dashboard/spaceDue";
import { PressableScale } from "@/components/ui/PressableScale";
import { TabHeader, TabScreen } from "@/components/navigation/TabHeader";
import { CircleButton, Pill } from "@/components/ui/primitives";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailBanner";
import { useAppMode } from "@/lib/appMode";
import { SimpleHome } from "@/components/simple/SimpleHome";
import { emailVerifiedState } from "@/components/auth/VerifiedBadge";
import { motion } from "@/lib/motion";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { daysFromToday, roCount, roDate, roRelativeDays } from "@/lib/format";
import { LAYOUT_TEMPLATES, WIDGET_META, defaultLayout, ensureSpendCard, sanitizeLayout, toRows, type Widget } from "@/lib/dashboard/layout";
import { onlyEmptyDataHidesOthers, visibleWidgets } from "@/lib/dashboard/widgetVisibility";
import { useTourScroll, useTourTarget } from "@/components/ui/tourTargets";
import { useAutoTour } from "@/lib/useAutoTour";
import { SHOW_TOUR_TEST_BUTTON, startTour, type TourCtx } from "@/lib/tours";
import {
  detectSpaceType,
  profileFromSpace,
  SPACE_IDENTITY_COLORS,
  SPACE_KIND_LABEL,
  type SpaceKind,
} from "@/lib/spaces/spaceProfile";

const widgetKey = (w: Widget) => w.id;

function greeting(name?: string) {
  const h = new Date().getHours();
  const t = h < 5 ? "Noapte bună" : h < 12 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara";
  return name ? `${t}, ${name.split(" ")[0]}` : t;
}

/** Backend's monthlyExpenses.sources[].spaceName is the space KIND's
 * English label (Item::SPENDING_TYPE_SPACE), not a user-given name. */
const SOURCE_KIND: Record<string, SpaceKind> = { Car: "car", Home: "home", Grocery: "grocery", Expenses: "expenses" };

type ActionableItem = { id: number | string; type: string; title: string; due_at: string; overdue_km?: number | null; km_left?: number | null; space: { id: number | string; name: string; icon: string; type?: string | null; color?: string | null } | null };
type SpaceCard = { id: string; name: string; kind: SpaceKind; /** spaces.color (palette key or null) -- spaceColors() resolves it. */ color?: string | null };
type Urgency = "overdue" | "today" | "upcoming";
type TodoRow = ActionableItem & { urgency: Urgency; days: number };

/**
 * Acasă -- a list of cards the user arranges (lib/dashboard/layout.ts):
 * which cards, order, wide/compact, color, per-card settings. Saved per
 * user on the server, default = the original fixed Acasă. Edit mode
 * comes from the pencil next to the avatar OR a hold on any empty spot
 * between/below the cards. A hold ON a card (components/ui/Hold.tsx) =
 * its menu; hold + drag = move it. Both save the moment they're done --
 * no Renunță / Gata (user, 2026-11-02). Mockups: "orgOS
 * Acasă personalizabil", "Meniu la apăsare lungă" (variant A).
 */
export default function HomeRoute() {
  // orgOS Simplu (lib/appMode.tsx) has its own Acasă; "full" = unchanged.
  const { isSimple } = useAppMode();
  return isSimple ? <SimpleHome /> : <Home />;
}

function Home() {
  const { radius, colors, spacing } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<any>(null);
  const [budget, setBudget] = useState<any>(null);
  const [spaces, setSpaces] = useState<SpaceCard[]>([]);
  const [layout, setLayout] = useState<Widget[]>(defaultLayout());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todoSheetVisible, setTodoSheetVisible] = useState(false);

  // Edit mode works on a draft; "Gata" saves it.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Widget[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState<Widget | null>(null);
  const [saving, setSaving] = useState(false);

  // First-use tour (lib/tours.ts "home"): what it points at, and the page's
  // scroll view so a step can bring its card into view.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const tourScroll = useTourScroll("home", scrollRef);
  const headerTarget = useTourTarget("home.header");
  const editTarget = useTourTarget("home.edit");
  const spendTarget = useTourTarget("home.card.spend");

  const load = useCallback(async () => {
    try {
      const [d, b, spacesRes, layoutRes] = await Promise.all([
        api.dashboard(),
        api.getBudget(),
        api.listSpaces(),
        api.getDashboardLayout().catch(() => ({ layout: null })),
      ]);
      setDashboard(d);
      setBudget(b);
      setSpaces(
        (spacesRes.spaces || []).map((s: any) => ({
          id: String(s.id),
          name: s.name,
          kind: detectSpaceType(s, profileFromSpace(s)),
          color: s.color ?? null,
        })),
      );
      const saved = sanitizeLayout(layoutRes.layout);
      setLayout(saved ?? defaultLayout());
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
  // With an income plan the budget is the necessities envelope (Buget's hero).
  const totalBudget = !budget ? 0
    : budget.plan ? Number(budget.necessities?.envelope ?? 0)
    : budget.limits.reduce((sum: number, l: any) => sum + Number(l.monthly_limit), 0);
  const hasPlan = !!budget?.plan;
  // With a plan, the spend card is on the Buget hero's basis: necessities
  // only (no fără vină), every label -- the shared needsSpend() -- so
  // "cheltuit" + "de plătit/planificat" + "Mai ai" add up to the envelope.
  const needs = useMemo(() => needsSpend(budget?.spending, budget?.recurring, budget?.planned), [budget]);
  const monthly = dashboard?.monthlyExpenses ?? { total: 0, sources: [] };
  // What the "Cheltuit" card shows: the raw month (dashboard total) without
  // a plan; with one, each label's RECORDED necessities spend. Only the
  // spend card uses it -- other cards keep the raw month.
  const spendMonthly = useMemo(() => {
    if (!hasPlan) return monthly;
    const sources = Object.entries((budget?.spending ?? {}) as Record<string, any>)
      .map(([label, v]) => ({
        spaceName: label,
        amount: Math.max(0, Number(v?.this_month || 0) - Number(budget?.recurring?.[label] || 0) - Number(budget?.planned?.[label] || 0)),
      }))
      .filter((x) => x.amount > 0);
    return { total: needs.recorded, sources };
  }, [hasPlan, monthly, budget, needs]);
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  const monthName = now.toLocaleDateString("ro-RO", { month: "long" });
  const muted = colors.onSurfaceTertiary;

  // Bar segments: each space kind's share of the month, against the
  // budget when there is one (so the empty track IS what's left), else
  // against the total itself (a pure split, no remaining track).
  const toSegments = (m: { total: number; sources: any[] }) => {
    const scale = Math.max(totalBudget, m.total, 1);
    return (m.sources as any[])
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
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const segments = useMemo(() => toSegments(monthly), [monthly, totalBudget, muted]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spendSegments = useMemo(() => toSegments(spendMonthly), [spendMonthly, totalBudget, muted]);

  const todoRows = useMemo<TodoRow[]>(() => {
    if (!dashboard) return [];
    // Urgency comes from the LOCAL calendar day (daysFromToday), the
    // same rule the "De făcut" sheet groups by.
    // Credit reminders (`reminder: true`) are not to-dos: kept apart below.
    return [...dashboard.overdue, ...dashboard.today, ...dashboard.upcoming]
      .filter((it: any) => !it.reminder)
      .map((it: ActionableItem) => {
        const days = daysFromToday(it.due_at);
        const urgency: Urgency = days < 0 ? "overdue" : days === 0 ? "today" : "upcoming";
        return { ...it, urgency, days };
      })
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  }, [dashboard]);

  // Credit instalments due today: a reminder only (no resolve, never
  // restant, gone tomorrow) -- shown in "De făcut", never counted.
  const reminderRows = useMemo(
    () => (dashboard?.today ?? []).filter((it: any) => !!it.reminder).map((it: any) => ({ ...it, days: daysFromToday(it.due_at) })),
    [dashboard],
  );

  const overdueCount = todoRows.filter((r) => r.urgency === "overdue").length;
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  // One row per space: its most urgent dated item, plus how much else
  // is waiting there. A space with no deadline but something to act on
  // (supplies low, a shopping list) still gets a row with that count.
  const dueRows = useMemo(() => {
    const groups = new Map<string, TodoRow[]>();
    todoRows.forEach((r) => {
      const key = r.space ? String(r.space.id) : "personal";
      groups.set(key, [...(groups.get(key) ?? []), r]);
    });
    const rows: HomeCtx["dueRows"] = [];
    groups.forEach((list, key) => {
      const sorted = [...list].sort((a, b) => a.days - b.days || new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
      const space = key === "personal" ? undefined : spaceById.get(key);
      const low = key === "personal" ? 0 : dashboard?.lowSupplies?.[key] ?? 0;
      // Everything else in that space, by kind -- one lump "încă 19"
      // mixed overdue, upcoming and supplies and read as a contradiction
      // of the "11 restante" right above it.
      const rest = sorted.slice(1);
      const late = rest.filter((r) => r.days < 0).length;
      const today = rest.filter((r) => r.days === 0).length;
      const soon = rest.filter((r) => r.days > 0).length;
      const more = [
        late > 0 ? `încă ${roCount(late, "restantă", "restante")}` : null,
        today > 0 ? `${today} azi` : null,
        soon > 0 ? `${soon} în 7 zile` : null,
        low > 0 ? roCount(low, "provizie", "provizii") : null,
      ].filter(Boolean).join(" · ") || null;
      rows.push({ key, spaceId: key === "personal" ? undefined : key, name: space?.name ?? sorted[0].space?.name ?? "Personal", kind: space?.kind, color: space?.color ?? sorted[0].space?.color ?? null, top: sorted[0], more, rank: sorted[0].days });
    });
    spaces.forEach((s) => {
      if (groups.has(s.id)) return;
      const low = dashboard?.lowSupplies?.[s.id] ?? 0;
      if (low > 0) rows.push({ key: s.id, spaceId: s.id, name: s.name, kind: s.kind, color: s.color, summary: `${roCount(low, "provizie", "provizii")} pe terminate`, more: null, rank: 1000 });
      (dashboard?.toBuyLists ?? [])
        .filter((l: any) => String(l.space_id) === s.id)
        .forEach((l: any) => rows.push({ key: `list-${l.list_id}`, spaceId: s.id, name: s.name, kind: s.kind, color: s.color, summary: l.title, detail: `${roCount(l.count, "produs", "produse")} de cumpărat`, more: null, rank: 1001 }));
    });
    return rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  }, [todoRows, spaces, spaceById, dashboard]);

  const statusOf = (r: TodoRow): { label: string; tone: "error" | "warning" | "caution" | "muted" } => {
    const km = serviceKmStatus(r);
    if (km) return { label: km.label, tone: km.tier === "critical" ? "error" : km.tier === "medium" ? "warning" : "caution" };
    // A document reads by its VALIDITY date, never when it was entered.
    if (r.type.endsWith("_document")) {
      const date = roDate(r.due_at, { short: true });
      return r.days < 0 ? { label: `Expirat pe ${date}`, tone: "error" } : { label: `Expiră pe ${date}`, tone: r.days === 0 ? "warning" : "muted" };
    }
    if (r.days < 0) return { label: `Restant ${roCount(-r.days, "zi", "zile")}`, tone: "error" };
    if (r.days === 0) return { label: "Azi", tone: "warning" };
    return { label: roRelativeDays(r.days), tone: "muted" };
  };

  const goal = budget?.savingsGoal ?? null;
  const goalRatio = goal && Number(goal.target_amount) > 0 ? Math.max(0, Math.min(1, Number(goal.current_amount) / Number(goal.target_amount))) : 0;
  // Recurring bills aren't in "Cheltuit" (nothing was recorded yet) but
  // they're still coming out of the budget -- same split as the Buget tab.
  const recurringMonthly = Object.values(budget?.recurring ?? {}).reduce((sum: number, v: any) => sum + Number(v || 0), 0);
  const recurringInBudget = hasPlan ? needs.recurring : (budget?.limits ?? []).reduce((sum: number, l: any) => sum + Number(budget?.recurring?.[l.category] || 0), 0);
  // Calendar purchases still ahead: not spent, but the budget counts them.
  const plannedMonthly = Object.values(budget?.planned ?? {}).reduce((sum: number, v: any) => sum + Number(v || 0), 0);
  const plannedInBudget = hasPlan ? needs.planned : (budget?.limits ?? []).reduce((sum: number, l: any) => sum + Number(budget?.planned?.[l.category] || 0), 0);
  // With an income plan, "Mai ai" is the Buget hero's own number: the
  // necessities envelope minus every label's committed spend (needsSpend,
  // fără vină excluded by the API -- the raw dashboard total includes it).
  const remaining = hasPlan
    ? totalBudget - needs.committed
    : totalBudget - monthly.total - recurringInBudget - plannedInBudget;
  const initial = (user?.name ?? "?").trim().charAt(0).toUpperCase();

  const ctx: HomeCtx = {
    dashboard,
    budget,
    spaces,
    todoRows,
    reminderRows,
    dueRows,
    overdueCount,
    statusOf,
    monthName,
    daysLeft,
    monthly,
    segments,
    spendMonthly,
    spendSegments,
    totalBudget,
    remaining,
    hasPlan,
    recurringMonthly,
    recurringInBudget,
    plannedMonthly,
    plannedInBudget,
    bills: (budget?.recurringBills || []).filter(isRecurringPayment),
    goal,
    goalRatio,
    navigate: (href) => href.startsWith("/record-action?") ? router.navigate(href as any) : router.push(href as any),
    openTodoSheet: () => setTodoSheetVisible(true),
    refresh: load,
  };

  /* ---------------- edit mode ---------------- */

  const startEditing = () => {
    setDraft(layout.map((w) => ({ ...w })));
    setEditing(true);
  };

  const cancelEditing = () => setEditing(false);

  const finishEditing = async () => {
    setSaving(true);
    try {
      await api.saveDashboardLayout(draft);
      setLayout(draft);
      setEditing(false);
    } catch (error: any) {
      notifyAction("Nu am putut salva aranjamentul", error?.message || "A apărut o eroare.");
    } finally {
      setSaving(false);
    }
  };

  // Back to the original Acasă (the default layout): asks first, then
  // saves right away -- the server forgets the arrangement (null).
  const resetLayout = async () => {
    const ok = await confirmAction(
      "Resetezi Acasă?",
      "Cardurile revin la organizarea inițială. Cardurile adăugate, culorile și setările tale se pierd.",
      { confirmLabel: "Resetează", destructive: true },
    );
    if (!ok) return;
    setSaving(true);
    try {
      await api.saveDashboardLayout(null);
      setLayout(defaultLayout());
      setEditing(false);
    } catch (error: any) {
      notifyAction("Nu am putut reseta", error?.message || "A apărut o eroare.");
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<Widget>) => setDraft((d) => d.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  // Outside edit mode a card's menu (or its settings opened from it) and a
  // drag save at once; put back if the server refuses.
  const inDraft = editing;
  const saveLayoutNow = async (next: Widget[]) => {
    const before = layout;
    setLayout(next);
    try {
      await api.saveDashboardLayout(next);
    } catch (error: any) {
      setLayout(before);
      notifyAction("Nu am putut salva cardul", error?.message || "A apărut o eroare.");
    }
  };
  const changeCard = (id: string, patch: Partial<Widget>) =>
    inDraft ? updateDraft(id, patch) : saveLayoutNow(layout.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const cardActions = (w: Widget): HoldAction[] => [
    { key: "settings", label: "Setările cardului", icon: "options-outline", onPress: () => setSettingsFor(w) },
    w.size === "compact"
      ? { key: "size", label: "Fă-l lat", icon: "tablet-landscape-outline", onPress: () => changeCard(w.id, { size: "wide" }) }
      : { key: "size", label: "Fă-l compact", icon: "grid-outline", onPress: () => changeCard(w.id, { size: "compact" }) },
    { key: "arrange", label: "Aranjează tot Acasă", icon: "create-outline", onPress: startEditing },
    // The spend card is mandatory -- no hide (ensureSpendCard).
    ...(w.type !== "spend"
      ? [{ key: "hide", label: "Ascunde cardul", icon: "eye-off-outline" as const, destructive: true, onPress: () => changeCard(w.id, { hidden: true }) }]
      : []),
  ];

  const firstListId = dashboard?.toBuyLists?.[0]?.list_id ? String(dashboard.toBuyLists[0].list_id) : undefined;
  const firstCarId = dashboard?.cars?.[0]?.space_id != null ? String(dashboard.cars[0].space_id) : undefined;

  const cardLabel = (w: Widget): string => {
    if (w.settings?.title) return w.settings.title;
    if (w.type === "grocery") return `Listă · ${(dashboard?.toBuyLists ?? []).find((l: any) => String(l.list_id) === w.settings?.listId)?.title ?? "—"}`;
    if (w.type === "car") return `Mașină · ${(dashboard?.cars ?? []).find((c: any) => String(c.space_id) === w.settings?.spaceId)?.name ?? "—"}`;
    if (w.type === "todo" && w.settings?.spaceId) return `De făcut · ${spaceById.get(w.settings.spaceId)?.name ?? "—"}`;
    return WIDGET_META[w.type].label;
  };

  // One card of edit mode (in ReorderList -- its own drag, see that file
  // for why not react-native-draggable-flatlist).
  const renderEditItem = ({ item: w }: ReorderRenderParams<Widget>) => (
    <View style={{ gap: 6, marginBottom: spacing.section, opacity: w.hidden ? 0.45 : 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <ReorderHandle
          id={w.id}
          testID={`home-edit-drag-${w.id}`}
          label={`Mută ${cardLabel(w)}`}
          style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="reorder-three" size={24} color={muted} />
        </ReorderHandle>
        <Text style={{ flex: 1, fontSize: 13, color: muted }} numberOfLines={1}>
          {cardLabel(w)}{w.size === "compact" ? " · compact" : ""}{w.hidden ? " · ascuns" : ""}
        </Text>
        {/* The spend card is mandatory -- no hide toggle (ensureSpendCard). */}
        {w.type !== "spend" ? (
          <CircleButton
            testID={`home-edit-hide-${w.id}`}
            icon={w.hidden ? "eye-outline" : "eye-off-outline"}
            label={w.hidden ? "Arată cardul" : "Ascunde cardul"}
            onPress={() => updateDraft(w.id, { hidden: !w.hidden })}
          />
        ) : null}
        <CircleButton testID={`home-edit-settings-${w.id}`} icon="options-outline" label="Setările cardului" onPress={() => setSettingsFor(w)} />
      </View>
      {/* A preview: the card exactly as it will look, but inert. */}
      <View pointerEvents="none" style={{ borderRadius: 22, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong, padding: 3 }}>
        <HomeWidget widget={w} ctx={{ ...ctx, preview: true }} />
      </View>
    </View>
  );

  const header = editing ? (
    <TabHeader
      label="Personalizezi Acasă"
      title="Aranjează"
      info="home.edit"
      profile={false}
      actions={
        <>
          <Pressable
            testID="home-edit-cancel"
            onPress={cancelEditing}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Renunță la modificări"
            style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs }}
          >
            <Text style={{ fontSize: 15, color: muted }}>Renunță</Text>
          </Pressable>
          <PressableScale
            testID="home-edit-done"
            onPress={finishEditing}
            disabled={saving}
            scaleTo={motion.scale.control}
            accessibilityRole="button"
            accessibilityLabel="Gata, salvează aranjamentul"
            style={{ height: 44, paddingHorizontal: spacing.gutter, borderRadius: 22, backgroundColor: colors.onSurface, alignItems: "center", justifyContent: "center", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? <ActivityIndicator color={colors.surface} /> : <Text style={{ fontSize: 15, fontWeight: "600", color: colors.surface }}>Gata</Text>}
          </PressableScale>
        </>
      }
    />
  ) : (
    <TabHeader
      title={greeting(user?.name)}
      info="home.page"
      profileTestID="home-greeting-settings-link"
      actions={
        <View {...editTarget}>
          <CircleButton testID="home-edit-open" icon="create-outline" label="Personalizează Acasă" onPress={startEditing} />
        </View>
      }
    />
  );

  // Cards the user hid, then cards with nothing to show (lib/dashboard/
  // widgetVisibility.ts) -- filtered BEFORE toRows so nothing leaves a
  // gap. Edit mode renders `draft` instead, every card included. No
  // flash: until the first load lands the spinner shows, and later
  // reloads swap all the data in one batched render.
  const userVisible = layout.filter((w) => !w.hidden);
  const visible = visibleWidgets(layout, ctx);
  const showEmptyHint = onlyEmptyDataHidesOthers(layout, ctx);

  // Hold a card = its menu; hold + drag = move it among the visible ones
  // (hidden / empty cards keep their slots, reorderSubset), saved on drop.
  const hold = useHoldGroup({
    order: visible.map(widgetKey),
    onReorder: (keys) => saveLayoutNow(reorderSubset(layout, widgetKey, keys)),
    onEmptyHold: startEditing,
    scrollRef,
    enabled: !loading && !editing,
  });
  const holdCard = (w: Widget, style?: { flex: number; minWidth: number }) => (
    <HoldItem key={w.id} id={w.id} actions={cardActions(w)} preview={<HomeWidget widget={w} ctx={{ ...ctx, still: true }} />} style={style}>
      {spendWrap(w, <HomeWidget widget={w} ctx={ctx} />)}
    </HoldItem>
  );
  // The tour's step 2 points at the first spend card on the page.
  const firstSpend = visible.find((w) => w.type === "spend");
  const spendWrap = (w: Widget, node: React.ReactNode) =>
    w.id === firstSpend?.id ? <View {...spendTarget}>{node}</View> : node;

  const tourCtx: TourCtx = {
    hasSpaces: spaces.length > 0,
    emailState: emailVerifiedState(user),
    hasPlan,
    spendChart: (firstSpend?.settings?.chart ?? "ring") === "bar" ? "bar" : "ring",
    initial,
  };
  useAutoTour("home", {
    ready: !loading && !editing && !todoSheetVisible && !catalogOpen && !templatesOpen && !settingsFor,
    ctx: tourCtx,
  });

  return (
    <TabScreen testID="home-screen" header={header} headerTarget={headerTarget}>
      {editing ? (
        <ReorderList
          testID="home-edit-list"
          data={draft}
          keyExtractor={widgetKey}
          onReorder={setDraft}
          renderItem={renderEditItem}
          // The lifted card is opaque, so the one it passes over doesn't show
          // through; rounded like the cards so it isn't a hard-edged block
          // over a coloured Aspect background.
          liftedStyle={{ backgroundColor: colors.surface, borderRadius: radius.lg }}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 140 }}
          header={<Text style={{ fontSize: 13, color: muted, marginBottom: spacing.section }}>Ține apăsat mânerul ☰ și trage ca să muți un card.</Text>}
          footer={
            <View style={{ gap: spacing.md }}>
              <PressableScale
                testID="home-edit-add"
                onPress={() => setCatalogOpen(true)}
                scaleTo={motion.scale.card}
                accessibilityRole="button"
                accessibilityLabel="Adaugă card"
                style={{ height: 56, borderRadius: radius.card, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }}
              >
                <Ionicons name="add" size={20} color={colors.onSurface} />
                <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>Adaugă card</Text>
              </PressableScale>
              <PressableScale
                testID="home-edit-templates"
                onPress={() => setTemplatesOpen(true)}
                scaleTo={motion.scale.card}
                accessibilityRole="button"
                accessibilityLabel="Șabloane"
                style={{ height: 48, borderRadius: radius.control, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }}
              >
                <Ionicons name="albums-outline" size={18} color={muted} />
                <Text style={{ fontSize: 14, color: colors.onSurface }}>Pornește de la un șablon</Text>
              </PressableScale>
              <Pressable
                testID="home-edit-reset"
                onPress={resetLayout}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Resetează Acasă la organizarea inițială"
                style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }}
              >
                <Ionicons name="refresh" size={16} color={colors.error} />
                <Text style={{ fontSize: 14, color: colors.error }}>Resetează Acasă la organizarea inițială</Text>
              </Pressable>
            </View>
          }
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          {...hold.scrollProps}
          onScroll={(e) => {
            tourScroll.onScroll(e);
            hold.scrollProps.onScroll(e);
          }}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={muted} />}
        >
          {/* The whole page is holdable (HoldGroup): a hold on a card =
              that card's menu / drag; on an empty spot between or below
              the cards = edit mode. A tap still goes to the card. */}
          <HoldGroup
            hold={hold}
            testID="home-empty-longpress"
            style={{ flexGrow: 1, paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 120, gap: spacing.section }}
          >
            {SHOW_TOUR_TEST_BUTTON ? (
              // TEMP for testing -- see SHOW_TOUR_TEST_BUTTON (lib/tours.ts).
              <HoldInert id="home-tour-test" style={{ flexDirection: "row" }}>
                <Pill testID="home-tour-test" icon="play-circle-outline" label="Pornește ghidul" onPress={() => startTour("home", tourCtx)} />
              </HoldInert>
            ) : null}
            <VerifyEmailBanner testID="home-verify-email-banner" />
            {loading ? (
              <ActivityIndicator color={muted} style={{ marginTop: spacing.xl }} />
            ) : visible.length === 0 ? (
              <Text style={{ fontSize: 14, color: muted, textAlign: "center", marginTop: spacing.xl }}>
                {userVisible.length === 0
                  ? "Ai ascuns toate cardurile. Apasă creionul ca să adaugi unul."
                  : "Nimic de arătat încă. Cardurile apar aici pe măsură ce adaugi înregistrări."}
              </Text>
            ) : (
              toRows(hold.sort(visible, widgetKey)).map((row) =>
                row.length === 2 ? (
                  <View key={row[0].id} style={{ flexDirection: "row", gap: spacing.md }}>
                    {row.map((w) => holdCard(w, { flex: 1, minWidth: 0 }))}
                  </View>
                ) : row[0].size === "compact" ? (
                  <View key={row[0].id} style={{ flexDirection: "row", gap: spacing.md }}>
                    {holdCard(row[0], { flex: 1, minWidth: 0 })}
                    <View style={{ flex: 1 }} />
                  </View>
                ) : (
                  holdCard(row[0])
                ),
              )
            )}
            {!loading && visible.length > 0 && showEmptyHint ? (
              <Text testID="home-empty-data-hint" style={{ fontSize: 13, lineHeight: 18, color: muted, textAlign: "center", paddingHorizontal: spacing.md }}>
                De făcut, Plăți recurente și Economii apar aici pe măsură ce adaugi date.
              </Text>
            ) : null}
          </HoldGroup>
        </ScrollView>
      )}

      <TodoCarouselSheet
        visible={todoSheetVisible}
        onClose={() => setTodoSheetVisible(false)}
        overdue={dashboard?.overdue || []}
        today={dashboard?.today || []}
        upcoming={dashboard?.upcoming || []}
        onChanged={load}
      />

      <CatalogSheet
        visible={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        ctx={ctx}
        layout={draft}
        onAdd={(w) => {
          setDraft((d) => [...d, w]);
          setCatalogOpen(false);
        }}
        onShow={(id) => {
          updateDraft(id, { hidden: false });
          setCatalogOpen(false);
        }}
      />

      <WidgetSettingsSheet
        widget={settingsFor}
        ctx={ctx}
        onClose={() => setSettingsFor(null)}
        onSave={(w) => {
          setSettingsFor(null);
          if (inDraft) updateDraft(w.id, w);
          else saveLayoutNow(layout.map((x) => (x.id === w.id ? w : x)));
        }}
        onRemove={async (id) => {
          if (inDraft) {
            setSettingsFor(null);
            setDraft((d) => d.filter((w) => w.id !== id || w.type === "spend"));
            return;
          }
          // Opened from the card's menu: saved at once, so ask first --
          // with the sheet still open: its own ConfirmHost shows the
          // question, and closing the sheet first would answer it "no".
          const ok = await confirmAction("Scoți cardul de pe Acasă?", "Setările lui se pierd. Îl poți adăuga din nou din Personalizează Acasă.", {
            confirmLabel: "Scoate",
            destructive: true,
          });
          if (!ok) return;
          setSettingsFor(null);
          saveLayoutNow(layout.filter((w) => w.id !== id || w.type === "spend"));
        }}
      />

      <TemplatesSheet
        visible={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onPick={(key) => {
          const t = LAYOUT_TEMPLATES.find((x) => x.key === key);
          if (t) setDraft(ensureSpendCard(t.build({ firstListId, firstCarId })));
          setTemplatesOpen(false);
        }}
        onReset={() => {
          setDraft(defaultLayout());
          setTemplatesOpen(false);
        }}
      />
    </TabScreen>
  );
}
