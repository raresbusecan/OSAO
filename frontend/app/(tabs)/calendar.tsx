import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, DeviceEventEmitter, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { notifyAction, confirmAction } from "@/lib/confirm";
import { detectSpaceType, SPACE_IDENTITY_COLORS, CUSTOM_EVENT_COLOR } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import {
  PageTitle, CircleButton, SectionHeader, Group, Row, IconWell, Chip, Pill, Button, Field, ToggleRow, Segmented, EmptyState,
} from "@/components/ui/primitives";
import { capitalize, lei, roDate } from "@/lib/format";

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

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const FREQUENCY_LABEL: Record<string, string> = { weekly: "săptămânal", monthly: "lunar", yearly: "anual" };

/** The color an item reads in: its Space's identity color, or the
 * custom-event pink for anything with no space. */
function itemColor(item: any, fallback: string): string {
  if (!item.space) return CUSTOM_EVENT_COLOR;
  const kind = detectSpaceType(item.space, null);
  return SPACE_IDENTITY_COLORS[kind] ?? fallback;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
}

/** "Casă, 60 lei" for a Space item; "19:30" (plus the amount, if any)
 * for a custom event -- what the agenda row needs to say, nothing more. */
function agendaSubtitle(item: any): string {
  const amount = item.amount != null && Number(item.amount) > 0 ? lei(Number(item.amount)) : null;
  const head = item.space ? item.space.name || "Spațiu" : timeLabel(item.due_at);
  return [head, amount].filter(Boolean).join(", ");
}

export default function CalendarScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  // Deep-link from TodoCarouselSheet's "Deschide" on a custom_event
  // to-do -- jumps straight to that event's day instead of always
  // opening on today (see the mount effect below, past `selected`).
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const today = new Date();
  const todayKey = ymd(today);
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth()); // 0-11
  const [selected, setSelected] = useState<string>(todayKey);
  const [data, setData] = useState<{ days: Record<string, any[]>; recurring: any[] }>({ days: {}, recurring: [] });
  const [loading, setLoading] = useState(true);
  const [newEventVisible, setNewEventVisible] = useState(false);
  const [openEvent, setOpenEvent] = useState<any | null>(null);

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

  // Applies the ?date= deep-link once, on mount -- jumps the grid to
  // that day's month and selects it.
  const appliedDateParamRef = useRef(false);
  useEffect(() => {
    if (appliedDateParamRef.current || !dateParam) return;
    const parsed = new Date(`${dateParam}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    appliedDateParamRef.current = true;
    setY(parsed.getFullYear());
    setM(parsed.getMonth());
    setSelected(dateParam);
  }, [dateParam]);

  const changeMonth = (delta: number) => {
    let nm = m + delta, ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    setM(nm); setY(ny);
  };

  // Monday-first grid (Romanian weeks start on Monday).
  const startWeekday = (firstOfMonth(y, m).getUTCDay() + 6) % 7;
  const dim = daysInMonth(y, m);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = capitalize(new Date(y, m, 1).toLocaleDateString("ro-RO", { month: "long", ...(y !== today.getFullYear() ? { year: "numeric" as const } : {}) }));
  const [selY, selM, selD] = selected.split("-").map(Number);
  const selectedDate = new Date(selY, selM - 1, selD);
  const selectedLabel = capitalize(selectedDate.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }));
  const selectedItems = useMemo(
    () => [...(data.days[selected] || [])].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()),
    [data.days, selected],
  );

  const openItem = (item: any) => {
    if (item.space) {
      // Same deep-link TodoCarouselSheet uses -- lands on the sub-view
      // where this item is actually resolved, not just the Space root.
      router.push(`/${item.space.id}?itemId=${item.id}&itemType=${item.type}` as any);
    } else {
      setOpenEvent(item);
    }
  };

  const deleteCustomEvent = async (item: any) => {
    const confirmed = await confirmAction("Ștergi evenimentul?", `„${item.title}” dispare din calendar.`, { confirmLabel: "Șterge", destructive: true });
    if (!confirmed) return;
    try {
      await api.deleteItem(item.id);
      setOpenEvent(null);
      DeviceEventEmitter.emit(REFRESH_EVENT);
      await load();
    } catch (error: any) {
      notifyAction("Nu am putut șterge evenimentul", error?.message || "A apărut o eroare.");
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="calendar-screen">
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 140, gap: spacing.lg }}>
        <PageTitle
          right={
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <CircleButton testID="cal-prev-month" icon="chevron-back" label="Luna trecută" onPress={() => changeMonth(-1)} />
              <CircleButton testID="cal-next-month" icon="chevron-forward" label="Luna viitoare" onPress={() => changeMonth(1)} />
            </View>
          }
        >
          {monthName}
        </PageTitle>

        <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: 10 }}>
          <View style={{ flexDirection: "row", paddingBottom: 6 }}>
            {WEEKDAYS.map((d, i) => (
              <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 12, color: colors.onSurfaceTertiary }}>{d}</Text>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((d, i) => {
              const key = d != null ? `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : `x-${i}`;
              if (d == null) return <View key={key} style={{ width: `${100 / 7}%`, height: 46 }} />;
              const dayItems = data.days[key] || [];
              const dotColors = [...new Set(dayItems.map((it) => itemColor(it, colors.onSurfaceTertiary)))].slice(0, 3);
              const isSelected = key === selected;
              const isToday = key === todayKey;
              return (
                <Pressable
                  key={key}
                  testID={`cal-day-${key}`}
                  onPress={() => setSelected(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${new Date(y, m, d).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" })}${dayItems.length ? `, ${dayItems.length} în agendă` : ""}`}
                  accessibilityState={{ selected: isSelected }}
                  style={{ width: `${100 / 7}%`, height: 46, alignItems: "center", justifyContent: "center", gap: 3 }}
                >
                  <View
                    style={{
                      width: 34, height: 34, borderRadius: 17,
                      alignItems: "center", justifyContent: "center",
                      backgroundColor: isSelected ? colors.onSurface : "transparent",
                      borderWidth: !isSelected && isToday ? 1.5 : 0,
                      borderColor: colors.onSurfaceTertiary,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: isSelected || isToday ? "600" : "400", color: isSelected ? colors.surface : colors.onSurface }}>{d}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 2, height: 4 }}>
                    {dotColors.map((c) => <View key={c} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c }} />)}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface, flexShrink: 1 }} numberOfLines={1}>{selectedLabel}</Text>
          {/* The only filled control on the page -- the one action is unmistakable. */}
          <Pill testID="new-event-open" label="Eveniment" icon="add" active tone={colors.onSurface} onPress={() => setNewEventVisible(true)} />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.onSurfaceTertiary} />
        ) : selectedItems.length === 0 ? (
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card }}>
            <EmptyState icon="calendar-clear-outline" message="Nimic programat în ziua asta." />
          </View>
        ) : (
          <Group>
            {selectedItems.map((it: any) => {
              const isCustom = !it.space;
              const overdue = !it.is_projected && selected < todayKey;
              return (
                <Row
                  key={`${it.id}-${it.due_at}`}
                  testID={`agenda-item-${it.id}`}
                  onPress={() => openItem(it)}
                  leading={<View style={{ width: 4, alignSelf: "stretch", marginVertical: 10, borderRadius: 2, backgroundColor: itemColor(it, colors.onSurfaceTertiary) }} />}
                  title={it.title}
                  subtitle={agendaSubtitle(it)}
                  trailing={
                    selected === todayKey ? <Chip label="Azi" color={colors.warning} />
                      : overdue ? <Chip label="Restant" color={colors.error} />
                        : it.is_projected ? <Ionicons name="repeat" size={15} color={colors.onSurfaceTertiary} />
                          : isCustom ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Personal</Text>
                            : null
                  }
                />
              );
            })}
          </Group>
        )}

        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <SectionHeader title="Plăți recurente" />
          {loading ? null : data.recurring.length === 0 ? (
            <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card }}>
              <EmptyState icon="repeat" message="Nicio plată recurentă momentan." />
            </View>
          ) : (
            <Group inset={68}>
              {data.recurring.map((it: any) => {
                const color = itemColor(it, colors.onSurfaceTertiary);
                const dueDate = new Date(it.due_at);
                const freq = FREQUENCY_LABEL[it.recurrence] || it.recurrence;
                const amount = it.amount != null && Number(it.amount) > 0 ? lei(Number(it.amount)) : null;
                return (
                  <Row
                    key={it.id}
                    testID={`recurring-item-${it.id}`}
                    onPress={() => { setY(dueDate.getFullYear()); setM(dueDate.getMonth()); setSelected(ymd(dueDate)); }}
                    leading={<IconWell icon="repeat" color={color} />}
                    title={it.title}
                    subtitle={capitalize([it.space ? it.space.name : "Personal", freq].join(", "))}
                    trailing={
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        {amount ? <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{amount}</Text> : null}
                        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{roDate(dueDate, { short: true })}</Text>
                      </View>
                    }
                  />
                );
              })}
            </Group>
          )}
        </View>
      </ScrollView>

      <NewEventSheet
        visible={newEventVisible}
        day={selected}
        dayLabel={selectedLabel}
        onClose={() => setNewEventVisible(false)}
        onSaved={async () => {
          setNewEventVisible(false);
          DeviceEventEmitter.emit(REFRESH_EVENT);
          await load();
        }}
      />

      <Sheet
        visible={!!openEvent}
        onClose={() => setOpenEvent(null)}
        title={openEvent?.title ?? ""}
        subtitle={openEvent ? `${capitalize(roDate(openEvent.due_at))}, ${timeLabel(openEvent.due_at)}` : undefined}
        icon="sparkles-outline"
        tone={CUSTOM_EVENT_COLOR}
        footer={openEvent ? (
          <Button testID="event-delete" variant="destructive" icon="trash-outline" label="Șterge evenimentul" onPress={() => deleteCustomEvent(openEvent)} />
        ) : null}
      >
        {openEvent ? (
          <Group>
            {openEvent.recurrence ? <Row title="Se repetă" trailing={<Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>{FREQUENCY_LABEL[openEvent.recurrence] ?? openEvent.recurrence}</Text>} /> : null}
            {openEvent.amount != null && Number(openEvent.amount) > 0 ? <Row title="Sumă" trailing={<Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Number(openEvent.amount))}</Text>} /> : null}
            <Row title="Notă" subtitle={openEvent.notes || "Fără notă"} />
          </Group>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

/**
 * Add a custom event on the selected day. Title and time up front; the
 * purchase amount, repeat and note live under "Mai multe detalii" since
 * most events are plain reminders.
 */
function NewEventSheet({
  visible, day, dayLabel, onClose, onSaved,
}: {
  visible: boolean;
  day: string;
  dayLabel: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { colors, spacing } = useTheme();
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [moreOpen, setMoreOpen] = useState(false);
  // "Implică o cumpărare" -- no new category, just a toggle on the same
  // custom_event: turning it on reveals an amount, which is what makes
  // this event also count as real Expenses spend (see
  // Item::SPENDING_TYPES/SPENDING_TYPE_SPACE's custom_event entry).
  const [involvesPurchase, setInvolvesPurchase] = useState(false);
  const [amount, setAmount] = useState("");
  // Yearly first -- "same day, a year later" (a birthday) is the case
  // this was built for; weekly/monthly project the same way.
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<"weekly" | "monthly" | "yearly">("yearly");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form on every open.
  useEffect(() => {
    if (!visible) return;
    setTitle(""); setTime("09:00"); setMoreOpen(false); setInvolvesPurchase(false); setAmount("");
    setIsRecurring(false); setRecurrence("yearly"); setNotes(""); setError(null);
  }, [visible]);

  const save = async () => {
    if (!title.trim()) {
      setError("Scrie un titlu pentru eveniment.");
      return;
    }
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    const hh = timeMatch ? Math.min(23, Number(timeMatch[1])) : 9;
    const mm = timeMatch ? Math.min(59, Number(timeMatch[2])) : 0;
    // `day` + hh:mm is the device's own LOCAL wall-clock time. The
    // multi-arg Date constructor treats its numbers as local time, so
    // .toISOString() yields the correct UTC instant -- a naive
    // "YYYY-MM-DDTHH:mm:00" string used to be parsed server-side as if
    // it were already UTC and could land on the wrong day.
    const [yy, mo, dd] = day.split("-").map(Number);
    const dueAt = new Date(yy, mo - 1, dd, hh, mm, 0).toISOString();
    const parsedAmount = involvesPurchase ? Number(amount.replace(",", ".")) : NaN;
    const hasAmount = involvesPurchase && Number.isFinite(parsedAmount) && parsedAmount > 0;

    setSaving(true);
    try {
      await api.createItem({
        type: "custom_event",
        title: title.trim(),
        due_at: dueAt,
        notes: notes.trim() || undefined,
        amount: hasAmount ? parsedAmount : undefined,
        currency: hasAmount ? "RON" : undefined,
        recurrence: isRecurring ? recurrence : undefined,
      });
      await onSaved();
    } catch (e: any) {
      notifyAction("Nu am putut salva evenimentul", e?.message || "A apărut o eroare.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Eveniment nou"
      subtitle={dayLabel}
      icon="sparkles-outline"
      tone={CUSTOM_EVENT_COLOR}
      footer={<Button testID="new-event-save" label="Adaugă evenimentul" onPress={save} loading={saving} disabled={!title.trim()} />}
    >
      <Field
        testID="new-event-title"
        label="Ce se întâmplă"
        value={title}
        onChangeText={(t) => { setTitle(t); setError(null); }}
        placeholder="ex. Ziua Anei"
        tone={CUSTOM_EVENT_COLOR}
        error={error}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <Field testID="new-event-time" label="Ora" value={time} onChangeText={setTime} placeholder="09:00" tone={CUSTOM_EVENT_COLOR} keyboardType="numbers-and-punctuation" />

      <Pressable
        testID="new-event-more"
        onPress={() => setMoreOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOpen }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 }}
      >
        <Ionicons name={moreOpen ? "remove" : "add"} size={16} color={colors.onSurfaceTertiary} />
        <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
          {moreOpen ? "Mai puține detalii" : "Mai multe detalii (sumă, repetare, notă)"}
        </Text>
      </Pressable>

      {moreOpen ? (
        <View style={{ gap: spacing.md }}>
          <ToggleRow
            testID="new-event-toggle-purchase"
            icon="cash-outline"
            label="Implică o cumpărare"
            hint="Suma intră la cheltuielile lunii."
            value={involvesPurchase}
            onChange={setInvolvesPurchase}
            tone={CUSTOM_EVENT_COLOR}
          >
            <Field testID="new-event-amount" value={amount} onChangeText={setAmount} placeholder="Sumă aproximativă" keyboardType="decimal-pad" suffix="lei" tone={CUSTOM_EVENT_COLOR} />
          </ToggleRow>
          <ToggleRow
            testID="new-event-toggle-recurring"
            icon="repeat"
            label="Se repetă"
            value={isRecurring}
            onChange={setIsRecurring}
            tone={CUSTOM_EVENT_COLOR}
          >
            <Segmented
              testIDPrefix="new-event-recurrence"
              options={[{ key: "weekly", label: "Săptămânal" }, { key: "monthly", label: "Lunar" }, { key: "yearly", label: "Anual" }]}
              value={recurrence}
              onChange={setRecurrence}
            />
          </ToggleRow>
          <Field testID="new-event-notes" label="Notă" value={notes} onChangeText={setNotes} placeholder="Orice detaliu util" multiline tone={CUSTOM_EVENT_COLOR} />
        </View>
      ) : null}
    </Sheet>
  );
}
