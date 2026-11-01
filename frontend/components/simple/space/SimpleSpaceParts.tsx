import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, DeviceEventEmitter, Easing, RefreshControl, ScrollView, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useTheme } from "@/lib/theme";
import { motion, useReducedMotion } from "@/lib/motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { readableOn } from "@/components/ui/primitives";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { api } from "@/lib/api";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { REFRESH_EVENT } from "@/lib/refresh";
import { daysFromToday, roDate } from "@/lib/format";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { spaceColors, type SpaceColors, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { setSpaceAccent, clearSpaceAccent } from "@/lib/simpleSheets";

/**
 * Building blocks shared by the four Simplu space screens (mockup
 * "Masina.dc.html"): the page shell (left-edge swipe back, header,
 * pull-to-refresh), the filled hero in the space's colour, a titled
 * card, one line of a list, and the calm empty line.
 */

/** The space's colours -- its own pick, else its kind's default. */
export function useSimpleSpaceColors(space: any, kind: SpaceKind): SpaceColors {
  const { isDark } = useTheme();
  return (spaceColors(space, isDark) ?? spaceColors(kind === "other" ? "expenses" : kind, isDark))!;
}

/** While this screen is focused, the tab bar's "+" takes the space's
 * colour and quick-add preselects it (lib/simpleSheets.ts). */
export function useSpaceAccent(space: any, c: SpaceColors) {
  const id = String(space?.id ?? "");
  const name = space?.name ?? "";
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setSpaceAccent({ spaceId: id, fill: c.fill, ink: c.ink, name });
      return () => clearSpaceAccent(id);
    }, [id, c.fill, c.ink, name]),
  );
}

export function SimplePage({
  title,
  subtitle,
  onBack,
  onRefresh,
  footer,
  onEdit,
  editLabel,
  testID,
  children,
}: {
  title: string;
  /** A string, or inline <Text> runs (e.g. Mașină's km + a coloured oil status). */
  subtitle?: React.ReactNode;
  onBack: () => void;
  /** A pencil at the header's end (e.g. Mașină: name + km). */
  onEdit?: () => void;
  editLabel?: string;
  /** Pull-to-refresh; resolves when the reload is done. */
  onRefresh: () => Promise<unknown> | void;
  /** Pinned under the scrolling content, just above the tab bar. */
  footer?: React.ReactNode;
  testID?: string;
  children: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
      <ScrollView
        testID={testID}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        // A button tap works with the keyboard up (Cumpărături's "+" next to
        // its field used to need a first tap just to close the keyboard);
        // a tap on empty space or a scroll still closes it.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: 120, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.onSurfaceTertiary} />}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginLeft: -10 }}>
          <PressableScale
            testID="simple-space-back"
            onPress={onBack}
            scaleTo={motion.scale.control}
            accessibilityRole="button"
            accessibilityLabel="Înapoi"
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {onEdit ? (
            <PressableScale
              testID="simple-space-edit"
              onPress={onEdit}
              scaleTo={motion.scale.control}
              accessibilityRole="button"
              accessibilityLabel={editLabel ?? `Editează ${title}`}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="create-outline" size={20} color={colors.onSurface} />
            </PressableScale>
          ) : null}
        </View>
        {children}
      </ScrollView>
      {footer}
    </SwipeBackView>
  );
}

/** The filled hero in the space's colour: kicker, big line, detail line,
 * and (when there is something to resolve) the "Am rezolvat" pill. */
export function SimpleHero({
  c,
  kicker,
  title,
  detail,
  actionLabel = "Am rezolvat",
  onAction,
  onPress,
  busy,
  urgency,
  testID,
}: {
  c: SpaceColors;
  kicker: string;
  title: string;
  detail?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  /** Tap the hero itself (the record editor). */
  onPress?: () => void;
  busy?: boolean;
  /** How soon, in the urgency color Complet uses for the same record
   * (e.g. Mașină: "în 6 zile" red) -- a pill on the kicker line. */
  urgency?: { label: string; color: string; overdue?: boolean } | null;
  testID?: string;
}) {
  const { radius, spacing } = useTheme();
  const Root: any = onPress ? PressableScale : View;
  return (
    <Root
      testID={testID}
      {...(onPress ? { onPress, scaleTo: motion.scale.card, accessibilityRole: "button", accessibilityLabel: `Editează: ${title}${urgency ? `, ${urgency.label}` : ""}` } : {})}
      style={{ backgroundColor: c.fill, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={{ flex: 1, fontSize: 13, color: c.ink, opacity: 0.85 }} numberOfLines={1}>{kicker}</Text>
        {urgency ? (
          <View
            testID={testID ? `${testID}-urgency` : undefined}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: urgency.color }}
          >
            {urgency.overdue ? <Ionicons name="alert-circle" size={14} color={readableOn(urgency.color)} /> : null}
            <Text style={{ fontSize: 13, fontWeight: "600", color: readableOn(urgency.color) }} numberOfLines={1}>{urgency.label}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 24, fontWeight: "600", color: c.ink }}>{title}</Text>
          {detail ? <Text style={{ fontSize: 14, color: c.ink, opacity: 0.85 }}>{detail}</Text> : null}
        </View>
        {onAction ? (
          <PressableScale
            testID={testID ? `${testID}-resolve` : undefined}
            onPress={onAction}
            disabled={busy}
            scaleTo={motion.scale.control}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            accessibilityState={{ disabled: !!busy, busy: !!busy }}
            style={{ height: 44, paddingHorizontal: spacing.lg, borderRadius: 22, backgroundColor: c.ink, alignItems: "center", justifyContent: "center", minWidth: 120 }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={c.fill} />
            ) : (
              <Text style={{ fontSize: 14, fontWeight: "600", color: c.fill }}>{actionLabel}</Text>
            )}
          </PressableScale>
        ) : null}
      </View>
    </Root>
  );
}

/** A filled card with a 16/600 title (+ optional right value). */
export function SimpleCard({
  title,
  right,
  badge,
  onEdit,
  editLabel,
  children,
  testID,
}: {
  title: string;
  right?: string | null;
  /** A small element after the title (e.g. ListProgressRing); wins over `right`. */
  badge?: React.ReactNode;
  /** A pencil at the header's end (e.g. rename a list). */
  onEdit?: () => void;
  editLabel?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const { spacing, card, colors, radius } = useTheme();
  const roomy = !!badge || !!onEdit;
  return (
    <View testID={testID} style={{ ...card, borderRadius: radius.lg, paddingTop: roomy ? 10 : 14, paddingBottom: spacing.xs, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: roomy ? "center" : "baseline", marginLeft: 16, marginRight: roomy ? 10 : 16, marginBottom: roomy ? 2 : 4, gap: 10, minHeight: roomy ? 44 : undefined }}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
          {title}
        </Text>
        {badge ?? (right ? <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>{right}</Text> : null)}
        {onEdit ? (
          <PressableScale
            onPress={onEdit}
            scaleTo={motion.scale.control}
            accessibilityRole="button"
            accessibilityLabel={editLabel ?? `Editează ${title}`}
            hitSlop={4}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="create-outline" size={18} color={colors.onSurfaceSecondary} />
          </PressableScale>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A list's progress (Cumpărături): a ring that fills as products go into
 * the cart, with what's still to buy in the middle -- a check once
 * everything is in. Fill animates (RN Animated, JS driver: SVG props),
 * instantly under reduced motion.
 */
export function ListProgressRing({
  done,
  total,
  color,
  size = 40,
  onPressComplete,
  testID,
}: {
  done: number;
  total: number;
  color: string;
  size?: number;
  /** Makes the ring a button ONLY while everything is checked (the check
   * mark) -- e.g. "debifează tot". */
  onPressComplete?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, done / total) : 0;
  const progress = useRef(new Animated.Value(share)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(share);
      return;
    }
    Animated.timing(progress, { toValue: share, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [share, reduced, progress]);

  const left = total - done;
  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });
  const pressable = left <= 0 && total > 0 && !!onPressComplete;
  return (
    <PressableScale
      testID={testID}
      disabled={!pressable}
      onPress={onPressComplete}
      scaleTo={motion.scale.control}
      hitSlop={4}
      accessible
      accessibilityRole={pressable ? "button" : undefined}
      accessibilityLabel={left > 0 ? `${done} din ${total} în coș, ${left} de cumpărat` : `Toate cele ${total} în coș${pressable ? ". Debifează tot" : ""}`}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceTertiary} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset as any}
          // SVG transform string, not rotation/origin (RingProgress.tsx: web warning).
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={done > 0 ? 1 : 0}
        />
      </Svg>
      {left > 0 ? (
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}>{left}</Text>
      ) : (
        <Ionicons name="checkmark" size={18} color={color} />
      )}
    </PressableScale>
  );
}

/** How many months Simplu's history reaches back, this one included
 * (user decision 2026-10-15: 3, no filters; older = Complet). */
export const SIMPLE_HISTORY_MONTHS = 3;

/** The month a Simplu history card shows: offset 0 (this month) .. -2.
 * `inMonth(date)` filters records; `title` = "Octombrie" (+ the year when
 * not this year); `emptyText` = the calm line for a month with nothing. */
export function useHistoryMonth() {
  const [offset, setOffset] = useState(0);
  const month = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
  }, [offset]);
  const name = month.toLocaleDateString("ro-RO", { month: "long" });
  return {
    offset,
    setOffset,
    month,
    name,
    title: name.charAt(0).toUpperCase() + name.slice(1) + (month.getFullYear() !== new Date().getFullYear() ? ` ${month.getFullYear()}` : ""),
    emptyText: offset === 0 ? "Nimic cheltuit luna asta." : `Nimic cheltuit în ${name}.`,
    inMonth: (date: string | Date) => {
      const d = typeof date === "string" ? new Date(date) : date;
      return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
    },
  };
}

/** One ‹ / › of a month card (a disabled one stays, faded -- no jumping). */
function MonthStep({ icon, label, disabled, onPress, testID }: { icon: "chevron-back" | "chevron-forward"; label: string; disabled: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      scaleTo={motion.scale.control}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}
    >
      <Ionicons name={icon} size={18} color={colors.onSurface} />
    </PressableScale>
  );
}

/** A month card's header end: the month's total (when given) + ‹ ›. Pass
 * it as SimpleCard's `badge`. */
export function HistoryMonthBadge({
  history,
  total,
  testIDPrefix,
}: {
  history: ReturnType<typeof useHistoryMonth>;
  total?: string | null;
  testIDPrefix: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {total ? <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface, marginRight: 4 }}>{total}</Text> : null}
      <MonthStep
        icon="chevron-back"
        label="Luna trecută"
        disabled={history.offset <= -(SIMPLE_HISTORY_MONTHS - 1)}
        onPress={() => history.setOffset((o) => o - 1)}
        testID={`${testIDPrefix}-prev`}
      />
      <MonthStep icon="chevron-forward" label="Luna următoare" disabled={history.offset >= 0} onPress={() => history.setOffset((o) => o + 1)} testID={`${testIDPrefix}-next`} />
    </View>
  );
}

/** A card's first `limit` rows, then "Vezi încă N" (N = the rows hidden) that unfolds the
 * rest in place ("Arată mai puține" folds back) -- Simplu has no separate
 * history pages, so every record of the month must stay reachable here. */
export function useShowAll<T>(rows: T[], limit: number, resetKey?: string | number) {
  const [expanded, setExpanded] = useState(false);
  // Folds back when what's listed changes (e.g. another month picked).
  useEffect(() => setExpanded(false), [resetKey]);
  return {
    visible: expanded ? rows : rows.slice(0, limit),
    // `hidden` = what "Vezi încă N" unfolds (the rows past `limit`).
    more: rows.length > limit ? { total: rows.length, hidden: rows.length - limit, expanded, toggle: () => setExpanded((v) => !v) } : null,
  };
}

export function ShowAllLine({ more, testID }: { more: { total: number; hidden: number; expanded: boolean; toggle: () => void } | null; testID?: string }) {
  const { spacing, colors } = useTheme();
  if (!more) return null;
  return (
    <PressableScale
      testID={testID}
      onPress={more.toggle}
      scaleTo={1}
      pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
      accessibilityRole="button"
      accessibilityState={{ expanded: more.expanded }}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, paddingHorizontal: spacing.lg }}
    >
      <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurfaceSecondary }}>
        {more.expanded ? "Arată mai puține" : `Vezi încă ${more.hidden}`}
      </Text>
      <Ionicons name={more.expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.onSurfaceSecondary} />
    </PressableScale>
  );
}

/** A status dot + name + right text (Documente / Urmează rows). */
export function DotLine({ dot, name, right, rightColor, onPress }: { dot: string; name: string; right?: string | null; rightColor?: string; onPress?: () => void }) {
  const { spacing, colors } = useTheme();
  return (
    <PressableScale
      disabled={!onPress}
      onPress={onPress}
      scaleTo={1}
      pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Editează: ${name}` : undefined}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.lg, minHeight: 44 }}
    >
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />
      <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>
        {name}
      </Text>
      {right ? <Text style={{ fontSize: 13, color: rightColor ?? colors.onSurfaceTertiary }}>{right}</Text> : null}
    </PressableScale>
  );
}

/** what · when · amount (Luna asta rows). */
export function SpendLine({ what, when, amount, onPress, onDelete }: { what: string; when: string; amount: string; onPress?: () => void; onDelete?: () => void }) {
  const { spacing, colors } = useTheme();
  // Swipe left = delete (the app's rule for logs), when the screen allows it.
  return (
    <SwipeRow onDelete={onDelete} cornerRadius={0} colors={colors}>
    <PressableScale
      disabled={!onPress}
      onPress={onPress}
      scaleTo={1}
      pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Editează: ${what}, ${amount}` : undefined}
      accessibilityActions={onDelete ? [{ name: "delete", label: "Șterge" }] : undefined}
      onAccessibilityAction={onDelete ? (e) => e.nativeEvent.actionName === "delete" && onDelete() : undefined}
      // Opaque, so the red delete panel shows only while swiping.
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 9, paddingHorizontal: spacing.lg, minHeight: 44, backgroundColor: colors.surfaceSecondary }}
    >
      <Text style={{ flex: 1, fontSize: 15, color: colors.onSurface }} numberOfLines={1}>
        {what}
      </Text>
      <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, minWidth: 56 }} numberOfLines={1}>
        {when}
      </Text>
      <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface, minWidth: 64, textAlign: "right" }} numberOfLines={1}>
        {amount}
      </Text>
    </PressableScale>
    </SwipeRow>
  );
}

/** Swipe-left delete of one record from a Simplu space screen: the app's
 * confirm (no sheet is open here, so ConfirmHost shows fine), then
 * DELETE /items/{id} and a refresh of the space, Acasă and the "+" cache. */
export async function deleteRecordWithConfirm(itemId: string, name: string, onDone: () => void): Promise<void> {
  const ok = await confirmAction(`Ștergi „${name}”?`, "Se șterge definitiv și nu se poate anula.", { confirmLabel: "Șterge", destructive: true });
  if (!ok) return;
  try {
    await api.deleteItem(itemId);
    onDone();
    DeviceEventEmitter.emit(REFRESH_EVENT);
  } catch (e: any) {
    notifyAction("Nu am putut șterge", e?.message || "A apărut o eroare.");
  }
}

/** The one calm line an empty section shows. */
export function CalmLine({ text = "Adaugă cu + de jos." }: { text?: string }) {
  const { spacing, colors } = useTheme();
  return <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md }}>{text}</Text>;
}

/** "Marți, 21 octombrie" (+ year when not this year); today / tomorrow
 * say so: "Azi, 15 octombrie", "Mâine, 16 octombrie". */
export function weekdayDate(d: Date): string {
  const withYear = d.getFullYear() !== new Date().getFullYear();
  const date = d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) });
  const days = daysFromToday(d);
  if (days === 0) return `Azi, ${date}`;
  if (days === 1) return `Mâine, ${date}`;
  const weekday = d.toLocaleDateString("ro-RO", { weekday: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${date}`;
}

/** A document's expiry, said the way people say it: "expiră azi",
 * "expiră mâine", "expiră pe 21 oct.", "a expirat pe 3 oct." (lowercase;
 * capitalize at the start of a line). */
export function expiryText(expiry: Date): string {
  const days = daysFromToday(expiry);
  const date = roDate(expiry, { short: true });
  if (days < 0) return `a expirat pe ${date}`;
  if (days === 0) return "expiră azi";
  if (days === 1) return "expiră mâine";
  return `expiră pe ${date}`;
}

/** True when `date` falls in the current local month. */
export function isThisMonth(date: string | Date): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
