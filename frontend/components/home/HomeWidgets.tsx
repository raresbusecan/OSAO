import React, { useEffect, useRef } from "react";
import { View, Text, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { PressableScale } from "@/components/ui/PressableScale";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button, Card, Group, Row, SectionHeader, IconWell, InfoButton, hexToRgba } from "@/components/ui/primitives";
import type { HelpKey } from "@/lib/help";
import { RecurringBillRow } from "@/components/dashboard/RecurringBillRow";
import { SwipeItemRow } from "@/components/dashboard/SwipeItemRow";
import { CreditReminderRow } from "@/components/dashboard/CreditReminderRow";
import { motion, useReducedMotion } from "@/lib/motion";
import { lei, roCount, roDate, roNumber, roRelativeDays, capitalize, roUnit } from "@/lib/format";
import { CUSTOM_EVENT_COLOR, SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceColors, spaceTextColor, type SpaceColors, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { maintenanceLabel } from "@/lib/spaces/car/maintenanceLabels";
import { todoHref, todoTitle } from "@/lib/dashboard/spaceDue";
import { WIDGET_META, type Widget } from "@/lib/dashboard/layout";
import { MultiRingProgress } from "@/components/dashboard/RingProgress";
import { BudgetSplitBar, BudgetUpcomingNote, budgetUpcomingSuffix } from "@/components/dashboard/BudgetSplitBar";

type IconName = keyof typeof Ionicons.glyphMap;

export const KIND_ICON: Partial<Record<SpaceKind, IconName>> = {
  car: "car-outline",
  home: "home-outline",
  grocery: "cart-outline",
  expenses: "receipt-outline",
};

/** One particular space's colours (its own pick, else its kind's default)
 * -- for the cards about ONE space (Mașină, Listă, Provizii, Cheltuieli,
 * "De făcut" rows). Kind-level cards (spend bar, budget) keep the kind's. */
function spaceTone(ctx: HomeCtx, spaceId: unknown, kind: SpaceKind, isDark: boolean): SpaceColors {
  const sp = ctx.spaces.find((s) => s.id === String(spaceId));
  return spaceColors({ kind, color: sp?.color }, isDark)!;
}

/** Everything the cards read -- computed once by the Acasă screen. */
export type HomeCtx = {
  dashboard: any;
  budget: any;
  spaces: { id: string; name: string; kind: SpaceKind; color?: string | null }[];
  todoRows: any[];
  /** Credit instalments due today (`reminder: true`): shown, never
   * resolved nor counted (not in todoRows / dueRows / overdueCount). */
  reminderRows: any[];
  dueRows: { key: string; spaceId?: string; name: string; kind?: SpaceKind; color?: string | null; top?: any; summary?: string; detail?: string;
    /** What else waits in that space, spelled out ("încă 10 restante · 1 azi"), or null. */
    more: string | null; rank: number }[];
  overdueCount: number;
  statusOf: (r: any) => { label: string; tone: "error" | "warning" | "muted" };
  monthName: string;
  daysLeft: number;
  monthly: { total: number; sources: any[] };
  segments: { key: string; kind: SpaceKind | "other"; label: string; amount: number; share: number; color: string }[];
  totalBudget: number;
  remaining: number;
  /** An income plan exists: the spend card is then on the necessities
   * basis (spendMonthly/spendSegments, every label's bills/planned). */
  hasPlan: boolean;
  /** The month as the "Cheltuit" card shows it: = monthly without a plan;
   * with one, recorded necessities spend (no fără vină), so it + bills +
   * planned + "Mai ai" = the envelope. */
  spendMonthly: { total: number; sources: any[] };
  spendSegments: HomeCtx["segments"];
  recurringMonthly: number;
  /** Recurring bills of spaces that HAVE a budget (count against it). */
  recurringInBudget: number;
  /** Calendar purchases still ahead this month (not spent yet) -- all,
   * and those of spaces that HAVE a budget (count against it). */
  plannedMonthly: number;
  plannedInBudget: number;
  bills: any[];
  goal: { target_amount: number; current_amount: number } | null;
  goalRatio: number;
  navigate: (href: string) => void;
  openTodoSheet: () => void;
  refresh: () => void;
  /** Edit mode: cards render as previews -- no navigation, no swipes. */
  preview?: boolean;
};

/** The card's own surface: the layer color, or a tint of the color the
 * user picked for it. */
function useCardLook(widget: Widget, fallbackAccent?: string) {
  const { colors, isDark } = useTheme();
  const accent = widget.color ?? fallbackAccent ?? colors.onSurfaceTertiary;
  const background = widget.color ? hexToRgba(widget.color, isDark ? 0.16 : 0.1) : colors.surfaceSecondary;
  return { accent, background };
}

function TapCard({ widget, onPress, label, fallbackAccent, children, style }: { widget: Widget; onPress?: () => void; label: string; fallbackAccent?: string; children: React.ReactNode; style?: any }) {
  const { radius, spacing } = useTheme();
  const { background } = useCardLook(widget, fallbackAccent);
  return (
    <PressableScale
      testID={`home-card-${widget.type}-${widget.id}`}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={motion.scale.card}
      style={[{ backgroundColor: background, borderRadius: radius.lg, padding: widget.size === "compact" ? spacing.lg : spacing.gutter, gap: spacing.sm }, style]}
    >
      {children}
    </PressableScale>
  );
}

function CardHeading({ icon, text, color, info }: { icon: IconName; text: string; color: string; info?: HelpKey }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, flexShrink: 1 }} numberOfLines={1}>{text}</Text>
      {info ? <InfoButton topic={info} /> : null}
    </View>
  );
}

/** A card's "ⓘ" -- hidden while arranging (edit mode's previews). */
function infoOf(ctx: HomeCtx, key: HelpKey): HelpKey | undefined {
  return ctx.preview ? undefined : key;
}

/** A plain card title with its "ⓘ" (cards that don't use CardHeading). */
function TitleWithInfo({ title, ctx, topic }: { title: string; ctx: HomeCtx; topic: HelpKey }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
      <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, flexShrink: 1 }} numberOfLines={1}>{title}</Text>
      {!ctx.preview ? <InfoButton topic={topic} /> : null}
    </View>
  );
}

function limitRows<T>(list: T[], rows?: number, fallback = 0): T[] {
  const n = rows ?? fallback;
  return n > 0 ? list.slice(0, n) : list;
}

/** Renders one card. A card whose data isn't there (no car, list
 * deleted) renders a quiet placeholder instead of disappearing, so the
 * user can still find and fix it in edit mode. */
export function HomeWidget({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  switch (widget.type) {
    case "spend": return <SpendCard widget={widget} ctx={ctx} />;
    case "todo": return <TodoCard widget={widget} ctx={ctx} />;
    case "bills": return <BillsCard widget={widget} ctx={ctx} />;
    case "savings": return <SavingsCard widget={widget} ctx={ctx} />;
    case "budget": return <BudgetCard widget={widget} ctx={ctx} />;
    case "car": return <CarCard widget={widget} ctx={ctx} />;
    case "grocery": return <GroceryCard widget={widget} ctx={ctx} />;
    case "supplies": return <SuppliesCard widget={widget} ctx={ctx} />;
    case "calendar": return <CalendarCard widget={widget} ctx={ctx} />;
    case "expenses": return <ExpensesCard widget={widget} ctx={ctx} />;
    default: return null;
  }
}

function Missing({ widget, text }: { widget: Widget; text: string }) {
  const { colors } = useTheme();
  return (
    <TapCard widget={widget} label={text}>
      <CardHeading icon={WIDGET_META[widget.type].icon} text={widget.settings?.title || WIDGET_META[widget.type].label} color={colors.onSurfaceTertiary} />
      <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{text}</Text>
    </TapCard>
  );
}

/* ---------------- Cheltuit în luna asta ---------------- */

function SpendCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors, typography, spacing } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const title = widget.settings?.title || `Cheltuit în ${ctx.monthName}`;
  const go = ctx.preview ? undefined : () => ctx.navigate("/budget");
  const remainingLine =
    ctx.totalBudget > 0
      ? ctx.remaining >= 0
        ? `Mai ai ${lei(Math.round(ctx.remaining))}${widget.size === "wide" ? ` pentru ${roCount(ctx.daysLeft, "zi", "zile")}` : ""}`
        : `Ai depășit cu ${lei(Math.round(-ctx.remaining))}`
      : null;

  // A brand-new account (no space, no plan, nothing spent or planned):
  // explain the card instead of a bare "0 lei" -- whatever the ring/bar
  // setting says.
  const empty =
    ctx.spaces.length === 0 && !ctx.hasPlan && ctx.totalBudget === 0 && ctx.spendMonthly.total === 0 && ctx.plannedMonthly === 0;
  if (empty) return <EmptySpendCard widget={widget} ctx={ctx} title={title} />;

  if ((widget.settings?.chart ?? "ring") === "ring") {
    return <SpendRingCard widget={widget} ctx={ctx} title={title} go={go} remainingLine={remainingLine} />;
  }

  if (widget.size === "compact") {
    return (
      <TapCard widget={widget} onPress={go} label={`${title}: ${lei(Math.round(ctx.spendMonthly.total))}`}>
        <TitleWithInfo title={title} ctx={ctx} topic="card.spend" />
        <Text style={{ fontSize: 22, fontWeight: "600", letterSpacing: -0.5, color: colors.onSurface }} numberOfLines={1}>{lei(Math.round(ctx.spendMonthly.total))}</Text>
        <SpendBar segments={ctx.spendSegments} track={colors.surfaceTertiary} height={6} />
        {remainingLine ? <Text style={{ fontSize: 12, color: ctx.remaining >= 0 ? colors.success : colors.error }} numberOfLines={1}>{remainingLine}</Text> : null}
      </TapCard>
    );
  }
  return (
    <TapCard widget={widget} onPress={go} label={`${title}: ${lei(Math.round(ctx.spendMonthly.total))}`} style={{ gap: spacing.md + 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 13, color: muted }}>{title}</Text>
        {ctx.totalBudget > 0 ? <Text style={{ fontSize: 13, color: muted }}>buget {lei(Math.round(ctx.totalBudget))}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <AnimatedNumber countUpOnMount={!ctx.preview} value={ctx.spendMonthly.total} style={{ ...typography.hero, color: colors.onSurface }} />
        <Text style={{ fontSize: 17, fontWeight: "500", color: muted }}>lei</Text>
      </View>
      <SpendBar segments={ctx.spendSegments} track={colors.surfaceTertiary} />
      {ctx.spendSegments.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm, columnGap: spacing.lg }}>
          {ctx.spendSegments.map((s) => (
            <View key={s.key} style={{ width: "46%", flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.onSurfaceSecondary }} numberOfLines={1}>{s.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurface, fontVariant: ["tabular-nums"] }}>{Math.round(s.amount).toLocaleString("ro-RO")}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 14, color: muted }}>Nicio cheltuială înregistrată luna asta.</Text>
      )}
      {ctx.recurringMonthly > 0 ? <Text style={{ fontSize: 13, color: muted }}>+ {lei(Math.round(ctx.recurringMonthly))} plăți recurente de plătit</Text> : null}
      {ctx.plannedMonthly > 0 ? <Text style={{ fontSize: 13, color: muted }}>+ {lei(Math.round(ctx.plannedMonthly))} planificat în Calendar</Text> : null}
      {remainingLine ? (
        <Text style={{ fontSize: 13, fontWeight: "500", color: ctx.remaining >= 0 ? colors.success : colors.error }}>{remainingLine}</Text>
      ) : (
        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.onSurface }}>Setează un buget lunar</Text>
      )}
    </TapCard>
  );
}

/** "Cheltuit" before there is anything to count: what the card will show
 * and the one way to get there. Not tappable as a whole (Buget has nothing
 * to show yet); the button is inert while arranging. Mockup: "Acasă cu
 * ghid" canvas, empty state. */
function EmptySpendCard({ widget, ctx, title }: { widget: Widget; ctx: HomeCtx; title: string }) {
  const { colors, typography, spacing, radius } = useTheme();
  const { background } = useCardLook(widget);
  const muted = colors.onSurfaceTertiary;
  const create = ctx.preview ? undefined : () => ctx.navigate("/spaces");
  const compact = widget.size === "compact";
  const look = { backgroundColor: background, borderRadius: radius.lg, padding: compact ? spacing.lg : spacing.gutter };

  if (compact) {
    return (
      <View testID={`home-card-spend-empty-${widget.id}`} style={[look, { gap: spacing.sm }]}>
        <TitleWithInfo title={title} ctx={ctx} topic="card.spend" />
        <Text style={{ fontSize: 22, fontWeight: "600", letterSpacing: -0.5, color: colors.onSurface }} numberOfLines={1}>0 lei</Text>
        <PressableScale
          testID="home-spend-empty-create"
          onPress={create}
          disabled={!create}
          accessibilityRole="link"
          accessibilityLabel="Creează un spațiu"
          scaleTo={motion.scale.control}
          style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}
        >
          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurface }}>Creează un spațiu ›</Text>
        </PressableScale>
      </View>
    );
  }

  const kinds: SpaceKind[] = ["car", "home", "grocery", "expenses"];
  return (
    <View testID={`home-card-spend-empty-${widget.id}`} style={[look, { gap: spacing.md + 2 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg + 2 }}>
        <View style={{ width: 116, height: 116, alignItems: "center", justifyContent: "center" }}>
          <MultiRingProgress segments={[]} size={116} strokeWidth={12} trackColor={colors.surfaceTertiary} />
          <View style={{ position: "absolute" }}>
            <Ionicons name="wallet-outline" size={26} color={muted} />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <TitleWithInfo title={title} ctx={ctx} topic="card.spend" />
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ ...typography.display, color: colors.onSurface }}>0</Text>
            <Text style={{ fontSize: 15, fontWeight: "500", color: muted }}>lei</Text>
          </View>
          <Text style={{ fontSize: 13, color: muted }}>Niciun spațiu încă</Text>
        </View>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary }}>
        Aici vezi cât cheltuiești luna asta, pe spații. Fiecare spațiu are culoarea lui:
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm, columnGap: spacing.lg }}>
        {kinds.map((k) => (
          <View key={k} style={{ width: "46%", flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SPACE_IDENTITY_COLORS[k] }} />
            <Text style={{ fontSize: 14, color: colors.onSurfaceSecondary }} numberOfLines={1}>{SPACE_KIND_LABEL[k]}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 2 }}>
        <Button testID="home-spend-empty-create" icon="add" label="Creează primul spațiu" onPress={create} />
      </View>
    </View>
  );
}

/**
 * "Cheltuit" as a ring: one arc per space in its own color (its spend as
 * a share of the month's budget), then a grey arc for recurring bills
 * still to pay -- the budget's empty track is what's genuinely left.
 * Without a budget the ring is just the split between spaces. The arcs
 * sweep in once per mount (skipped under reduced motion).
 */
function SpendRingCard({ widget, ctx, title, go, remainingLine }: { widget: Widget; ctx: HomeCtx; title: string; go?: () => void; remainingLine: string | null }) {
  const { colors, typography, spacing } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const compact = widget.size === "compact";
  const progress = useSweep(!ctx.preview);
  const scale = Math.max(ctx.totalBudget, ctx.spendMonthly.total + ctx.recurringInBudget + ctx.plannedInBudget, 1);
  // Money not spent yet, per space that has a budget -- recurring bills
  // still to pay and Calendar purchases still ahead -- drawn in THAT
  // space's color, faded, so "725 lei" reads as "Casă's bills, not paid
  // yet" instead of a free-floating grey number.
  const notYet = (source: Record<string, number> | undefined, prefix: string, what: string, note: string) =>
    Object.entries((source ?? {}) as Record<string, number>)
      .filter(([label, v]) => Number(v) > 0 && (ctx.hasPlan || (ctx.budget?.limits ?? []).some((l: any) => l.category === label)))
      .map(([label, v]) => {
        const kind = LIMIT_KIND[label] ?? "other";
        const base = SPACE_IDENTITY_COLORS[kind] ?? muted;
        return { key: `${prefix}-${label}`, label: `${SPACE_KIND_LABEL[kind] ?? label} · ${what}`, amount: Number(v), color: hexToRgba(base, 0.45), base, note };
      });
  const unpaid = [
    ...notYet(ctx.budget?.recurring, "rec", "facturi recurente", "de plătit"),
    ...notYet(ctx.budget?.planned, "plan", "cumpărături planificate", "planificat"),
  ];
  const arcs = [
    ...ctx.spendSegments.map((s) => ({ value: (s.amount / scale) * progress, color: s.color })),
    ...unpaid.map((u) => ({ value: (u.amount / scale) * progress, color: u.color })),
  ];
  // With a plan: everything counted against the envelope (spent + bills +
  // planned), the complement of "Mai ai".
  const pct = ctx.totalBudget > 0
    ? Math.round(((ctx.spendMonthly.total + (ctx.hasPlan ? ctx.recurringInBudget + ctx.plannedInBudget : 0)) / ctx.totalBudget) * 100)
    : null;
  const size = compact ? 72 : 116;
  const center = (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <MultiRingProgress segments={arcs} size={size} strokeWidth={compact ? 8 : 12} trackColor={colors.surfaceTertiary} />
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ fontSize: compact ? 15 : 22, fontWeight: "600", color: colors.onSurface }}>{pct !== null ? `${pct}%` : lei(Math.round(ctx.spendMonthly.total))}</Text>
        {!compact && pct !== null ? <Text style={{ fontSize: 11, color: muted }}>{ctx.hasPlan ? "din necesități" : "din buget"}</Text> : null}
      </View>
    </View>
  );

  if (compact) {
    return (
      <TapCard widget={widget} onPress={go} label={`${title}: ${lei(Math.round(ctx.spendMonthly.total))}`}>
        <TitleWithInfo title={title} ctx={ctx} topic="card.spend" />
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          {center}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{lei(Math.round(ctx.spendMonthly.total))}</Text>
            {remainingLine ? <Text style={{ fontSize: 12, color: ctx.remaining >= 0 ? colors.success : colors.error }} numberOfLines={2}>{remainingLine}</Text> : null}
          </View>
        </View>
      </TapCard>
    );
  }

  return (
    <TapCard widget={widget} onPress={go} label={`${title}: ${lei(Math.round(ctx.spendMonthly.total))}`} style={{ gap: spacing.md + 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg + 2 }}>
        {center}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <TitleWithInfo title={title} ctx={ctx} topic="card.spend" />
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <AnimatedNumber countUpOnMount={!ctx.preview} value={ctx.spendMonthly.total} style={{ ...typography.display, color: colors.onSurface }} />
            <Text style={{ fontSize: 15, fontWeight: "500", color: muted }}>lei</Text>
          </View>
          {ctx.totalBudget > 0 ? <Text style={{ fontSize: 13, color: muted }}>din {lei(Math.round(ctx.totalBudget))}</Text> : null}
          {remainingLine ? (
            <Text style={{ fontSize: 13, fontWeight: "500", color: ctx.remaining >= 0 ? colors.success : colors.error, marginTop: 2 }}>{remainingLine}</Text>
          ) : (
            <Text style={{ fontSize: 13, fontWeight: "500", color: colors.onSurface, marginTop: 2 }}>Setează un buget lunar</Text>
          )}
        </View>
      </View>
      {/* One line per amount, each saying what it is: spent (a space's
          color) or bills still to pay (that space's color, hollow). */}
      <View style={{ gap: spacing.sm }}>
        {ctx.spendSegments.map((s) => (
          <LegendLine key={s.key} dot={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />} label={s.label} amount={s.amount} note="cheltuiți" />
        ))}
        {unpaid.map((u) => (
          <LegendLine
            key={u.key}
            dot={<View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: u.base, backgroundColor: u.color }} />}
            label={u.label}
            amount={u.amount}
            note={u.note}
          />
        ))}
        {ctx.spendSegments.length === 0 && unpaid.length === 0 ? <Text style={{ fontSize: 14, color: muted }}>Nicio cheltuială înregistrată luna asta.</Text> : null}
      </View>
    </TapCard>
  );
}

function LegendLine({ dot, label, amount, note }: { dot: React.ReactNode; label: string; amount: number; note: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      {dot}
      <Text style={{ flex: 1, fontSize: 14, color: colors.onSurfaceSecondary }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface, fontVariant: ["tabular-nums"] }}>{lei(Math.round(amount))}</Text>
      <Text style={{ width: 64, fontSize: 13, color: colors.onSurfaceTertiary }}>{note}</Text>
    </View>
  );
}

/** 0 -> 1 over ~600ms once per mount (1 immediately under reduced motion). */
function useSweep(animate: boolean): number {
  const reduced = useReducedMotion();
  const [p, setP] = React.useState(reduced || !animate ? 1 : 0);
  useEffect(() => {
    if (reduced || !animate) {
      setP(1);
      return;
    }
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setP(value));
    const a = Animated.timing(v, { toValue: 1, delay: 120, useNativeDriver: false, ...motion.reveal });
    a.start();
    return () => {
      a.stop();
      v.removeListener(id);
    };
  }, [reduced, animate]);
  return p;
}

/** The hero's split bar -- grows from empty once per mount (skipped
 * under reduced motion), segment widths are each space's share. */
function SpendBar({ segments, track, height = 10 }: { segments: { key: string; share: number; color: string }[]; track: string; height?: number }) {
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
    <View style={{ flexDirection: "row", gap: 3, height, borderRadius: height / 2, overflow: "hidden", backgroundColor: track }}>
      {segments.map((s) => (
        <Animated.View
          key={s.key}
          style={{ flexShrink: 1, backgroundColor: s.color, width: grow.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${Math.min(100, s.share * 100)}%`] }) }}
        />
      ))}
    </View>
  );
}

/* ---------------- De făcut ---------------- */

function TodoCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors, isDark, spacing } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const only = widget.settings?.spaceId;
  const rows = limitRows(only ? ctx.dueRows.filter((r) => r.spaceId === only) : ctx.dueRows, widget.settings?.rows);
  const items = only ? ctx.todoRows.filter((r) => r.space && String(r.space.id) === only) : ctx.todoRows;
  const overdue = items.filter((r) => r.days < 0).length;
  const reminders = only ? ctx.reminderRows.filter((r) => r.space && String(r.space.id) === only) : ctx.reminderRows;
  const spaceName = only ? ctx.spaces.find((s) => s.id === only)?.name : null;
  const title = widget.settings?.title || (spaceName ? `De făcut · ${spaceName}` : "De făcut");

  if (widget.size === "compact") {
    const top = rows[0];
    return (
      <TapCard widget={widget} onPress={ctx.preview ? undefined : ctx.openTodoSheet} label={`${title}: ${items.length}`}>
        <CardHeading icon="checkbox-outline" text={title} color={widget.color ?? colors.onSurfaceTertiary} info={infoOf(ctx, "card.todo")} />
        <Text style={{ fontSize: 22, fontWeight: "600", color: overdue > 0 ? colors.error : colors.onSurface }} numberOfLines={1}>
          {overdue > 0 ? roCount(overdue, "restantă", "restante") : items.length > 0 ? `${items.length} în 7 zile` : "La zi"}
        </Text>
        {top ? <Text style={{ fontSize: 12, color: muted }} numberOfLines={1}>{top.top ? todoTitle(top.top) : top.summary}</Text> : null}
      </TapCard>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader
        info={infoOf(ctx, "card.todo")}
        title={`${title}${overdue > 0 ? ` · ${roCount(overdue, "restantă", "restante")}` : ""}`}
        action={!ctx.preview && items.length > 0 ? { label: "Vezi tot", onPress: ctx.openTodoSheet, testID: "home-widget-todo" } : undefined}
      />
      {rows.length === 0 && reminders.length === 0 ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, backgroundColor: widget.color ? hexToRgba(widget.color, isDark ? 0.16 : 0.1) : colors.surfaceSecondary }}>
          <Ionicons name="checkmark-circle-outline" size={22} color={colors.success} />
          <Text style={{ fontSize: 15, color: colors.onSurface }}>{ctx.spaces.length === 0 ? "Creează un spațiu din tab-ul Spații." : "Ești la zi. Nimic de făcut."}</Text>
        </Card>
      ) : (
        <Group inset={68} style={widget.color ? { backgroundColor: hexToRgba(widget.color, isDark ? 0.16 : 0.1) } : undefined}>
          {rows.map((r) => {
            const own = r.kind ? spaceColors({ kind: r.kind, color: r.color }, isDark) : null;
            const fill = widget.color ?? (r.kind ? own?.color ?? muted : CUSTOM_EVENT_COLOR);
            const tint = widget.color ?? (r.kind ? own?.tint : spaceTextColor("custom", isDark)) ?? fill;
            const status = r.top ? ctx.statusOf(r.top) : null;
            const statusColor = status?.tone === "error" ? colors.error : status?.tone === "warning" ? colors.warning : muted;
            const row = (
              <Row
                testID={`home-due-${r.key}`}
                onPress={ctx.preview ? undefined : () => ctx.navigate(r.top ? todoHref(r.top) : `/${r.spaceId}`)}
                leading={<IconWell icon={r.kind ? KIND_ICON[r.kind] ?? "apps-outline" : "sparkles-outline"} color={fill} tint={tint} />}
                title={r.top ? todoTitle(r.top) : r.summary ?? ""}
                subtitle={
                  <>
                    {r.name}
                    {r.detail ? ` · ${r.detail}` : ""}
                    {status ? <Text style={{ color: statusColor }}>{` · ${status.label}`}</Text> : null}
                    {r.more ? `
${r.more}` : ""}
                  </>
                }
                chevron={!ctx.preview}
              />
            );
            return r.top && !ctx.preview ? (
              <SwipeItemRow key={r.key} item={r.top} onChanged={ctx.refresh}>{row}</SwipeItemRow>
            ) : (
              <React.Fragment key={r.key}>{row}</React.Fragment>
            );
          })}
          {/* Credit reminders: no swipe, no resolve, not in the counts. */}
          {reminders.map((r: any) => (
            <CreditReminderRow key={`credit-${r.id}`} item={r} testID={`home-reminder-${r.id}`} />
          ))}
        </Group>
      )}
    </View>
  );
}

/* ---------------- Plăți recurente ---------------- */

function BillsCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors, spacing } = useTheme();
  const title = widget.settings?.title || "Plăți recurente";
  const bills = limitRows(ctx.bills, widget.settings?.rows, 3);
  if (widget.size === "compact") {
    const next = ctx.bills[0];
    const overdue = next ? new Date(next.due_at).getTime() < Date.now() : false;
    return (
      <TapCard widget={widget} onPress={ctx.preview || !next ? undefined : () => ctx.navigate(todoHref(next))} label={title}>
        <CardHeading icon="repeat" text={title} color={widget.color ?? colors.onSurfaceTertiary} info={infoOf(ctx, "card.bills")} />
        {next ? (
          <>
            <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{next.title}</Text>
            <Text style={{ fontSize: 12, color: overdue ? colors.error : colors.onSurfaceTertiary }} numberOfLines={1}>
              {lei(Number(next.amount))} · {overdue ? "restantă" : roDate(next.due_at, { short: true })}
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>Nimic de plătit</Text>
        )}
      </TapCard>
    );
  }
  if (bills.length === 0) return <Missing widget={widget} text="Nicio plată recurentă." />;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title={title} info={infoOf(ctx, "card.bills")} />
      <Group inset={68}>
        {bills.map((bill: any) => {
          const row = (
            <RecurringBillRow
              testID={`home-recurring-${bill.id}`}
              item={bill}
              onPress={ctx.preview ? undefined : () => ctx.navigate(todoHref(bill))}
            />
          );
          return ctx.preview ? (
            <React.Fragment key={bill.id}>{row}</React.Fragment>
          ) : (
            <SwipeItemRow key={bill.id} item={bill} onChanged={ctx.refresh}>{row}</SwipeItemRow>
          );
        })}
      </Group>
    </View>
  );
}

/* ---------------- Economii ---------------- */

function SavingsCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const title = widget.settings?.title || "Economii";
  const bar = widget.color ?? colors.success;
  if (!ctx.goal) return <Missing widget={widget} text="Pune-ți un obiectiv de economii din Buget." />;
  const go = ctx.preview ? undefined : () => ctx.navigate("/budget");
  return (
    <TapCard widget={widget} onPress={go} label={`${title}: ${lei(ctx.goal.current_amount)} din ${lei(ctx.goal.target_amount)}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <TitleWithInfo title={title} ctx={ctx} topic="card.savings" />
        <Text style={{ fontSize: 13, color: muted }}>{Math.round(ctx.goalRatio * 100)}%</Text>
      </View>
      <Text style={{ fontSize: widget.size === "compact" ? 22 : 22, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
        {lei(ctx.goal.current_amount)}
        {widget.size === "wide" ? <Text style={{ fontSize: 14, fontWeight: "400", color: muted }}> din {lei(ctx.goal.target_amount)}</Text> : null}
      </Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
        <View style={{ width: `${ctx.goalRatio * 100}%`, height: "100%", backgroundColor: bar, borderRadius: 3 }} />
      </View>
      {widget.size === "compact" ? <Text style={{ fontSize: 12, color: muted }}>din {lei(ctx.goal.target_amount)}</Text> : null}
    </TapCard>
  );
}

/* ---------------- Buget pe spații ---------------- */

const LIMIT_KIND: Record<string, SpaceKind> = { Car: "car", Home: "home", Grocery: "grocery", Expenses: "expenses" };

function BudgetCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const title = widget.settings?.title || "Buget pe spații";
  const limits: any[] = ctx.budget?.limits ?? [];
  if (limits.length === 0) return <Missing widget={widget} text="Niciun buget setat încă." />;
  const go = ctx.preview ? undefined : () => ctx.navigate("/budget");
  const recurring = ctx.budget?.recurring ?? {};
  const planned = ctx.budget?.planned ?? {};
  const totalLimit = limits.reduce((s, l) => s + Number(l.monthly_limit), 0);
  const totalSpent = limits.reduce((s, l) => s + Number(l.spent), 0);
  const totalUpcoming = limits.reduce((s, l) => s + Number(recurring[l.category] || 0), 0);
  const totalPlanned = limits.reduce((s, l) => s + Number(planned[l.category] || 0), 0);
  if (widget.size === "compact") {
    const ratio = totalLimit > 0 ? totalSpent / totalLimit : 0;
    return (
      <TapCard widget={widget} onPress={go} label={title}>
        <CardHeading icon="pie-chart-outline" text={title} color={widget.color ?? muted} info={infoOf(ctx, "card.budget")} />
        <Text style={{ fontSize: 22, fontWeight: "600", color: colors.onSurface }}>{Math.round(ratio * 100)}%</Text>
        <Text style={{ fontSize: 12, color: muted }} numberOfLines={2}>
          din {lei(totalLimit)}
          {totalUpcoming > 0 || totalPlanned > 0
            ? `, din care ${[totalUpcoming > 0 ? `${lei(Math.round(totalUpcoming))} facturi neplătite` : null, totalPlanned > 0 ? `${lei(Math.round(totalPlanned))} planificat` : null].filter(Boolean).join(" și ")}`
            : ""}
        </Text>
      </TapCard>
    );
  }
  return (
    <TapCard widget={widget} onPress={go} label={title} style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{title}</Text>
        {!ctx.preview ? <InfoButton topic="card.budget" /> : null}
      </View>
      {limits.map((l) => {
        const kind = LIMIT_KIND[l.category] ?? "other";
        const rec = Number(recurring[l.category] || 0);
        const plan = Number(planned[l.category] || 0);
        const up = rec + plan;
        const recorded = Math.max(0, Number(l.spent) - up);
        const limit = Number(l.monthly_limit);
        return (
          <View key={l.category} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, color: colors.onSurface }}>{SPACE_KIND_LABEL[kind] ?? l.category}</Text>
              <Text style={{ fontSize: 14, color: muted }}>
                <Text style={{ fontWeight: "600", color: recorded > limit ? colors.error : colors.onSurface }}>{roNumber(recorded)}</Text>{budgetUpcomingSuffix(up)} / {lei(limit)}
              </Text>
            </View>
            <BudgetSplitBar recorded={recorded} upcoming={up} limit={limit} color={SPACE_IDENTITY_COLORS[kind] ?? muted} />
            <BudgetUpcomingNote recorded={recorded} upcoming={up} limit={limit} planned={plan} />
          </View>
        );
      })}
    </TapCard>
  );
}

/* ---------------- Mașină ---------------- */

function CarCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors, isDark } = useTheme();
  const cars: any[] = ctx.dashboard?.cars ?? [];
  const car = cars.find((c) => String(c.space_id) === widget.settings?.spaceId) ?? cars[0];
  if (!car) return <Missing widget={widget} text="Nicio mașină cu înregistrări încă." />;
  const own = spaceTone(ctx, car.space_id, "car", isDark);
  const accent = widget.color ?? own.color;
  const tint = widget.color ?? own.tint;
  const muted = colors.onSurfaceTertiary;
  const service = car.next_service;
  const serviceLine = service
    ? service.km_left < 0
      ? `${maintenanceLabel(service.title)}: depășit cu ${roNumber(-service.km_left)} km`
      : `${maintenanceLabel(service.title)} la ${roNumber(service.at_km)} km`
    : null;
  return (
    <TapCard widget={widget} fallbackAccent={accent} onPress={ctx.preview ? undefined : () => ctx.navigate(`/${car.space_id}`)} label={`${car.name}, ${car.odometer ?? "?"} km`}>
      <CardHeading icon="car-outline" text={widget.settings?.title || car.name} color={tint} info={infoOf(ctx, "card.car")} />
      <Text style={{ fontSize: 22, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{car.odometer ? `${roNumber(car.odometer)} km` : "—"}</Text>
      {serviceLine ? <Text style={{ fontSize: 12, color: service.km_left < 0 ? colors.error : muted }} numberOfLines={1}>{serviceLine}</Text> : null}
      {widget.size === "wide" && car.next_document ? (
        <Text style={{ fontSize: 12, color: muted }} numberOfLines={1}>{car.next_document.title} expiră pe {car.next_document.expiry}</Text>
      ) : null}
    </TapCard>
  );
}

/* ---------------- Listă de cumpărături ---------------- */

function GroceryCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors, isDark } = useTheme();
  const lists: any[] = ctx.dashboard?.toBuyLists ?? [];
  const list = lists.find((l) => String(l.list_id) === widget.settings?.listId) ?? (widget.settings?.listId ? null : lists[0]);
  if (!list) return <Missing widget={widget} text="Lista e goală sau a fost ștearsă." />;
  const tint = widget.color ?? spaceTone(ctx, list.space_id, "grocery", isDark).tint;
  const muted = colors.onSurfaceTertiary;
  const title = widget.settings?.title || list.title;
  const go = ctx.preview ? undefined : () => ctx.navigate(todoHref({ id: list.list_id, type: "grocery_list", space_id: list.space_id }));
  if (widget.size === "compact") {
    return (
      <TapCard widget={widget} onPress={go} label={`${title}: ${list.count} de cumpărat`}>
        <CardHeading icon="cart-outline" text={title} color={tint} info={infoOf(ctx, "card.grocery")} />
        <Text style={{ fontSize: 22, fontWeight: "600", color: colors.onSurface }}>{list.count}</Text>
        <Text style={{ fontSize: 12, color: muted }}>{list.count === 1 ? "produs de cumpărat" : "produse de cumpărat"}</Text>
      </TapCard>
    );
  }
  const shown = limitRows(list.items as any[], widget.settings?.rows, 5);
  const rest = list.count - shown.length;
  return (
    <TapCard widget={widget} onPress={go} label={`${title}: ${list.count} de cumpărat`}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <CardHeading icon="cart-outline" text={title} color={tint} info={infoOf(ctx, "card.grocery")} />
        <Text style={{ fontSize: 13, color: muted }}>{roCount(list.count, "produs", "produse")}</Text>
      </View>
      {shown.map((it: any, i: number) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 32 }}>
          <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong }} />
          <Text style={{ flex: 1, fontSize: 15, color: colors.onSurface }} numberOfLines={1}>{it.title}</Text>
          {it.quantity ? <Text style={{ fontSize: 13, color: muted }}>{/^\d+([.,]\d+)?$/.test(String(it.quantity)) ? `${it.quantity} ${roUnit("pcs")}` : it.quantity}</Text> : null}
        </View>
      ))}
      {rest > 0 ? <Text style={{ fontSize: 13, color: muted }}>+ încă {roCount(rest, "produs", "produse")}</Text> : null}
    </TapCard>
  );
}

/* ---------------- Provizii ---------------- */

function SuppliesCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors, isDark } = useTheme();
  const homes = ctx.spaces.filter((s) => s.kind === "home");
  const home = homes.find((s) => s.id === widget.settings?.spaceId) ?? homes[0];
  if (!home) return <Missing widget={widget} text="Niciun spațiu Casă." />;
  const low = ctx.dashboard?.lowSupplies?.[home.id] ?? 0;
  const tint = widget.color ?? spaceTone(ctx, home.id, "home", isDark).tint;
  return (
    <TapCard widget={widget} onPress={ctx.preview ? undefined : () => ctx.navigate(`/${home.id}?section=supplies`)} label={`Provizii ${home.name}: ${low} pe terminate`}>
      <CardHeading icon="basket-outline" text={widget.settings?.title || `Provizii · ${home.name}`} color={tint} info={infoOf(ctx, "card.supplies")} />
      <Text style={{ fontSize: 22, fontWeight: "600", color: low > 0 ? colors.warning : colors.onSurface }}>{low > 0 ? low : "Ok"}</Text>
      <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{low > 0 ? (low === 1 ? "pe terminate" : "pe terminate") : "nimic pe terminate"}</Text>
    </TapCard>
  );
}

/* ---------------- Următoarele 7 zile ---------------- */

function CalendarCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors, spacing, radius } = useTheme();
  const { background } = useCardLook(widget);
  const muted = colors.onSurfaceTertiary;
  const title = widget.settings?.title || (widget.size === "compact" ? "Azi" : "Următoarele 7 zile");
  // Credit reminders are "a thing on that day" too (listed, never counted as late).
  const upcoming = [...ctx.todoRows, ...ctx.reminderRows].filter((r) => r.days >= 0).sort((a, b) => a.days - b.days);
  const tint = widget.color ?? CUSTOM_EVENT_COLOR;
  const go = ctx.preview ? undefined : () => ctx.navigate("/calendar");
  if (widget.size === "compact") {
    const today = upcoming.filter((r) => r.days === 0);
    const tomorrow = upcoming.filter((r) => r.days === 1).length;
    return (
      <TapCard widget={widget} onPress={!ctx.preview && today[0] ? () => ctx.navigate(todoHref(today[0])) : go} label={title}>
        <CardHeading icon="calendar-outline" text={title} color={tint} info={infoOf(ctx, "card.calendar")} />
        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{today[0] ? todoTitle(today[0]) : "Nimic azi"}</Text>
        <Text style={{ fontSize: 12, color: muted }} numberOfLines={1}>
          {today.length > 1 ? `+ încă ${today.length - 1} azi` : tomorrow > 0 ? `+ ${tomorrow} mâine` : " "}
        </Text>
      </TapCard>
    );
  }
  const shown = limitRows(upcoming, widget.settings?.rows, 5);
  return (
    <View testID={`home-card-${widget.type}-${widget.id}`} style={{ backgroundColor: background, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.sm }}>
      <CardHeading icon="calendar-outline" text={title} color={tint} info={infoOf(ctx, "card.calendar")} />
      {shown.length === 0 ? <Text style={{ fontSize: 14, color: muted }}>Nimic programat.</Text> : null}
      {shown.map((r: any) => (
        <PressableScale key={`${r.type}-${r.id}`} onPress={ctx.preview ? undefined : () => ctx.navigate(todoHref(r))} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 32 }}>
          <Text style={{ width: 64, fontSize: 13, color: r.days === 0 ? colors.warning : muted }}>{capitalize(roRelativeDays(r.days))}</Text>
          <Text style={{ flex: 1, fontSize: 15, color: colors.onSurface }} numberOfLines={1}>{todoTitle(r)}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

/* ---------------- Cheltuieli ---------------- */

function ExpensesCard({ widget, ctx }: { widget: Widget; ctx: HomeCtx }) {
  const { colors, isDark } = useTheme();
  const spaces = ctx.spaces.filter((s) => s.kind === "expenses");
  const space = spaces.find((s) => s.id === widget.settings?.spaceId) ?? spaces[0];
  if (!space) return <Missing widget={widget} text="Niciun spațiu Cheltuieli." />;
  const amount = ctx.segments.find((s) => s.kind === "expenses")?.amount ?? 0;
  const tint = widget.color ?? spaceTone(ctx, space.id, "expenses", isDark).tint;
  return (
    <TapCard widget={widget} onPress={ctx.preview ? undefined : () => ctx.navigate(`/${space.id}`)} label={`${space.name}: ${lei(amount)} luna asta`}>
      <CardHeading icon="receipt-outline" text={widget.settings?.title || space.name} color={tint} info={infoOf(ctx, "card.expenses")} />
      <Text style={{ fontSize: 22, fontWeight: "600", color: colors.onSurface }}>{lei(Math.round(amount))}</Text>
      <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>în {ctx.monthName}</Text>
    </TapCard>
  );
}
