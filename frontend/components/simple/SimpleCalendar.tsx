import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator, AppState, DeviceEventEmitter } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "@/app/(tabs)/_layout";
import { notifyAction } from "@/lib/confirm";
import { capitalize, lei } from "@/lib/format";
import { CUSTOM_EVENT_COLOR, spaceColors } from "@/lib/spaces/spaceProfile";
import { heatColor, type HeatLevel } from "@/lib/statusColors";
import { dayCapacity, dayEffort, monthStatus } from "@/lib/calendar/capacity";
import { overdueKmLabel, todoHref, todoTitle } from "@/lib/dashboard/spaceDue";
import { isReminder } from "@/components/dashboard/CreditReminderRow";
import { SwipeItemRow } from "@/components/dashboard/SwipeItemRow";
import { canSwipeResolve, resolveFromSummary } from "@/lib/dashboard/itemActions";
import { MonthSwipeView, useMonthPager } from "@/components/ui/MonthSwipe";
import { CircleButton } from "@/components/ui/primitives";
import { SimpleNewEventSheet } from "@/components/simple/NewEventSheet";
import { canEditRecord } from "@/components/simple/EditRecordSheet";
import { openEditRecord } from "@/lib/simpleSheets";
import { PressableScale } from "@/components/ui/PressableScale";
import { TeaserCard } from "@/components/simple/Teaser";
import { ScreenBackground } from "@/components/ui/ScreenBackground";

/*
 * orgOS Simplu -- Calendar (mockup "Calendar A · Lună + ziua aleasă").
 * Same /calendar endpoint as the full Calendar (app/(tabs)/calendar.tsx),
 * open items only. The month grid (always 6 rows, Monday first; a dot per
 * space colour / lime for an event, ONE red dot on a past day still
 * unresolved; swipe, chevrons, "Azi") -> the selected day's records ->
 * "Restante" (every past day still unresolved, only when there are any).
 * No heat map / month bubbles here: that's the Complet teaser.
 * Months fetched: the previous one (so a restant from the end of last month
 * doesn't vanish on the 1st), today's and the next 2 (the teaser's 3 real
 * month loads), plus the displayed month +- 1 (its leading / trailing days
 * and the next swipe).
 *
 * "Today" is re-read on focus / app foreground / midnight -- the tab stays
 * mounted for days. ymd/monthKeyOf/addMonths are local copies of the
 * module-private helpers in app/(tabs)/calendar.tsx.
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
/** Short Romanian weekday, Sunday = 0 (JS getDay). */
const DOW = ["dum", "lun", "mar", "mie", "joi", "vin", "sâm"];
/** Grid header, Monday first. */
const WEEK_HEADER = ["L", "M", "M", "J", "V", "S", "D"];
/** Most dots under one day. */
const MAX_DOTS = 3;

type MonthData = { days: Record<string, any[]>; recurring: any[] };
type AgendaRow = { key: string; dayKey: string; date: Date; item: any };

export function SimpleCalendar() {
  const { card, colors, spacing, radius, typography, isDark } = useTheme();
  const router = useRouter();

  /* ---------------- today (re-read on focus / foreground / midnight) ---------------- */

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

  /* ---------------- data ---------------- */

  // The displayed month and the selected day (both start on today).
  const [[vy, vm], setView] = useState<[number, number]>(() => [today.getFullYear(), today.getMonth()]);
  const [selected, setSelected] = useState(() => ymd(today));

  const needed = useMemo(() => {
    const keys = new Set([-1, 0, 1, 2].map((d) => monthKeyOf(...addMonths(ty, tm, d))));
    [-1, 0, 1].forEach((d) => keys.add(monthKeyOf(...addMonths(vy, vm, d))));
    return [...keys].sort();
  }, [ty, tm, vy, vm]);
  const neededRef = useRef(needed);
  useEffect(() => {
    neededRef.current = needed;
  }, [needed]);

  const [cache, setCache] = useState<Record<string, MonthData>>({});
  const cacheRef = useRef(cache);
  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const keys = neededRef.current;
    const results = await Promise.all(
      keys.map((k) =>
        api
          .calendar(k)
          .then((r: any) => [k, { days: r?.days || {}, recurring: r?.recurring || [] }] as const)
          .catch(() => null),
      ),
    );
    if (seq !== loadSeq.current) return; // a newer load is on its way
    const next: Record<string, MonthData> = {};
    results.forEach((r) => {
      if (r) next[r[0]] = r[1];
    });
    setCache(next);
    setFailed(results.every((r) => r == null));
    setLoaded(true);
  }, []);

  // The set of months changed (another month displayed, or a new month
  // started) -> fetch only the ones not cached yet. The first load comes
  // from the focus effect below.
  const neededKey = needed.join(",");
  const firstNeeded = useRef(neededKey);
  useEffect(() => {
    if (neededKey === firstNeeded.current) return;
    firstNeeded.current = neededKey;
    const missing = neededKey.split(",").filter((k) => !cacheRef.current[k]);
    if (missing.length === 0) return;
    const seq = loadSeq.current;
    Promise.all(
      missing.map((k) =>
        api
          .calendar(k)
          .then((r: any) => [k, { days: r?.days || {}, recurring: r?.recurring || [] }] as const)
          .catch(() => null),
      ),
    ).then((results) => {
      if (seq !== loadSeq.current) return; // a full load replaced the cache meanwhile
      setCache((prev) => {
        const next = { ...prev };
        results.forEach((r) => {
          if (r) next[r[0]] = r[1];
        });
        return next;
      });
    });
  }, [neededKey]);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => load());
    return () => sub.remove();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      syncToday();
      load();
    }, [syncToday, load]),
  );

  const onPullRefresh = async () => {
    setRefreshing(true);
    syncToday();
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const refreshAll = () => {
    DeviceEventEmitter.emit(REFRESH_EVENT); // our own listener reloads too
  };

  /* ---------------- shaping ---------------- */

  // Same rule as the full Calendar: only the occurrence that's due NOW
  // (the server's `recurring` = currentDue) can be resolved; later
  // projections can't be paid ahead. A credit reminder never resolves.
  const currentDueKeys = useMemo(() => {
    const keys = new Set<string>();
    Object.values(cache).forEach((c) => c.recurring.forEach((it: any) => keys.add(`${it.id}|${ymd(new Date(it.due_at))}`)));
    return keys;
  }, [cache]);
  const isUnresolved = useCallback(
    (it: any) => !!it.space && !isReminder(it) && (!it.is_projected || currentDueKeys.has(`${it.id}|${ymd(new Date(it.due_at))}`)),
    [currentDueKeys],
  );

  const allDays = useMemo<Record<string, any[]>>(() => Object.assign({}, ...Object.values(cache).map((c) => c.days)), [cache]);

  const sortedDay = useCallback(
    (dayKey: string) => [...(allDays[dayKey] ?? [])].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime()),
    [allDays],
  );

  const fallbackDot = colors.onSurfaceTertiary;
  const dotColor = useCallback(
    (it: any): string => (it.space ? (spaceColors(it.space, isDark)?.color ?? fallbackDot) : CUSTOM_EVENT_COLOR),
    [isDark, fallbackDot],
  );

  // The 42 cells of the displayed month (6 rows, Monday first).
  const cells = useMemo(() => {
    const offset = (new Date(vy, vm, 1).getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(vy, vm, 1 - offset + i);
      const dayKey = ymd(date);
      const items = allDays[dayKey] ?? [];
      const past = dayKey < todayKey;
      // A past day only says "still unresolved"; today / future show what's on.
      const unresolved = past ? items.filter(isUnresolved).length : 0;
      const dots: string[] = past ? [] : [...new Set(items.map(dotColor))].slice(0, MAX_DOTS);
      return { date, dayKey, inMonth: date.getMonth() === vm, past, late: unresolved > 0, dots, count: past ? unresolved : items.length };
    });
  }, [vy, vm, allDays, todayKey, isUnresolved, dotColor]);

  // Legend = only what the displayed month actually shows.
  const errorColor = colors.error;
  const legend = useMemo(() => {
    const out = new Map<string, { label: string; color: string }>();
    cells.forEach((c) => {
      if (!c.inMonth) return;
      if (c.late) out.set("late", { label: "Restant", color: errorColor });
      if (c.past) return;
      (allDays[c.dayKey] ?? []).forEach((it: any) => {
        if (it.space) out.set(`s${it.space.id}`, { label: it.space.name ?? "Spațiu", color: dotColor(it) });
        else out.set("event", { label: "Eveniment", color: CUSTOM_EVENT_COLOR });
      });
    });
    return [...out.entries()].map(([key, v]) => ({ key, ...v }));
  }, [cells, allDays, dotColor, errorColor]);

  const selectedDate = useMemo(() => {
    const [yy, mm, dd] = selected.split("-").map(Number);
    return new Date(yy, mm - 1, dd);
  }, [selected]);

  // The selected day: a past day lists only what's still unresolved.
  const dayRows = useMemo<AgendaRow[]>(
    () =>
      sortedDay(selected)
        .filter((item) => selected >= todayKey || isUnresolved(item))
        .map((item) => ({ key: `${item.id}-${item.due_at}`, dayKey: selected, date: selectedDate, item })),
    [selected, selectedDate, sortedDay, todayKey, isUnresolved],
  );

  // "Restante": every past day still unresolved, except the selected day
  // (already listed above).
  const overdue = useMemo<AgendaRow[]>(() => {
    const rows: AgendaRow[] = [];
    const seen = new Set<string>();
    Object.keys(allDays)
      .sort()
      .forEach((dayKey) => {
        if (dayKey >= todayKey || dayKey === selected) return;
        const [yy, mm, dd] = dayKey.split("-").map(Number);
        const date = new Date(yy, mm - 1, dd);
        sortedDay(dayKey).forEach((item) => {
          const key = `${item.id}-${item.due_at}`;
          if (seen.has(key) || !isUnresolved(item)) return;
          seen.add(key);
          rows.push({ key, dayKey, date, item });
        });
      });
    return rows;
  }, [allDays, sortedDay, todayKey, selected, isUnresolved]);

  // The teaser's 3 bubbles: the REAL load of today's month + 2, the same
  // formula as the full Calendar's "Următoarele 3 luni" (effort / the sum
  // of the days' max capacity, lib/calendar/capacity.ts).
  const monthFills = useMemo(
    () =>
      [0, 1, 2].map((delta) => {
        const [yy, mm] = addMonths(ty, tm, delta);
        const data = cache[monthKeyOf(yy, mm)];
        let effort = 0;
        let capacity = 0;
        for (let day = 1; day <= new Date(yy, mm + 1, 0).getDate(); day++) {
          const date = new Date(yy, mm, day);
          capacity += dayCapacity(date).max;
          effort += dayEffort(data?.days[ymd(date)], date);
        }
        return capacity ? effort / capacity : 0;
      }),
    [cache, ty, tm],
  );

  /* ---------------- actions ---------------- */

  const pager = useMonthPager();
  const [newEventOpen, setNewEventOpen] = useState(false);
  const goToMonth = (yy: number, mm: number, selectKey?: string) => {
    const delta = yy * 12 + mm - (vy * 12 + vm);
    // Without a day to select: today in today's month, else the 1st.
    const pick = selectKey ?? (yy === ty && mm === tm ? todayKey : ymd(new Date(yy, mm, 1)));
    if (delta === 0) {
      setSelected(pick);
      return;
    }
    pager.slide(delta > 0 ? 1 : -1, () => {
      setView([yy, mm]);
      setSelected(pick);
    });
  };
  const changeMonth = (dir: 1 | -1) => goToMonth(...addMonths(vy, vm, dir));

  const [busyId, setBusyId] = useState<string | null>(null);
  const resolve = async (it: any) => {
    if (busyId) return;
    setBusyId(String(it.id));
    try {
      if (await resolveFromSummary(it, (h) => router.navigate(h as any))) refreshAll();
    } finally {
      setBusyId(null);
    }
  };

  const openRow = (it: any) => {
    if (it.space_id != null || it.space?.id != null) {
      router.navigate(todoHref(it) as any);
      return;
    }
    // Any record (and your own events) opens its editor.
    if (canEditRecord(it.type) && !isReminder(it)) {
      openEditRecord(it.id);
      return;
    }
    // A custom event: a light read-only note (the full Calendar owns editing).
    const d = new Date(it.due_at);
    const when = capitalize(d.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }));
    const time = timeOf(it.due_at);
    notifyAction(it.title || "Eveniment", `${when}${time ? `, ${time}` : ""}${it.notes ? `\n\n${it.notes}` : ""}`);
  };

  /* ---------------- render ---------------- */

  const muted = colors.onSurfaceTertiary;

  const renderRow = (row: AgendaRow, late: boolean, showDate: boolean) => {
    const it = row.item;
    const reminder = isReminder(it);
    const isEvent = !it.space;
    const barColor = isEvent ? CUSTOM_EVENT_COLOR : (spaceColors(it.space, isDark)?.color ?? muted);
    const amount = it.amount != null && Number(it.amount) > 0 ? Number(it.amount) : null;
    const title = isEvent ? it.title : reminder ? it.title || "Credit" : todoTitle(it);
    const time = isEvent ? timeOf(it.due_at) : null;
    const km = !isEvent && !reminder ? overdueKmLabel(it) : null;
    const subtitle = isEvent
      ? ["Eveniment", time].filter(Boolean).join(" · ")
      : reminder
        ? ["Rată", amount ? lei(amount) : null].filter(Boolean).join(" · ")
        : [it.space?.name, km, amount ? lei(amount) : null].filter(Boolean).join(" · ");
    const dow = DOW[row.date.getDay()];
    const checkable = !isEvent && !reminder && canSwipeResolve(it) && isUnresolved(it);

    const content = (
      <PressableScale
        testID={`simple-cal-row-${it.id}-${row.dayKey}`}
        onPress={() => openRow(it)}
        scaleTo={1}
        pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
        accessibilityRole="button"
        accessibilityLabel={`${late ? "Restant, " : ""}${capitalize(row.date.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }))}: ${title}, ${subtitle}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          minHeight: 56,
          paddingVertical: 9,
          paddingLeft: spacing.lg,
          paddingRight: checkable ? 6 : spacing.lg,
          backgroundColor: colors.surfaceSecondary,
        }}
      >
        {showDate ? (
          <View style={{ width: 40, alignItems: "center" }}>
            <Text style={{ fontSize: 18, lineHeight: 21, fontWeight: "600", color: late ? colors.error : colors.onSurface }}>{row.date.getDate()}</Text>
            <Text style={{ fontSize: 11, lineHeight: 13, color: late ? colors.error : muted }}>{dow}</Text>
          </View>
        ) : null}
        <View style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: barColor }} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ fontSize: 13, color: muted }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {checkable ? (
          <Pressable
            testID={`simple-cal-check-${it.id}-${row.dayKey}`}
            onPress={() => resolve(it)}
            disabled={busyId != null}
            accessibilityRole="button"
            accessibilityLabel={`Bifează: ${title}`}
            hitSlop={4}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: busyId === String(it.id) ? 0.4 : 1 }}
          >
            <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.borderStrong }} />
          </Pressable>
        ) : !isEvent ? (
          <Ionicons name="chevron-forward" size={18} color={muted} />
        ) : null}
      </PressableScale>
    );

    // Space records swipe exactly like the full Calendar's "De rezolvat"
    // rows; reminders and custom events don't swipe here.
    if (isEvent || reminder) return <View key={row.key}>{content}</View>;
    return (
      <SwipeItemRow key={row.key} item={it} onChanged={refreshAll} canResolve={isUnresolved(it)}>
        {content}
      </SwipeItemRow>
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="simple-calendar-screen">
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 120, gap: spacing.section }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={muted} colors={[muted]} />}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 13, color: muted }}>Calendar</Text>
            <Text style={{ ...typography.title, color: colors.onSurface }} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {capitalize(new Date(vy, vm, 1).toLocaleDateString("ro-RO", { month: "long", year: "numeric" }))}
            </Text>
          </View>
          <PressableScale
            testID="simple-cal-today"
            onPress={() => goToMonth(ty, tm, todayKey)}
            accessibilityRole="button"
            accessibilityLabel="Mergi la azi"
            hitSlop={4}
            style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurface }}>Azi</Text>
          </PressableScale>
          <CircleButton testID="simple-cal-prev" icon="chevron-back" label="Luna trecută" onPress={() => changeMonth(-1)} />
          <CircleButton testID="simple-cal-next" icon="chevron-forward" label="Luna viitoare" onPress={() => changeMonth(1)} />
        </View>

        {/* THE MONTH -- swipe it left/right (the rows below swipe sideways
            themselves, so the pan lives on this card only). */}
        <MonthSwipeView
          pager={pager}
          onSwipe={changeMonth}
          style={{ ...card, borderRadius: radius.lg, paddingTop: 14, paddingBottom: 10, paddingHorizontal: 10 }}
          after={
            legend.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6, marginTop: 6, paddingTop: 10, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                {legend.map((l) => (
                  <View key={l.key} style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: l.color }} />
                    <Text style={{ flexShrink: 1, fontSize: 12, color: muted }} numberOfLines={1}>{l.label}</Text>
                  </View>
                ))}
              </View>
            ) : null
          }
        >
          <View testID="simple-cal-grid" style={{ gap: 6 }}>
            <View style={{ flexDirection: "row" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {WEEK_HEADER.map((d, i) => (
                <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 12, color: muted }}>{d}</Text>
              ))}
            </View>
            <View style={{ gap: 2 }}>
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <View key={r} style={{ flexDirection: "row" }}>
                  {cells.slice(r * 7, r * 7 + 7).map((c) => {
                    const isSelected = c.dayKey === selected;
                    const isToday = c.dayKey === todayKey;
                    const numberColor = isSelected
                      ? colors.surface
                      : c.late
                        ? colors.error
                        : !c.inMonth
                          ? colors.control
                          : c.past
                            ? muted
                            : colors.onSurface;
                    return (
                      <Pressable
                        key={c.dayKey}
                        testID={`simple-cal-day-${c.dayKey}`}
                        onPress={() => goToMonth(c.date.getFullYear(), c.date.getMonth(), c.dayKey)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`${c.date.toLocaleDateString("ro-RO", { day: "numeric", month: "long" })}${isToday ? ", azi" : ""}${c.count > 0 ? `, ${c.count} ${c.late ? "restante" : "de făcut"}` : ""}`}
                        style={{ flex: 1, height: 46, alignItems: "center" }}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isSelected ? colors.onSurface : "transparent",
                            borderWidth: isToday && !isSelected ? 1.5 : 0,
                            borderColor: colors.onSurface,
                          }}
                        >
                          <Text style={{ fontSize: 15, fontWeight: isSelected || isToday || c.late ? "600" : "400", color: numberColor, fontVariant: ["tabular-nums"] }}>{c.date.getDate()}</Text>
                        </View>
                        <View style={{ flexDirection: "row", gap: 3, height: 6, marginTop: 4 }}>
                          {c.late ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error }} /> : null}
                          {c.dots.map((color) => (
                            <View key={color} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                          ))}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </MonthSwipeView>

        {!loaded ? (
          <ActivityIndicator color={muted} style={{ paddingVertical: spacing.xl }} />
        ) : (
          <>
            <View style={{ gap: 6 }} testID="simple-cal-day">
              <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 4, gap: spacing.sm }}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
                  <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface }} accessibilityRole="header" numberOfLines={1}>
                    {capitalize(selectedDate.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }))}
                  </Text>
                  {selected === todayKey ? <Text style={{ fontSize: 13, color: colors.warning }}>Azi</Text> : null}
                </View>
                {/* A new event, dated on the selected day. */}
                <PressableScale
                  testID="simple-cal-add-event"
                  onPress={() => setNewEventOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Eveniment nou"
                  hitSlop={4}
                  style={{ height: 36, paddingLeft: 10, paddingRight: 14, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.onSurface }}
                >
                  <Ionicons name="add" size={18} color={colors.surface} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.surface }}>Eveniment</Text>
                </PressableScale>
              </View>
              <View style={{ ...card, borderRadius: radius.lg, overflow: "hidden", paddingVertical: spacing.xs }}>
                {dayRows.length === 0 ? (
                  <Text testID="simple-cal-day-empty" style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary, paddingVertical: 14, paddingHorizontal: spacing.lg }}>
                    {failed ? "Nu am putut încărca calendarul. Trage în jos ca să încerci din nou." : "Nimic în ziua asta."}
                  </Text>
                ) : (
                  dayRows.map((r) => renderRow(r, selected < todayKey, false))
                )}
              </View>
            </View>

            {overdue.length > 0 ? (
              <View style={{ gap: 6 }} testID="simple-cal-group-overdue">
                <Text style={{ marginHorizontal: 4, fontSize: 13, fontWeight: "600", color: colors.error }} accessibilityRole="header">
                  Restante
                </Text>
                <View style={{ ...card, borderRadius: radius.lg, overflow: "hidden", paddingVertical: spacing.xs }}>
                  {overdue.map((r) => renderRow(r, true, true))}
                </View>
              </View>
            ) : null}
          </>
        )}

        <TeaserCard
          testID="simple-cal-teaser"
          title="Cât de plină e fiecare lună"
          subtitle="Vezi din timp lunile aglomerate, în Complet."
          leading={<MiniBubbles fills={monthFills} loaded={loaded} />}
        />
      </ScrollView>
      <SimpleNewEventSheet
        visible={newEventOpen}
        day={selected}
        onClose={() => setNewEventOpen(false)}
        onSaved={() => {
          setNewEventOpen(false);
          refreshAll();
        }}
      />
    </SafeAreaView>
  );
}

/** "18:00", or null at local midnight (an event saved without a time). */
function timeOf(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || (d.getHours() === 0 && d.getMinutes() === 0)) return null;
  return d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
}

const MINI = 22;

/**
 * The teaser's 3 mini bubbles = today's month + 2, filled to their real
 * load. A month with almost nothing still shows a sliver (and an account
 * with nothing in 3 months a fixed decorative trio, as in the mockup) so the teaser reads as "bubbles", not blanks.
 */
function MiniBubbles({ fills, loaded }: { fills: number[]; loaded: boolean }) {
  const { spacing, colors, isDark } = useTheme();
  const anything = loaded && fills.some((f) => f > 0);
  const shown = anything ? fills : [0.65, 0.4, 1];
  return (
    <View style={{ flexDirection: "row", gap: spacing.xs }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shown.map((f, i) => {
        const status = monthStatus(f);
        const level: HeatLevel = anything ? (status === "over" ? 8 : status === "full" ? 6 : 4) : ([6, 4, 8][i] as HeatLevel);
        const h = f > 0 ? Math.max(0.15, Math.min(f, 1)) * MINI : 0;
        return (
          <View key={i} style={{ width: MINI, height: MINI, borderRadius: MINI / 2, overflow: "hidden", backgroundColor: colors.surfaceTertiary }}>
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, backgroundColor: heatColor(level, isDark) }} />
          </View>
        );
      })}
    </View>
  );
}
