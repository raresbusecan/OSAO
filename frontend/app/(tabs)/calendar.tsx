import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, DeviceEventEmitter, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { notifyAction, confirmAction } from "@/lib/confirm";
import { detectSpaceType, SPACE_IDENTITY_COLORS, CUSTOM_EVENT_COLOR } from "@/lib/spaces/spaceProfile";
import { densityColor } from "@/lib/statusColors";

// Local calendar date, NOT toISOString().slice(0,10) -- that reads UTC
// components, so for any user whose local time has already crossed
// (or hasn't yet reached) midnight relative to UTC, it silently
// returns tomorrow's or yesterday's date instead of today's. The grid
// itself (`key` below, built from local y/m/d state) was always local
// -- this just makes ymd() match it, for both "is this cell today"
// and the initial/recurring-bill `selected` value.
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function firstOfMonth(y: number, m: number) { return new Date(Date.UTC(y, m, 1)); }
function daysInMonth(y: number, m: number) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }

// How far through its billing cycle a RECURRING item is -- created_at
// on a projected occurrence is that cycle's start (see
// CalendarController::projectRecurringOccurrences), a real, meaningful
// reference. Deliberately gated on `is_projected`: a one-off item's
// created_at is just "whenever I happened to type it in", not the start
// of any real period -- an event entered 20 minutes before its own
// same-day due time would show a "6% of the way there" bar that means
// nothing, so those get a plain days-left line instead (see the render
// below), never a percentage.
function dueProgress(item: any): { pct: number; daysLeft: number } | null {
  if (!item.is_projected || !item.due_at || !item.created_at) return null;
  const start = new Date(item.created_at).getTime();
  const end = new Date(item.due_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const now = Date.now();
  const pct = Math.max(0, Math.min(1, (now - start) / (end - start)));
  const daysLeft = Math.ceil((end - now) / 86400000);
  return { pct, daysLeft };
}

// Plain "in N days / today / N days overdue" for anything dueProgress
// won't touch (every non-recurring item) -- still useful context, just
// not framed as a % of some period that doesn't really exist.
function daysUntil(item: any): string | null {
  if (!item.due_at) return null;
  const end = new Date(item.due_at).getTime();
  if (!Number.isFinite(end)) return null;
  const days = Math.round((end - Date.now()) / 86400000);
  if (days === 0) return "azi";
  if (days > 0) return `peste ${days} ${days === 1 ? "zi" : "zile"}`;
  return `cu ${Math.abs(days)} ${Math.abs(days) === 1 ? "zi" : "zile"} în urmă`;
}

type DayGroup = { key: string; label: string; icon: string; color: string; items: any[] };

// One section per space (real name + icon, same identity color used on
// Budget) plus a dedicated "custom events" section for anything with no
// space_id -- so a day with items from several spaces reads as
// structured groups, not one flat mixed list.
function groupBySpace(items: any[], onSurfaceTertiary: string): DayGroup[] {
  const groups: DayGroup[] = [];
  const byKey: Record<string, DayGroup> = {};
  for (const it of items) {
    const isCustom = !it.space;
    const key = isCustom ? "custom" : `space-${it.space.id}`;
    if (!byKey[key]) {
      const kind = isCustom ? null : detectSpaceType(it.space, null);
      const color = isCustom ? CUSTOM_EVENT_COLOR : (kind && SPACE_IDENTITY_COLORS[kind]) || onSurfaceTertiary;
      const label = isCustom ? "EVENIMENTE CUSTOM" : String(it.space.name || "Space").toUpperCase();
      const icon = isCustom ? "sparkles-outline" : it.space.icon || "ellipse-outline";
      byKey[key] = { key, label, icon, color, items: [] };
      groups.push(byKey[key]);
    }
    byKey[key].items.push(it);
  }
  return groups;
}

export default function CalendarScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  // Deep-link from TodoCarouselSheet's "Deschide" on a custom_event
  // to-do -- jumps straight to that event's day instead of always
  // opening on today (see the mount effect below, past `selected`).
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const today = new Date();
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth()); // 0-11
  const [selected, setSelected] = useState<string>(ymd(today));
  const [data, setData] = useState<{ days: Record<string, any[]>; recurring: any[] }>({ days: {}, recurring: [] });
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [newNotes, setNewNotes] = useState("");
  const [notesExpanded, setNotesExpanded] = useState(false);
  // "Implică o cumpărare" -- no new category, just a toggle on the same
  // custom_event: turning it on reveals an amount, which is what makes
  // this event also count as real Expenses spend (see
  // Item::SPENDING_TYPES/SPENDING_TYPE_SPACE's custom_event entry). Off
  // by default: most custom events are plain reminders with nothing to
  // spend.
  const [involvesPurchase, setInvolvesPurchase] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  // Recurring toggle + frequency -- yearly first since a birthday ("same
  // day, one year later") is the motivating case, but weekly/monthly
  // stay available since the underlying `recurrence` field and the
  // calendar's own projection already support all three uniformly.
  const [isRecurring, setIsRecurring] = useState(false);
  const [newRecurrence, setNewRecurrence] = useState<"weekly" | "monthly" | "yearly">("yearly");
  const [savingEvent, setSavingEvent] = useState(false);

  const monthStr = useMemo(() => `${y}-${String(m + 1).padStart(2, "0")}`, [y, m]);

  const load = useCallback(async () => {
    try {
      const r = await api.calendar(monthStr);
      setData({ days: r.days || {}, recurring: r.recurring || [] });
    } catch {}
  }, [monthStr]);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => load());
    return () => sub.remove();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changeMonth = (delta: number) => {
    let nm = m + delta, ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    setM(nm); setY(ny);
  };

  const first = firstOfMonth(y, m);
  const startWeekday = first.getUTCDay(); // 0 Sun .. 6 Sat
  const dim = daysInMonth(y, m);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(y, m, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  const selectedItems = data.days[selected] || [];
  const groupedSelectedItems = useMemo(() => groupBySpace(selectedItems, colors.onSurfaceTertiary), [selectedItems, colors.onSurfaceTertiary]);

  // Collapsed-by-default accordion, one row per space (see
  // groupBySpace) -- a busy day's groups start collapsed so the day
  // reads as a short, scannable list of "what categories, how many"
  // instead of every item at once; a day with only one group has
  // nothing to disambiguate by collapsing, so it opens automatically.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Forces "custom" open the next time this recomputes, regardless of
  // how many groups that day has -- set by the ?date= deep-link mount
  // effect below once that day's data has actually loaded (data loads
  // async after the month changes, so this can't just fire once on
  // mount; it stays armed until there's something to expand).
  const forceExpandCustomRef = useRef(false);
  useEffect(() => {
    const base = groupedSelectedItems.length === 1 ? new Set([groupedSelectedItems[0].key]) : new Set<string>();
    if (forceExpandCustomRef.current && groupedSelectedItems.length > 0) {
      base.add("custom");
      forceExpandCustomRef.current = false;
    }
    setExpandedGroups(base);
    // Re-runs when the selected day (or what's in it) changes -- never on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, groupedSelectedItems.length]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Applies the ?date= deep-link once, on mount -- jumps the grid to
  // that day's month and selects it, then makes sure the custom-events
  // group is expanded regardless of how many groups that day ends up
  // having (the auto-expand above only opens automatically when it's
  // the only group).
  const appliedDateParamRef = useRef(false);
  useEffect(() => {
    if (appliedDateParamRef.current || !dateParam) return;
    const parsed = new Date(`${dateParam}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    appliedDateParamRef.current = true;
    forceExpandCustomRef.current = true;
    setY(parsed.getFullYear());
    setM(parsed.getMonth());
    setSelected(dateParam);
  }, [dateParam]);

  // Already sorted by next due date server-side (CalendarController's
  // own `recurring` list) and independent of whichever month the grid
  // above happens to be showing -- this is "what's coming up", not
  // "what falls in the currently viewed month".
  const recurringUpcoming = data.recurring;

  // Inline on the page, right under the selected day -- no FAB, no
  // sheet. The event is always created for whichever day is currently
  // selected in the grid above, so picking the day IS picking the date;
  // there's nothing left to ask except title (and optionally time/notes).
  const saveCustomEvent = async () => {
    if (!newTitle.trim()) return;
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(newTime.trim());
    const hh = timeMatch ? Math.min(23, Number(timeMatch[1])) : 9;
    const mm = timeMatch ? Math.min(59, Number(timeMatch[2])) : 0;
    const dueAt = `${selected}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
    const amount = involvesPurchase ? Number(newAmount.replace(",", ".")) : NaN;

    setSavingEvent(true);
    try {
      await api.createItem({
        type: "custom_event",
        title: newTitle.trim(),
        due_at: dueAt,
        notes: newNotes.trim() || undefined,
        amount: involvesPurchase && Number.isFinite(amount) && amount > 0 ? amount : undefined,
        currency: involvesPurchase && Number.isFinite(amount) && amount > 0 ? "RON" : undefined,
        recurrence: isRecurring ? newRecurrence : undefined,
      });
      setNewTitle("");
      setNewTime("09:00");
      setNewNotes("");
      setNotesExpanded(false);
      setInvolvesPurchase(false);
      setNewAmount("");
      setIsRecurring(false);
      setNewRecurrence("yearly");
      DeviceEventEmitter.emit(REFRESH_EVENT);
      await load();
    } catch (error: any) {
      notifyAction("Nu am putut salva evenimentul", error?.message || "A apărut o eroare.");
    } finally {
      setSavingEvent(false);
    }
  };

  const deleteCustomEvent = async (item: any) => {
    const confirmed = await confirmAction(
      "Remove event",
      `Remove "${item.title}"?`,
      { confirmLabel: "Remove", destructive: true },
    );
    if (!confirmed) return;
    try {
      await api.deleteItem(item.id);
      DeviceEventEmitter.emit(REFRESH_EVENT);
      await load();
    } catch (error: any) {
      notifyAction("Nu am putut șterge evenimentul", error?.message || "A apărut o eroare.");
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="calendar-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140, gap: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>Calendar</Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm }}>
          <Pressable
            testID="cal-prev-month"
            onPress={() => changeMonth(-1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={{ ...typography.subtitle, color: colors.onSurface }}>{monthName}</Text>
          <Pressable
            testID="cal-next-month"
            onPress={() => changeMonth(1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <View>
          <View style={{ flexDirection: "row" }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", paddingBottom: 6 }}>
                <Text style={{ ...typography.micro, color: colors.onSurfaceTertiary, fontWeight: "700" }}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((d, i) => {
              const key = d != null ? `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : `x-${i}`;
              const dayItems = d != null ? data.days[key] || [] : [];
              const dayGroups = d != null ? groupBySpace(dayItems, colors.onSurfaceTertiary) : [];
              const density = densityColor(dayItems.length, colors);
              const isSelected = d != null && key === selected;
              const isToday = d != null && key === ymd(today);
              return (
                <Pressable
                  key={key}
                  testID={d != null ? `cal-day-${key}` : undefined}
                  onPress={() => d != null && setSelected(key)}
                  disabled={d == null}
                  accessibilityRole={d != null ? "button" : undefined}
                  accessibilityLabel={
                    d != null
                      ? `${new Date(y, m, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${dayItems.length ? `, ${dayItems.length} items` : ""}`
                      : undefined
                  }
                  accessibilityState={d != null ? { selected: isSelected } : undefined}
                  style={{
                    width: `${100 / 7}%`, aspectRatio: 1,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {d != null && (
                    <View style={{ alignItems: "center" }}>
                      {/* Selection is a "target ring": a dark outer disc, a page-background
                          gap, then the density-colored circle on top. The gap guarantees
                          the ring stays visible even when the day itself is the darkest
                          density tier, which a plain border can't -- a border drawn in the
                          same tone as a solid-black fill disappears into it. */}
                      <View style={{
                        width: 42, height: 42, borderRadius: radius.md,
                        alignItems: "center", justifyContent: "center",
                        backgroundColor: isSelected ? colors.onSurface : "transparent",
                      }}>
                        <View style={{
                          width: 36, height: 36, borderRadius: radius.md,
                          alignItems: "center", justifyContent: "center",
                          backgroundColor: isSelected ? colors.surface : "transparent",
                        }}>
                          <View style={{
                            width: 32, height: 32, borderRadius: radius.md,
                            alignItems: "center", justifyContent: "center",
                            backgroundColor: density.bg,
                            borderWidth: !isSelected && isToday ? 1.5 : 0,
                            borderColor: colors.onSurface,
                          }}>
                            <Text style={{
                              fontSize: 14, fontWeight: dayItems.length >= 3 || isSelected || isToday ? "700" : "500",
                              color: density.text,
                            }}>{d}</Text>
                          </View>
                        </View>
                      </View>
                      {dayGroups.length > 1 ? (
                        <View style={{ flexDirection: "row", gap: 2, marginTop: 2, height: 4 }}>
                          {dayGroups.slice(0, 4).map((g) => (
                            <View key={g.key} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: g.color }} />
                          ))}
                        </View>
                      ) : (
                        <View style={{ height: 4, marginTop: 2 }} />
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: spacing.lg }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "700", letterSpacing: 0.4 }}>
            {new Date(selected).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
          </Text>

          {/* Add a custom event right here, for whichever day is
              selected above -- no FAB, no sheet, the page itself is the
              form. */}
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <TextInput
                testID="new-event-title"
                value={newTitle}
                onChangeText={setNewTitle}
                onSubmitEditing={saveCustomEvent}
                returnKeyType="done"
                placeholder="Eveniment nou"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={{ flex: 1, minWidth: 0, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14 }}
              />
              <TextInput
                testID="new-event-time"
                value={newTime}
                onChangeText={setNewTime}
                onSubmitEditing={saveCustomEvent}
                returnKeyType="done"
                placeholder="HH:MM"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={{ width: 64, height: 44, paddingHorizontal: spacing.sm, borderRadius: radius.sm, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14, textAlign: "center" }}
              />
              <Pressable
                testID="new-event-save"
                onPress={saveCustomEvent}
                disabled={savingEvent || !newTitle.trim()}
                accessibilityRole="button"
                accessibilityLabel="Add event"
                accessibilityState={{ busy: savingEvent, disabled: savingEvent || !newTitle.trim() }}
                style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.onSurface, alignItems: "center", justifyContent: "center", opacity: savingEvent || !newTitle.trim() ? 0.5 : 1 }}
              >
                {savingEvent ? <ActivityIndicator color={colors.surface} /> : <Ionicons name="add" size={20} color={colors.surface} />}
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable
                testID="new-event-toggle-purchase"
                onPress={() => setInvolvesPurchase((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ selected: involvesPurchase }}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 6,
                  paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill,
                  backgroundColor: involvesPurchase ? colors.onSurface : "transparent",
                  borderWidth: 1, borderColor: involvesPurchase ? colors.onSurface : colors.border,
                }}
              >
                <Ionicons name="cash-outline" size={14} color={involvesPurchase ? colors.surface : colors.onSurfaceTertiary} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: involvesPurchase ? colors.surface : colors.onSurfaceTertiary }}>
                  Implică o cumpărare
                </Text>
              </Pressable>

              <Pressable
                testID="new-event-toggle-recurring"
                onPress={() => setIsRecurring((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ selected: isRecurring }}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 6,
                  paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill,
                  backgroundColor: isRecurring ? colors.onSurface : "transparent",
                  borderWidth: 1, borderColor: isRecurring ? colors.onSurface : colors.border,
                }}
              >
                <Ionicons name="repeat-outline" size={14} color={isRecurring ? colors.surface : colors.onSurfaceTertiary} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: isRecurring ? colors.surface : colors.onSurfaceTertiary }}>
                  Recurent
                </Text>
              </Pressable>
            </View>

            {/* Turning this on is what makes the event also count as
                real Expenses spend -- no new category, just an amount
                on the same custom_event (see Item::SPENDING_TYPES). */}
            {involvesPurchase ? (
              <TextInput
                testID="new-event-amount"
                value={newAmount}
                onChangeText={setNewAmount}
                placeholder="Sumă aproximativă (RON)"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="decimal-pad"
                style={{ height: 44, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14 }}
              />
            ) : null}

            {/* Yearly first -- "same day, a year later" (a birthday) is
                the case this was built for, though weekly/monthly work
                the same way the calendar already projects home_recurring. */}
            {isRecurring ? (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {(["weekly", "monthly", "yearly"] as const).map((freq) => (
                  <Pressable
                    key={freq}
                    testID={`new-event-recurrence-${freq}`}
                    onPress={() => setNewRecurrence(freq)}
                    style={{
                      flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.sm,
                      backgroundColor: newRecurrence === freq ? colors.onSurface : "transparent",
                      borderWidth: 1, borderColor: newRecurrence === freq ? colors.onSurface : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: newRecurrence === freq ? colors.surface : colors.onSurfaceTertiary }}>
                      {({ weekly: "Săptămânal", monthly: "Lunar", yearly: "Anual" } as const)[freq]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Pressable
              testID="new-event-toggle-notes"
              onPress={() => setNotesExpanded((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                {notesExpanded ? "Ascunde notița" : "Adaugă notă (opțional)"}
              </Text>
              <Ionicons name={notesExpanded ? "chevron-up" : "chevron-down"} size={12} color={colors.onSurfaceTertiary} />
            </Pressable>

            {notesExpanded ? (
              <TextInput
                testID="new-event-notes"
                value={newNotes}
                onChangeText={setNewNotes}
                placeholder="Notă"
                placeholderTextColor={colors.onSurfaceTertiary}
                multiline
                style={{ minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 13.5, textAlignVertical: "top" }}
              />
            ) : null}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.onSurfaceTertiary} />
          ) : groupedSelectedItems.length === 0 ? (
            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>Nimic programat.</Text>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {groupedSelectedItems.map((group) => {
                const isExpanded = expandedGroups.has(group.key);
                return (
                  <View key={group.key} style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
                    <Pressable
                      testID={`agenda-group-${group.key}`}
                      onPress={() => toggleGroup(group.key)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isExpanded }}
                      accessibilityLabel={`${group.label}, ${group.items.length} items`}
                      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg }}
                    >
                      <Ionicons name={group.icon as any} size={16} color={group.color} />
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface, flex: 1 }}>
                        {group.label.charAt(0) + group.label.slice(1).toLowerCase()}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onSurfaceTertiary }}>{group.items.length}</Text>
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.onSurfaceTertiary} />
                    </Pressable>

                    {isExpanded ? (
                      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}>
                        {group.items.map((it: any) => {
                          const progress = dueProgress(it);
                          const isCustom = !it.space;
                          return (
                            <View
                              key={it.id}
                              testID={`agenda-item-${it.id}`}
                              style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md, gap: 4 }}
                            >
                              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ ...typography.body, color: colors.onSurface }}>{it.title}</Text>
                                  <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary }}>
                                    {new Date(it.due_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                                    {it.amount != null ? ` · ${it.currency || "RON"} ${Number(it.amount).toFixed(2)}` : ""}
                                  </Text>
                                </View>
                                {isCustom ? (
                                  <Pressable
                                    testID={`agenda-item-delete-${it.id}`}
                                    onPress={() => deleteCustomEvent(it)}
                                    hitSlop={10}
                                    accessibilityRole="button"
                                    accessibilityLabel="Delete event"
                                  >
                                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                                  </Pressable>
                                ) : null}
                              </View>
                              {progress ? (
                                <View style={{ gap: 3 }}>
                                  <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
                                    <View style={{ width: `${progress.pct * 100}%`, height: "100%", borderRadius: 2, backgroundColor: group.color }} />
                                  </View>
                                  <Text style={{ fontSize: 10.5, color: colors.onSurfaceTertiary }}>
                                    {Math.round(progress.pct * 100)}% din ciclu a trecut · {progress.daysLeft >= 0 ? `${progress.daysLeft} zile rămase` : "termen depășit"}
                                  </Text>
                                </View>
                              ) : (
                                <Text style={{ fontSize: 10.5, color: colors.onSurfaceTertiary }}>{daysUntil(it)}</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.lg }}>
          <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.6, color: colors.onSurfaceTertiary }}>
            CHELTUIELI RECURENTE ({recurringUpcoming.length})
          </Text>
          {loading ? null : recurringUpcoming.length === 0 ? (
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Nimic recurent momentan.</Text>
          ) : (
            <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
              {recurringUpcoming.map((it: any, index: number) => {
                const isCustom = !it.space;
                const kind = isCustom ? null : detectSpaceType(it.space, null);
                const color = isCustom ? CUSTOM_EVENT_COLOR : (kind && SPACE_IDENTITY_COLORS[kind]) || colors.onSurfaceTertiary;
                const dueDate = new Date(it.due_at);
                const frequency = ({ weekly: "săptămânal", monthly: "lunar", yearly: "anual" } as any)[it.recurrence] || it.recurrence;
                return (
                  <Pressable
                    key={it.id}
                    testID={`recurring-item-${it.id}`}
                    onPress={() => { setY(dueDate.getFullYear()); setM(dueDate.getMonth()); setSelected(ymd(dueDate)); }}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: spacing.md,
                      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                      borderBottomWidth: index === recurringUpcoming.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="repeat-outline" size={15} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{it.title}</Text>
                      <Text style={{ fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 1 }}>
                        {isCustom ? "Custom" : it.space.name} · {frequency}
                        {it.amount != null ? ` · ${it.currency || "RON"} ${Number(it.amount).toFixed(2)}` : ""}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurface }}>
                      {dueDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
