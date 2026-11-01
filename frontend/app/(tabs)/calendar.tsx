import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, DeviceEventEmitter, ActivityIndicator, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "@/lib/refresh";
import { useAppMode } from "@/lib/appMode";
import { SimpleCalendar } from "@/components/simple/SimpleCalendar";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { notifyAction, confirmAction } from "@/lib/confirm";
import { HEAT_LEVELS, heatColor, heatLevel, type HeatLevel } from "@/lib/statusColors";
import { MONTH_STATUS_LABEL, dayCapacity, dayEffort, dayShare, monthStatus } from "@/lib/calendar/capacity";
import { CUSTOM_EVENT_COLOR, spaceColors, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import { DatePickerSheet } from "@/components/ui/DatePickerSheet";
import { MonthSwipeView, useMonthPager } from "@/components/ui/MonthSwipe";
import { CircleButton, InfoButton, Group, Row, IconWell, Pill, Button, Field, FieldButton, ToggleRow, Segmented, EmptyState, Disclosure, hexToRgba } from "@/components/ui/primitives";
import { PressableScale } from "@/components/ui/PressableScale";
import { capitalize, daysFromToday, lei, roCount, roDate, parseLocaleNumber, parseClockTime } from "@/lib/format";
import { SwipeItemRow } from "@/components/dashboard/SwipeItemRow";
import { CreditReminderRow, isReminder } from "@/components/dashboard/CreditReminderRow";
import { GuiltFreeToggle } from "@/components/dashboard/GuiltFree";
import { dueText, expiryText } from "@/components/spaces/home/homeRecordPreview";
import { todoHref, todoTitle } from "@/lib/dashboard/spaceDue";
import { useTourScroll, useTourTarget } from "@/components/ui/tourTargets";
import { useAutoTour } from "@/lib/useAutoTour";
import { SHOW_TOUR_TEST_BUTTON, startTour, type TourCtx } from "@/lib/tours";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { ProfileButton } from "@/components/navigation/ProfileButton";

/*
 * Calendar, 2026-10 redesign (design-lead spec, mockup "orgOS Calendar
 * redesign"; user decisions 2026-10-05):
 *  - "Următoarele 3 luni" (2026-11-01, mockup "Calendar · 3 luni variante",
 *    mini-calendar): three cards, today's month + 2, each the month in
 *    small with every day in its heat shade plus the month's status word
 *    (load against its free time, lib/calendar/capacity.ts); tap one to
 *    jump the grid.
 *  - The month grid: each day tile filled by its heat (the day's effort
 *    over its max capacity, only today/future -- past days never heat), a lime
 *    dot for a custom event, a red dot for a past day still holding
 *    something unresolved. Always 6 rows. Swipe it left/right (or the
 *    chevrons) to change month.
 *  - "De rezolvat azi / pe {zi}": STRICTLY the Space records that fall on
 *    the selected day (no carry-over), the day's own events as lime chips.
 *  - "Evenimente": custom events only, the next 3 months, each once.
 * The old "Plăți recurente în {lună}" list is gone (Buget / Casă own it).
 */

/** Local calendar date, never toISOString() (that reads UTC). */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthKeyOf(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
function addMonths(y: number, m: number, delta: number): [number, number] {
  const t = y * 12 + m + delta;
  return [Math.floor(t / 12), ((t % 12) + 12) % 12];
}

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const FREQUENCY_LABEL: Record<string, string> = { weekly: "săptămânal", monthly: "lunar", yearly: "anual" };

type MonthData = { days: Record<string, any[]>; recurring: any[] };
type IconName = keyof typeof Ionicons.glyphMap;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
}

/** What a Space record is, as an icon. */
function itemIcon(type: string): IconName {
  if (type === "home_recurring") return "repeat";
  if (type === "home_task") return "checkbox-outline";
  if (type === "home_maintenance") return "construct-outline";
  if (type.endsWith("_document")) return "document-text-outline";
  if (type === "car_maintenance") return "car-outline";
  if (type === "car_fuel") return "water-outline";
  if (type === "car_expense") return "card-outline";
  if (type === "expense_item") return "receipt-outline";
  if (type.startsWith("grocery")) return "cart-outline";
  return "ellipse-outline";
}

export default function CalendarRoute() {
  // orgOS Simplu (lib/appMode.tsx): a weekly agenda; "full" = unchanged.
  const { isSimple } = useAppMode();
  return isSimple ? <SimpleCalendar /> : <CalendarScreen />;
}

function CalendarScreen() {
  const { card, colors, spacing, radius, typography, isDark } = useTheme();
  const router = useRouter();
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  // "Today" drives everything date-relative: the strip's 3 months, the
  // months loaded, the heat (today/future only), "Evenimente". The tab
  // stays mounted for days on a phone, so it's re-read on focus, when the
  // app comes back to the foreground and at midnight -- the window then
  // slides on by itself. Same day -> same object (stable memo deps).
  const [today, setToday] = useState(() => new Date());
  const syncToday = useCallback(() => {
    const now = new Date();
    setToday((prev) => (ymd(prev) === ymd(now) ? prev : now));
  }, []);
  const todayKey = ymd(today);
  const [ty, tm] = [today.getFullYear(), today.getMonth()];
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") syncToday();
    });
    return () => sub.remove();
  }, [syncToday]);
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const t = setTimeout(syncToday, nextMidnight.getTime() - now.getTime());
    return () => clearTimeout(t);
  }, [todayKey, syncToday]);

  const [y, setY] = useState(ty);
  const [m, setM] = useState(tm); // 0-11
  const [selected, setSelected] = useState<string>(todayKey);
  // The day rolled over: if the user was on "today", stay on today (its
  // month too); any other picked day stays put.
  const [seenTodayKey, setSeenTodayKey] = useState(todayKey);
  if (seenTodayKey !== todayKey) {
    setSeenTodayKey(todayKey);
    if (selected === seenTodayKey) {
      setSelected(todayKey);
      setY(ty);
      setM(tm);
    }
  }
  const [cache, setCache] = useState<Record<string, MonthData>>({});
  const [newEventVisible, setNewEventVisible] = useState(false);
  const [openEvent, setOpenEvent] = useState<any | null>(null);
  const [eventsExpanded, setEventsExpanded] = useState(false);

  // First-use tour (lib/tours.ts "calendar"): what it points at, and the
  // page's ScrollView so a step can scroll its target into view.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const tourScroll = useTourScroll("calendar", scrollRef);
  const navTarget = useTourTarget("calendar.nav");
  const gridTarget = useTourTarget("calendar.grid");
  const dayTarget = useTourTarget("calendar.day");
  const eventsTarget = useTourTarget("calendar.events");

  /* ---------------- data: today's month + 2 (strip) and the displayed month ± 1 ---------------- */

  const needed = useMemo(() => {
    const keys = new Set<string>();
    [0, 1, 2].forEach((d) => keys.add(monthKeyOf(...addMonths(ty, tm, d))));
    [-1, 0, 1].forEach((d) => keys.add(monthKeyOf(...addMonths(y, m, d))));
    return [...keys];
  }, [ty, tm, y, m]);
  const neededRef = useRef(needed);
  const cacheRef = useRef(cache);
  useEffect(() => {
    neededRef.current = needed;
    cacheRef.current = cache;
  }, [needed, cache]);

  const fetchMonths = useCallback(async (keys: string[], replace = false) => {
    const results = await Promise.all(
      keys.map((k) =>
        api
          .calendar(k)
          .then((r) => [k, { days: r.days || {}, recurring: r.recurring || [] }] as const)
          .catch(() => null),
      ),
    );
    setCache((prev) => {
      const next: Record<string, MonthData> = replace ? {} : { ...prev };
      results.forEach((r) => {
        if (r) next[r[0]] = r[1];
      });
      return next;
    });
  }, []);

  useEffect(() => {
    const missing = needed.filter((k) => !cache[k]);
    if (missing.length) fetchMonths(missing);
    // Only when the set of needed months changes, not on every cache write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed, fetchMonths]);

  // A refresh refetches every month still on screen and drops the rest.
  const refresh = useCallback(() => fetchMonths(neededRef.current, true), [fetchMonths]);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => refresh());
    return () => sub.remove();
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      syncToday();
      refresh();
    }, [syncToday, refresh]),
  );

  const allDays = useMemo(() => Object.assign({}, ...Object.values(cache).map((c) => c.days)) as Record<string, any[]>, [cache]);
  // Only the occurrence that's due NOW (the server's currentDue -- unpaid,
  // or the next one) can be resolved; later projections can't be paid ahead.
  const currentDueKeys = useMemo(() => {
    const keys = new Set<string>();
    Object.values(cache).forEach((c) => c.recurring.forEach((it: any) => keys.add(`${it.id}|${ymd(new Date(it.due_at))}`)));
    return keys;
  }, [cache]);
  const isCurrentDue = (it: any) => currentDueKeys.has(`${it.id}|${ymd(new Date(it.due_at))}`);
  // A credit reminder (`reminder: true`) is never resolvable nor restant.
  const isUnresolved = (it: any) => !!it.space && !isReminder(it) && (!it.is_projected || isCurrentDue(it));
  // A day's heat: its effort as a share of that day's max capacity
  // (lib/calendar/capacity.ts), today/future only.
  const loadOf = (key: string, date: Date) => (key >= todayKey ? dayShare(allDays[key], date) : 0);

  // "Următoarele 3 luni": each month's fill = all its effort / the sum of
  // its days' MAX capacity (the status word), plus every day's own heat
  // shade -- the same `loadOf` the big grid uses, so a mini month is that
  // grid in small (past days stay blank, like there).
  const monthLoads = useMemo(
    () =>
      [0, 1, 2].map((delta) => {
        const [yy, mm] = addMonths(ty, tm, delta);
        const mk = monthKeyOf(yy, mm);
        const data = cache[mk];
        let effort = 0;
        let capacity = 0;
        const levels: HeatLevel[] = [];
        for (let day = 1; day <= new Date(yy, mm + 1, 0).getDate(); day++) {
          const date = new Date(yy, mm, day);
          const key = ymd(date);
          capacity += dayCapacity(date).max;
          effort += dayEffort(data?.days[key], date);
          levels.push(data && key >= todayKey ? heatLevel(dayShare(data.days[key], date)) : 0);
        }
        return { key: mk, y: yy, m: mm, loaded: !!data, fill: capacity ? effort / capacity : 0, future: delta > 0, levels };
      }),
    [cache, ty, tm, todayKey],
  );
  const loading = !cache[monthKeyOf(y, m)];

  // Nothing of the Calendar's own reads the context yet.
  const tourCtx: TourCtx = {};
  useAutoTour("calendar", { ready: !loading && !newEventVisible && !openEvent, ctx: tourCtx });

  /* ---------------- month navigation (chevrons, swipe, "Azi", strip) ---------------- */

  const defaultSelection = (yy: number, mm: number) => {
    if (yy === ty && mm === tm) return todayKey;
    const prefix = monthKeyOf(yy, mm);
    const firstLoaded = Object.keys(allDays)
      .filter((k) => k.startsWith(prefix) && (allDays[k] ?? []).length > 0)
      .sort()[0];
    return firstLoaded ?? `${prefix}-01`;
  };

  const pager = useMonthPager();

  const goToMonth = (yy: number, mm: number, selectKey?: string) => {
    const delta = yy * 12 + mm - (y * 12 + m);
    if (delta === 0) {
      if (selectKey) setSelected(selectKey);
      return;
    }
    pager.slide(delta > 0 ? 1 : -1, () => {
      setY(yy);
      setM(mm);
      setSelected(selectKey ?? defaultSelection(yy, mm));
    });
  };
  const changeMonth = (delta: number) => goToMonth(...addMonths(y, m, delta));

  // ?date= deep link (TodoCarouselSheet): that day's month, that day.
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

  /* ---------------- grid ---------------- */

  const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: 42 }, (_, i) => {
    const d = i - firstWeekday + 1;
    return d >= 1 && d <= daysInMonth ? d : null;
  });
  const monthName = capitalize(new Date(y, m, 1).toLocaleDateString("ro-RO", { month: "long", ...(y !== ty ? { year: "numeric" as const } : {}) }));

  /* ---------------- selected day ---------------- */

  const [selY, selM, selD] = selected.split("-").map(Number);
  const parsedSelected = new Date(selY, selM - 1, selD);
  // A bad key (never expected) falls back to today instead of crashing the screen.
  const selectedDate = Number.isNaN(parsedSelected.getTime()) ? today : parsedSelected;
  const selDiff = daysFromToday(selectedDate.toISOString());
  const weekday = capitalize(selectedDate.toLocaleDateString("ro-RO", { weekday: "long" }));
  const dayCaption =
    selected === todayKey
      ? capitalize(selectedDate.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }))
      : selDiff === 1
        ? `${weekday}, mâine`
        : selDiff === -1
          ? `${weekday}, ieri`
          : selDiff > 0
            ? `${weekday}, peste ${roCount(selDiff, "zi", "zile")}`
            : `${weekday}, acum ${roCount(-selDiff, "zi", "zile")}`;
  const dayItems = useMemo(
    () => [...(allDays[selected] || [])].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()),
    [allDays, selected],
  );
  // Credit instalments are reminders only: listed apart ("Mementouri"),
  // never swiped, never counted as something to resolve.
  const dayRecords = dayItems.filter((it) => !!it.space && !isReminder(it));
  const dayReminders = dayItems.filter((it) => !!it.space && isReminder(it));
  const dayEvents = dayItems.filter((it) => !it.space);

  /* ---------------- events: next 3 months, each once ---------------- */

  const windowEnd = ymd(new Date(ty, tm + 3, 0));
  const upcomingEvents = useMemo(() => {
    const seen = new Map<string, any>();
    Object.keys(allDays)
      .filter((k) => k >= todayKey && k <= windowEnd)
      .sort()
      .forEach((k) =>
        (allDays[k] ?? []).forEach((it: any) => {
          if (it.space) return;
          const id = String(it.id);
          if (!seen.has(id)) seen.set(id, it);
        }),
      );
    return [...seen.values()].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  }, [allDays, todayKey, windowEnd]);
  const shownEvents = eventsExpanded ? upcomingEvents : upcomingEvents.slice(0, 5);

  /* ---------------- actions ---------------- */

  const refreshAll = () => {
    DeviceEventEmitter.emit(REFRESH_EVENT);
    refresh();
  };

  const openItem = (item: any) => {
    if (item.space) {
      // Lands on the sub-view where this record is resolved, not just the Space root.
      router.navigate(todoHref(item) as any);
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
      refreshAll();
    } catch (error: any) {
      notifyAction("Nu am putut șterge evenimentul", error?.message || "A apărut o eroare.");
    }
  };

  /* ---------------- render ---------------- */

  const muted = colors.onSurfaceTertiary;
  // The event dot in the event's TEXT shade: the lime fill is too light
  // for a 5px mark on the light theme's white card (2:1).
  const eventDot = spaceTextColor("custom", isDark) ?? CUSTOM_EVENT_COLOR;
  const recordTiming = (it: any): { text: string; tone: "error" | "warning" | "muted" } | null => {
    const d = daysFromToday(it.due_at);
    if (d < 0 && !isUnresolved(it)) return null; // a past occurrence already dealt with
    return it.type?.endsWith("_document") ? expiryText(d) : dueText(d);
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="calendar-screen">
      <ScreenBackground />
      <ScrollView ref={scrollRef} {...tourScroll} contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 140, gap: spacing.section }}>
        {/* Tour step 1: the month title + arrows and the 3 month cards. */}
        <View {...navTarget} style={{ gap: spacing.section }}>
          {/* Acasă's header shape (small label over a title that may shrink),
              so the profile circle fits on the same row as Azi + ‹ ›. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 13, color: muted }}>Calendar</Text>
                <InfoButton topic="calendar.page" />
              </View>
              <Text style={{ ...typography.title, color: colors.onSurface }} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {monthName}
              </Text>
            </View>
            {selected !== todayKey ? (
              <Pill testID="cal-today" label="Azi" onPress={() => goToMonth(ty, tm, todayKey)} />
            ) : null}
            <CircleButton testID="cal-prev-month" icon="chevron-back" label="Luna trecută" onPress={() => changeMonth(-1)} />
            <CircleButton testID="cal-next-month" icon="chevron-forward" label="Luna viitoare" onPress={() => changeMonth(1)} />
            <ProfileButton testID="calendar-profile" />
          </View>

          {SHOW_TOUR_TEST_BUTTON ? (
            // TEMP for testing -- see SHOW_TOUR_TEST_BUTTON (lib/tours.ts).
            <View style={{ flexDirection: "row", marginTop: -spacing.md }}>
              <Pill testID="calendar-tour-test" icon="play-circle-outline" label="Pornește ghidul" onPress={() => startTour("calendar", tourCtx)} />
            </View>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>Următoarele 3 luni</Text>
              <InfoButton topic="calendar.heat" />
            </View>
            <View testID="cal-months" style={{ flexDirection: "row", gap: spacing.sm }}>
              {monthLoads.map((mo) => (
                <MonthMiniCard
                  key={mo.key}
                  y={mo.y}
                  m={mo.m}
                  fill={mo.fill}
                  loaded={mo.loaded}
                  future={mo.future}
                  levels={mo.levels}
                  todayDay={mo.key === monthKeyOf(ty, tm) ? today.getDate() : null}
                  selected={mo.key === monthKeyOf(y, m)}
                  onPress={() => goToMonth(mo.y, mo.m)}
                />
              ))}
            </View>
          </View>
        </View>

        {/* THE MONTH -- swipe it left/right (pan on this card only: the
            rows below already swipe sideways). */}
        <View {...gridTarget}>
          <MonthSwipeView
            pager={pager}
            onSwipe={changeMonth}
            style={{ ...card, borderRadius: radius.card, paddingVertical: spacing.md, paddingHorizontal: 10 }}
            after={
              <>
                {/* Legend -- one row on a phone (user, 2026-10-05): strictly the
                    8 shades (no "Liber" label, no empty swatch), tight (2px
                    apart, 10px); it only wraps on a very narrow screen. */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", rowGap: 6, paddingTop: 10, paddingHorizontal: spacing.xs }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                      {HEAT_LEVELS.filter((l) => l > 0).map((l) => (
                        <View key={l} style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: heatColor(l, isDark) }} />
                      ))}
                    </View>
                    <Text style={{ fontSize: 12, color: muted }}>Aglomerat</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: eventDot }} />
                      <Text style={{ fontSize: 12, color: muted }}>Eveniment</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.error }} />
                      <Text style={{ fontSize: 12, color: muted }}>Restant</Text>
                    </View>
                  </View>
                </View>
              </>
            }
          >
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`Calendar, ${monthName}`}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(e) => changeMonth(e.nativeEvent.actionName === "increment" ? 1 : -1)}
            >
              <View style={{ flexDirection: "row", paddingBottom: 6 }}>
                {WEEKDAYS.map((d, i) => (
                  <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 12, color: muted }}>{d}</Text>
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {cells.map((d, i) => {
                  if (d == null) return <View key={`x-${i}`} style={{ width: `${100 / 7}%`, height: 50 }} />;
                  const key = `${monthKeyOf(y, m)}-${String(d).padStart(2, "0")}`;
                  const items = allDays[key] ?? [];
                  const past = key < todayKey;
                  const level = heatLevel(loadOf(key, new Date(y, m, d)));
                  const hasEvent = items.some((it) => !it.space);
                  const lateMark = past && items.some(isUnresolved);
                  const isSelected = key === selected;
                  const isToday = key === todayKey;
                  const spaceCount = items.filter((it) => it.space && !isReminder(it)).length;
                  const reminderCount = items.filter((it) => it.space && isReminder(it)).length;
                  const label = [
                    capitalize(new Date(y, m, d).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" })),
                    spaceCount ? roCount(spaceCount, "lucru", "lucruri") : null,
                    reminderCount ? roCount(reminderCount, "rată", "rate") : null,
                    hasEvent ? "eveniment" : null,
                    lateMark ? "restant" : null,
                  ].filter(Boolean).join(", ");
                  return (
                    <Pressable
                      key={key}
                      testID={`cal-day-${key}`}
                      onPress={() => setSelected(key)}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: isSelected }}
                      style={{ width: `${100 / 7}%`, height: 50, alignItems: "center", justifyContent: "center", gap: 3 }}
                    >
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: heatColor(level, isDark),
                          borderWidth: isSelected ? 2 : isToday ? 1.5 : 0,
                          borderColor: isSelected ? colors.onSurface : colors.onSurfaceTertiary,
                        }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: isSelected || isToday ? "600" : "400", color: past ? muted : colors.onSurface }}>{d}</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 3, height: 5 }}>
                        {hasEvent ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: eventDot }} /> : null}
                        {lateMark ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.error }} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </MonthSwipeView>
        </View>

        {/* DE REZOLVAT -- strictly what falls on the selected day. */}
        <View {...dayTarget} style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface, flexShrink: 1 }} numberOfLines={1}>
                  {selected === todayKey ? "De rezolvat azi" : `De rezolvat pe ${roDate(selectedDate)}`}
                </Text>
                <InfoButton topic="calendar.day" />
              </View>
              <Text style={{ fontSize: 13, color: muted }}>{dayCaption}</Text>
            </View>
            {dayRecords.length > 0 ? <Text style={{ fontSize: 13, color: muted }}>{dayRecords.length}</Text> : null}
          </View>

          {dayEvents.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {dayEvents.map((ev) => (
                <PressableScale
                  key={`${ev.id}-${ev.due_at}`}
                  testID={`cal-day-event-${ev.id}`}
                  onPress={() => setOpenEvent(ev)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Eveniment: ${ev.title}, ${timeLabel(ev.due_at)}`}
                  style={{ height: 32, paddingHorizontal: spacing.md, borderRadius: 16, backgroundColor: hexToRgba(CUSTOM_EVENT_COLOR, 0.16), flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Ionicons name="sparkles-outline" size={15} color={spaceTextColor("custom", isDark) ?? CUSTOM_EVENT_COLOR} />
                  <Text style={{ fontSize: 13, fontWeight: "500", color: spaceTextColor("custom", isDark) ?? CUSTOM_EVENT_COLOR }} numberOfLines={1}>
                    {ev.title} · {timeLabel(ev.due_at)}
                  </Text>
                </PressableScale>
              ))}
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={muted} />
          ) : dayRecords.length === 0 ? (
            <View style={{ ...card, borderRadius: radius.card, paddingVertical: 18, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
              <Text style={{ flexShrink: 1, fontSize: 14, color: colors.onSurfaceSecondary }}>
                {selected === todayKey ? "Nimic de rezolvat azi." : "Nimic de rezolvat în ziua asta."}
              </Text>
            </View>
          ) : (
            <Group inset={68}>
              {dayRecords.map((it: any) => {
                // That record's own space colour (its pick, else its kind's).
                const own = spaceColors(it.space, isDark);
                const fill = own?.color ?? muted;
                const timing = recordTiming(it);
                const timingColor = timing?.tone === "error" ? colors.error : timing?.tone === "warning" ? colors.warning : muted;
                const amount = it.amount != null && Number(it.amount) > 0 ? Number(it.amount) : null;
                return (
                  <SwipeItemRow key={`${it.id}-${it.due_at}`} item={it} onChanged={refreshAll} canResolve={isUnresolved(it)}>
                    <Row
                      testID={`agenda-item-${it.id}`}
                      onPress={() => openItem(it)}
                      leading={<IconWell icon={itemIcon(it.type)} color={fill} tint={own?.tint ?? fill} />}
                      title={todoTitle(it)}
                      subtitle={
                        <>
                          {timing ? (
                            <Text style={{ color: timingColor, fontWeight: timing.tone === "warning" ? "500" : "400" }}>
                              {timing.tone === "error" ? <Ionicons name="alert-circle" size={12} color={colors.error} /> : null}
                              {timing.tone === "error" ? " " : ""}
                              {timing.text}
                            </Text>
                          ) : null}
                          {timing ? " · " : ""}
                          {it.space.name}
                        </>
                      }
                      trailing={amount ? <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurfaceSecondary }}>{lei(amount)}</Text> : null}
                    />
                  </SwipeItemRow>
                );
              })}
            </Group>
          )}

          {!loading && dayReminders.length > 0 ? (
            <View style={{ gap: spacing.sm }} testID="cal-day-reminders">
              <Text style={{ fontSize: 13, fontWeight: "500", color: muted }}>Mementouri</Text>
              <Group inset={68}>
                {dayReminders.map((it: any) => (
                  <CreditReminderRow key={`${it.id}-${it.due_at}`} item={it} testID={`agenda-reminder-${it.id}`} />
                ))}
              </Group>
            </View>
          ) : null}
        </View>

        {/* EVENIMENTE -- the user's own events, next 3 months, each once. */}
        <View style={{ gap: spacing.md }}>
          <View {...eventsTarget} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }}>Evenimente</Text>
                <InfoButton topic="calendar.event" />
              </View>
              <Text style={{ fontSize: 13, color: muted }}>Următoarele 3 luni</Text>
            </View>
            <Pill testID="new-event-open" label="Eveniment" icon="add" active tone={CUSTOM_EVENT_COLOR} onPress={() => setNewEventVisible(true)} />
          </View>

          {upcomingEvents.length === 0 ? (
            <View style={{ ...card, borderRadius: radius.card }}>
              <EmptyState icon="sparkles-outline" message="Niciun eveniment în următoarele 3 luni." />
            </View>
          ) : (
            <Group inset={68}>
              {shownEvents.map((ev: any) => {
                const d = daysFromToday(ev.due_at);
                const amount = ev.amount != null && Number(ev.amount) > 0 ? Number(ev.amount) : null;
                const when = capitalize(new Date(ev.due_at).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }));
                return (
                  <SwipeItemRow key={`${ev.id}-${ev.due_at}`} item={ev} onChanged={refreshAll}>
                    <Row
                      testID={`event-item-${ev.id}`}
                      onPress={() => setOpenEvent(ev)}
                      leading={<IconWell icon="sparkles-outline" color={CUSTOM_EVENT_COLOR} tint={spaceTextColor("custom", isDark) ?? CUSTOM_EVENT_COLOR} />}
                      title={ev.title}
                      subtitle={`${when}, ${timeLabel(ev.due_at)}${ev.recurrence ? ` · ${FREQUENCY_LABEL[ev.recurrence] ?? ev.recurrence}` : ""}`}
                      trailing={
                        <Text style={{ fontSize: amount ? 14 : 13, fontWeight: amount ? "500" : "400", color: amount ? colors.onSurfaceSecondary : muted }}>
                          {amount ? lei(amount) : d === 0 ? "azi" : d === 1 ? "mâine" : `peste ${roCount(d, "zi", "zile")}`}
                        </Text>
                      }
                    />
                  </SwipeItemRow>
                );
              })}
            </Group>
          )}
          {upcomingEvents.length > 5 ? (
            <PressableScale
              testID="cal-events-all"
              onPress={() => setEventsExpanded((v) => !v)}
              scaleTo={1}
              pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
              accessibilityRole="button"
              accessibilityState={{ expanded: eventsExpanded }}
              style={{ minHeight: 52, borderRadius: radius.card, paddingHorizontal: spacing.lg, ...card, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
            >
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{eventsExpanded ? "Arată mai puțin" : "Toate evenimentele"}</Text>
              {!eventsExpanded ? <Text style={{ fontSize: 14, color: muted }}>+{upcomingEvents.length - 5}</Text> : null}
              <Ionicons name={eventsExpanded ? "chevron-up" : "chevron-down"} size={16} color={muted} />
            </PressableScale>
          ) : null}
        </View>
      </ScrollView>

      <NewEventSheet
        visible={newEventVisible}
        day={selected}
        onClose={() => setNewEventVisible(false)}
        onSaved={async () => {
          // No jump to the event's day after saving (user, 2026-10-05).
          setNewEventVisible(false);
          refreshAll();
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
          <Button testID="event-delete" variant="ghost" icon="trash-outline" label="Șterge evenimentul" onPress={() => deleteCustomEvent(openEvent)} />
        ) : null}
      >
        {openEvent ? (
          <Group>
            {openEvent.recurrence ? <Row title="Se repetă" trailing={<Text style={{ fontSize: 15, color: muted }}>{FREQUENCY_LABEL[openEvent.recurrence] ?? openEvent.recurrence}</Text>} /> : null}
            {openEvent.amount != null && Number(openEvent.amount) > 0 ? <Row title="Sumă" trailing={<Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Number(openEvent.amount))}</Text>} /> : null}
            {openEvent.guilt_free ? <Row title="Bani fără vină" trailing={<Ionicons name="heart-outline" size={18} color={muted} />} /> : null}
            <Row title="Notă" subtitle={openEvent.notes || "Fără notă"} />
          </Group>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

const MINI_GAP = 2; // between the mini month's day cells

/**
 * One "Următoarele 3 luni" card (mockup "Calendar · 3 luni variante",
 * mini-calendar, user pick 2026-11-01): the month in small -- one cell per
 * day, Monday first, tinted with the big grid's own heat shades (lib/
 * statusColors heatLevel/heatColor = the day's effort / its max capacity),
 * so you see both how full the month is and WHEN. Days with nothing (and
 * past days) are only an outline, today gets an onSurface ring.
 * Under the grid the month's status word (effort / the sum of its days'
 * max capacity; "≈ " on future months: estimates; error red when over).
 * Tap = jump the big grid there; the displayed month gets a 2px onSurface
 * border. No animation.
 */
function MonthMiniCard({
  y,
  m,
  fill,
  loaded,
  future,
  levels,
  todayDay,
  selected,
  onPress,
}: {
  y: number;
  m: number;
  fill: number;
  loaded: boolean;
  future: boolean;
  /** One heat level per day of the month (index 0 = the 1st). */
  levels: HeatLevel[];
  /** Today's day number when this is today's month, else null. */
  todayDay: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { card, colors, radius, spacing, isDark } = useTheme();
  const status = monthStatus(fill);

  const first = new Date(y, m, 1);
  const short = capitalize(first.toLocaleDateString("ro-RO", { month: "short" }).replace(".", ""));
  const long = `${capitalize(first.toLocaleDateString("ro-RO", { month: "long" }))} ${y}`;
  const label = MONTH_STATUS_LABEL[status];
  const statusText = !loaded ? "…" : future ? `≈ ${label}` : label;
  const a11y = !loaded ? `${long}: se încarcă` : `${long}: ${future ? "estimare: " : ""}${label.toLowerCase()}`;

  // Monday-first weeks, padded with nulls before the 1st and after the last day.
  const offset = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(offset).fill(null), ...levels.map((_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <PressableScale
      testID={`cal-month-${monthKeyOf(y, m)}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected }}
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: radius.card,
        ...card,
        borderWidth: 2,
        borderColor: selected ? colors.onSurface : "transparent",
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
        {short}
      </Text>
      <View style={{ gap: MINI_GAP }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {weeks.map((week, w) => (
          <View key={w} style={{ flexDirection: "row", gap: MINI_GAP }}>
            {week.map((day, i) => {
              const level = day != null && loaded ? levels[day - 1] : 0;
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 3,
                    // An empty day is only an outline, like the big grid's
                    // transparent level 0: a filled grey cell read darker than
                    // the lightest heat shades in the light themes.
                    backgroundColor: day != null && level > 0 ? heatColor(level, isDark) : "transparent",
                    borderWidth: day == null ? 0 : day === todayDay ? 1.5 : level > 0 ? 0 : 1,
                    borderColor: day === todayDay ? colors.onSurface : colors.borderStrong,
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
      {/* "≈ Prea plină" is the longest: let it shrink a little on a 360dp
          phone instead of being cut. */}
      <Text
        style={{ marginTop: "auto", fontSize: 12, lineHeight: 15, fontWeight: status === "over" && loaded ? "500" : "400", color: status === "over" && loaded ? colors.error : colors.onSurfaceTertiary }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {statusText}
      </Text>
    </PressableScale>
  );
}
/**
 * Add a custom event. Title, then Data + Ora side by side (the date
 * starts on the selected day and can be changed); the purchase amount,
 * repeat and note live under "Mai multe detalii".
 */
function NewEventSheet({
  visible, day, onClose, onSaved,
}: {
  visible: boolean;
  day: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { spacing } = useTheme();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(day);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [time, setTime] = useState("09:00");
  const [moreOpen, setMoreOpen] = useState(false);
  // "Implică o cumpărare" -- the amount makes this event count as real
  // Expenses spend (Item::SPENDING_TYPES' custom_event entry).
  const [involvesPurchase, setInvolvesPurchase] = useState(false);
  const [amount, setAmount] = useState("");
  // "Bani fără vină" (items.guilt_free) -- only meaningful with a purchase.
  const [guiltFree, setGuiltFree] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<"weekly" | "monthly" | "yearly">("yearly");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form on every open, dated on the selected day.
  const [seenOpen, setSeenOpen] = useState(false);
  if (visible !== seenOpen) {
    setSeenOpen(visible);
    if (visible) {
      setTitle(""); setDate(day); setDatePickerVisible(false); setTime("09:00"); setMoreOpen(false); setInvolvesPurchase(false); setAmount(""); setGuiltFree(false);
      setIsRecurring(false); setRecurrence("yearly"); setNotes(""); setError(null);
    }
  }

  const [dy, dmo, dd] = date.split("-").map(Number);
  const dateObj = new Date(dy, dmo - 1, dd);

  const save = async () => {
    if (!title.trim()) {
      setError("Scrie un titlu pentru eveniment.");
      return;
    }
    const clock = parseClockTime(time);
    if (!clock) {
      setError("Ora nu e validă. Scrie-o ca 14:30.");
      return;
    }
    const { hh, mm } = clock;
    // Local wall-clock time -> the right UTC instant (a naive string used
    // to be read server-side as UTC and could land on the wrong day).
    const dueAt = new Date(dy, dmo - 1, dd, hh, mm, 0).toISOString();
    const parsedAmount = involvesPurchase ? parseLocaleNumber(amount) : NaN;
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
        guilt_free: hasAmount ? guiltFree : false,
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
      info="calendar.event"
      icon="sparkles-outline"
      tone={CUSTOM_EVENT_COLOR}
      footer={<Button testID="new-event-save" label="Adaugă evenimentul" tone={CUSTOM_EVENT_COLOR} onPress={save} loading={saving} disabled={!title.trim()} />}
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
      <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-end" }}>
        <View style={{ flex: 1.45 }}>
          <FieldButton testID="new-event-date" label="Data" value={roDate(dateObj, { withYear: true })} onPress={() => setDatePickerVisible(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Field testID="new-event-time" label="Ora" value={time} onChangeText={setTime} placeholder="09:00" tone={CUSTOM_EVENT_COLOR} keyboardType="numbers-and-punctuation" />
        </View>
      </View>

      <Disclosure testID="new-event-more" label="Mai multe detalii (sumă, repetare, notă)" open={moreOpen} onToggle={() => setMoreOpen((v) => !v)} />

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
          {involvesPurchase ? (
            <GuiltFreeToggle testID="new-event-guilt-free" value={guiltFree} onChange={setGuiltFree} tone={CUSTOM_EVENT_COLOR} />
          ) : null}
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

      {/* Nested inside the form sheet (a sibling Modal can fail to show on iOS). */}
      {datePickerVisible ? (
        <DatePickerSheet
          value={dateObj.toISOString()}
          range="any"
          title="Data evenimentului"
          onCancel={() => setDatePickerVisible(false)}
          onSelect={(iso) => {
            if (iso) setDate(ymd(new Date(iso)));
            setDatePickerVisible(false);
          }}
        />
      ) : null}
    </Sheet>
  );
}
