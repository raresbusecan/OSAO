import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";
import { severityColor } from "@/lib/statusColors";
import { CUSTOM_EVENT_COLOR, spaceColors } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import { Group, Row, SectionHeader, EmptyState, hexToRgba } from "@/components/ui/primitives";
import { PressableScale } from "@/components/ui/PressableScale";
import { motion } from "@/lib/motion";
import { daysFromToday, roCount, roDate, roRelativeDays } from "@/lib/format";
import { overdueKmLabel, todoHref, todoTitle } from "@/lib/dashboard/spaceDue";
import { SwipeItemRow } from "@/components/dashboard/SwipeItemRow";
import { CreditReminderRow, isReminder } from "@/components/dashboard/CreditReminderRow";

type TodoItem = {
  id: number | string;
  type: string;
  title: string;
  due_at: string;
  recurrence?: string | null;
  metadata?: Record<string, any> | null;
  overdue_km?: number | null;
  space: { id: number | string; name: string; icon: string; type?: string | null; color?: string | null } | null;
};

export type TodoCarouselSheetProps = {
  visible: boolean;
  onClose: () => void;
  overdue: TodoItem[];
  today: TodoItem[];
  upcoming: TodoItem[];
  /** Called after an item is marked resolved (or un-resolved), so the
   * caller (Home) can refetch and the widget's count stays in sync. */
  onChanged: () => void;
};

/** Status for a row -- red past due, muted ahead, nothing for today
 * (the "Azi" header already says it). Same daysFromToday the group
 * headers use, so a header and its rows can't disagree. */
function statusFor(days: number, colors: ThemeColors): { label: string; color: string } | null {
  if (days < 0) return { label: `Restant ${roCount(-days, "zi", "zile")}`, color: severityColor("critical", colors) };
  if (days === 0) return null;
  return { label: roRelativeDays(days), color: colors.onSurfaceTertiary };
}

/** Only a plain one-off task or reminder can be ticked off right here.
 * Everything else has its own resolve step in its Space -- a purchase
 * asks for the price, a recurring task/bill/visit advances to its next
 * date, a car document gets renewed -- so its row opens that instead of
 * closing it for good with a bare status change. */
function canQuickResolve(item: TodoItem): boolean {
  const meta = item.metadata ?? {};
  if (item.recurrence) return false;
  if (item.type === "custom_event") return true;
  if (item.type === "home_task") return !meta.isRecurring && !meta.isPurchase;
  return false;
}

/**
 * Opened from Home's "De făcut" -- every real to-do, grouped Restante /
 * Azi / Următoarele by local calendar day. Tapping a row opens it where
 * it actually gets resolved (its Space's sub-view, or Calendar for a
 * custom event); a plain one-off task/reminder also has a check button,
 * with "Anulează" right after in case of a mis-tap.
 * (Name kept from the earlier carousel version -- Home imports it.)
 */
/** After a blur, how long the sheet waits to reappear (see its focus effect). */
const SHEET_RESUME_MS = 200;

export function TodoCarouselSheet({ visible, onClose, overdue, today, upcoming, onChanged }: TodoCarouselSheetProps) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const [focused, setFocused] = useState(true);
  const scrollOffset = useRef(0);
  const [resumeOffset, setResumeOffset] = useState(0);
  const blurredOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    setResumeOffset(scrollOffset.current);
    // Coming back, the screen we left is often still dismissing (a
    // record-action modal over Acasă). Presenting this Sheet's Modal in that
    // moment made iOS drop it: an empty, invisible window stayed over Acasă
    // and swallowed every touch until a tab switch (phone, 2026-11-02).
    // So the resume waits for that dismissal; the first show doesn't.
    const timer = blurredOnce.current ? setTimeout(() => setFocused(true), SHEET_RESUME_MS) : undefined;
    if (!timer) setFocused(true);
    return () => {
      if (timer) clearTimeout(timer);
      blurredOnce.current = true;
      setFocused(false);
    };
  }, []));
  useEffect(() => { if (!visible) scrollOffset.current = 0; }, [visible]);
  const [resolvingId, setResolvingId] = useState<string | number | null>(null);
  // Ticked off during this open of the sheet -- the row stays, struck
  // through, with "Anulează" until the sheet closes.
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  // The server's three lists are only the source; grouping is by LOCAL
  // calendar day, the same helper every row's status uses.
  // Credit reminders (`reminder: true`) aren't to-dos: no resolve, no
  // swipe, not counted -- listed apart under "Mementouri".
  const reminders = [...overdue, ...today, ...upcoming].filter(isReminder);
  const all = [...overdue, ...today, ...upcoming]
    .filter((item) => !isReminder(item))
    .map((item) => ({ item, days: daysFromToday(item.due_at) }))
    .sort((a, b) => new Date(a.item.due_at).getTime() - new Date(b.item.due_at).getTime());
  const groups = [
    { key: "overdue", title: "Restante", rows: all.filter((r) => r.days < 0) },
    { key: "today", title: "Azi", rows: all.filter((r) => r.days === 0) },
    { key: "upcoming", title: "Următoarele", rows: all.filter((r) => r.days > 0) },
  ].filter((g) => g.rows.length > 0);
  const openCount = all.filter((r) => !resolved.has(String(r.item.id))).length;

  const openTarget = (item: TodoItem) => {
    const href = todoHref(item, "resolve");
    if (!href.startsWith("/record-action?")) onClose();
    router.navigate(href as any);
  };

  const setDone = async (item: TodoItem, done: boolean) => {
    setResolvingId(item.id);
    try {
      await api.updateItem(
        item.id,
        done ? { status: "completed", completed_at: new Date().toISOString() } : { status: "pending", completed_at: null },
      );
      setResolved((prev) => {
        const next = new Set(prev);
        if (done) next.add(String(item.id));
        else next.delete(String(item.id));
        return next;
      });
      onChanged();
    } catch (error: any) {
      notifyAction(done ? "Nu am putut marca drept rezolvat" : "Nu am putut anula", error?.message || "A apărut o eroare.");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <Sheet
      visible={visible && focused}
      initialScrollOffset={resumeOffset}
      onScrollOffsetChange={(offset) => { scrollOffset.current = offset; }}
      info="todo.sheet"
      onClose={() => {
        setResolved(new Set());
        onClose();
      }}
      title="De făcut"
      subtitle={openCount > 0 ? roCount(openCount, "lucru", "lucruri") : undefined}
      icon="checkbox-outline"
      testID="todo-sheet"
    >
      {all.length === 0 && reminders.length === 0 ? (
        <View style={{ backgroundColor: colors.surfaceTertiary, borderRadius: radius.card }}>
          <EmptyState icon="checkmark-circle-outline" title="Totul e rezolvat" message="Nimic restant și nimic pentru azi." />
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: spacing.sm }}>
            <SectionHeader title={`${g.title} (${g.rows.length})`} muted />
            <Group inset={20}>
              {g.rows.map(({ item, days }) => {
                const isDone = resolved.has(String(item.id));
                const kmLabel = overdueKmLabel(item);
                const isDoc = item.type.endsWith("_document");
                // Documents read by their validity date, not a day count.
                const docDate = isDoc ? roDate(item.due_at, { short: true }) : "";
                const status = kmLabel
                  ? { label: kmLabel, color: severityColor("critical", colors) }
                  : isDoc
                    ? { label: days < 0 ? `Expirat pe ${docDate}` : `Expiră pe ${docDate}`, color: days < 0 ? severityColor("critical", colors) : days === 0 ? colors.warning : colors.onSurfaceTertiary }
                    : statusFor(days, colors);
                const color = item.space ? spaceColors(item.space, false)?.color ?? colors.onSurfaceTertiary : CUSTOM_EVENT_COLOR;
                const busy = resolvingId === item.id;
                return (
                  <SwipeItemRow key={item.id} item={item} onChanged={onChanged} canResolve={!isDone} canDelete={!isDone}>
                  <Row
                    testID={`todo-open-${item.id}`}
                    onPress={isDone ? undefined : () => openTarget(item)}
                    strike={isDone}
                    dim={isDone}
                    leading={<View style={{ width: 4, alignSelf: "stretch", marginVertical: 10, borderRadius: 2, backgroundColor: color }} />}
                    title={todoTitle(item)}
                    subtitle={
                      <>
                        {item.space ? item.space.name : "Personal"}
                        {isDone ? (
                          <Text style={{ color: colors.success }}> · Rezolvat</Text>
                        ) : status ? (
                          <Text style={{ color: status.color }}>{` · ${status.label}`}</Text>
                        ) : null}
                      </>
                    }
                    trailing={
                      isDone ? (
                        <Pressable
                          testID={`todo-undo-${item.id}`}
                          onPress={() => setDone(item, false)}
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel={`Anulează rezolvarea: ${item.title}`}
                          style={{ minHeight: 44, paddingHorizontal: spacing.xs, justifyContent: "center" }}
                        >
                          {busy ? <ActivityIndicator size="small" color={colors.onSurfaceTertiary} /> : <Text style={{ fontSize: 14, color: colors.onSurface }}>Anulează</Text>}
                        </Pressable>
                      ) : canQuickResolve(item) ? (
                        <PressableScale
                          testID={`todo-resolve-${item.id}`}
                          onPress={() => setDone(item, true)}
                          disabled={busy}
                          scaleTo={motion.scale.control}
                          accessibilityRole="button"
                          accessibilityLabel={`Marchează rezolvat: ${item.title}`}
                          style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(colors.success, 0.14) }}
                        >
                          {busy ? <ActivityIndicator size="small" color={colors.success} /> : <Ionicons name="checkmark" size={20} color={colors.success} />}
                        </PressableScale>
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
                      )
                    }
                  />
                  </SwipeItemRow>
                );
              })}
            </Group>
          </View>
        ))
      )}
      {reminders.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title={`Mementouri (${reminders.length})`} muted />
          <Group inset={68}>
            {reminders.map((item) => (
              <CreditReminderRow
                key={`credit-${item.id}`}
                item={item}
                testID={`todo-reminder-${item.id}`}
                onBeforeOpen={() => {
                  setResolved(new Set());
                  onClose();
                }}
              />
            ))}
          </Group>
        </View>
      ) : null}
    </Sheet>
  );
}
