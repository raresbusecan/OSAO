import React, { useMemo, useRef, useState } from "react";
import { View, Text, Pressable, FlatList, LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { Sheet } from "@/components/ui/Sheet";
import { Button, CircleButton } from "@/components/ui/primitives";
import { useTheme } from "@/lib/theme";

export type HomeDatePickerSheetProps = {
  /** ISO string, or undefined for "no date selected yet" -- the sheet
   * opens on this date's month, defaulting to the current month. */
  value?: string;
  onCancel: () => void;
  onSelect: (dateIso: string | undefined) => void;
};

// How far forward the swipeable strip reaches from the current month --
// generous enough for any real due date without rendering an unbounded
// list. FlatList only actually mounts the pages near the current scroll
// position (windowing), so this is cheap regardless.
const MONTH_RANGE = 24;

type MonthKey = { year: number; month: number };

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addMonths(y: number, m: number, delta: number): MonthKey {
  const total = y * 12 + m + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** A plain day-grid picker built from scratch (no native date-picker
 * dependency, no rebuild needed) -- same month-grid shape as the
 * Calendar tab, just compact and opened as a bottom sheet instead of a
 * full screen. Replaces free-text "DD.MM.YYYY" typing for Home's Task
 * due date.
 *
 * Months are a real paged FlatList (scroll position IS the current
 * month, via getItemLayout), not a 3-page strip that tries to snap
 * itself back to center after every swipe -- that approach looked
 * right but desynced after a couple of swipes on web, where
 * ScrollView.scrollTo doesn't reliably land before the next gesture.
 * The chevrons underneath just scrollToIndex +-1, same list. */
export function HomeDatePickerSheet({ value, onCancel, onSelect }: HomeDatePickerSheetProps) {
  const { colors } = useTheme();

  // Index 0 is always the real current month, never a due date in the
  // past -- per "only forward from today" (see the disabled "Previous"
  // chevron at index 0 below). The picker's INITIAL position is
  // different: it opens already scrolled to `value`'s own month when
  // one is set, instead of always index 0 -- previously every open
  // landed on today's month regardless of `value`, so editing a task
  // due several months out meant manually paging/swiping through every
  // month in between just to see the current selection highlighted.
  const now = new Date();
  const anchorYear = now.getFullYear();
  const anchorMonth = now.getMonth();

  const months = useMemo<MonthKey[]>(() => {
    const arr: MonthKey[] = [];
    for (let i = 0; i <= MONTH_RANGE; i++) {
      arr.push(addMonths(anchorYear, anchorMonth, i));
    }
    return arr;
    // Deliberately built once, off today's real date at mount -- the
    // strip's range shouldn't jump around as the user pages through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialIndex = useMemo(() => {
    if (!value) return 0;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 0;
    const offset = (d.getFullYear() * 12 + d.getMonth()) - (anchorYear * 12 + anchorMonth);
    return Math.max(0, Math.min(MONTH_RANGE, offset));
    // Only computed once, off the value this sheet was opened with --
    // scrolling around inside the sheet afterward shouldn't re-anchor it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [index, setIndex] = useState(initialIndex);
  const [pageWidth, setPageWidth] = useState(0);
  const listRef = useRef<FlatList<MonthKey>>(null);

  const today = new Date();
  const selected = value ? new Date(value) : null;
  const current = months[index];

  const goToIndex = (target: number) => {
    const clamped = Math.max(0, Math.min(months.length - 1, target));
    setIndex(clamped);
    // NOT animated -- an animated scrollToIndex fires a stream of
    // intermediate onScroll events as it slides from the old page to
    // the new one (handleScroll below, which exists to track a manual
    // DRAG smoothly). Every one of those intermediate offsets rounds to
    // SOME index -- typically the old page again right after the tap,
    // then the new one once the slide is far enough along -- so
    // setIndex ping-pongs old-new-old-new for the whole animation,
    // visibly flickering the month label back and forth before
    // settling. Jumping straight there has no in-between frame to race.
    listRef.current?.scrollToIndex({ index: clamped, animated: false });
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== pageWidth) setPageWidth(w);
  };

  // onScroll instead of onMomentumScrollEnd -- the latter doesn't fire
  // reliably on web (react-native-web, mouse-drag/trackpad scrolling
  // doesn't always produce a "momentum" event the way a touch swipe
  // does), which is why the header used to stay stuck on the opening
  // month even though the strip itself was visibly scrolling. onScroll
  // fires continuously and consistently everywhere, so the label (and
  // the "today"/selected highlighting, which also depends on `current`)
  // stays in sync with whatever page is actually on screen as you drag,
  // not just once a drag "settles".
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth === 0) return;
    const landed = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    const clamped = Math.max(0, Math.min(months.length - 1, landed));
    if (clamped !== index) setIndex(clamped);
  };

  const monthLabel = new Date(current.year, current.month, 1).toLocaleDateString("ro-RO", { month: "long", year: "numeric" });

  return (
    <Sheet
      visible
      onClose={onCancel}
      title="Alege o dată"
      footer={<Button variant="secondary" label="Fără dată" onPress={() => onSelect(undefined)} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {/* Disabled, not hidden, at index 0 -- nothing before the
            current month to page back to. */}
        <CircleButton icon="chevron-back" label="Luna trecută" onPress={() => goToIndex(index - 1)} disabled={index === 0} />
        <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface, textTransform: "capitalize" }}>{monthLabel}</Text>
        <CircleButton icon="chevron-forward" label="Luna viitoare" onPress={() => goToIndex(index + 1)} />
      </View>

      <View>
        <View style={{ flexDirection: "row", marginBottom: 4 }}>
          {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", paddingBottom: 6 }}>
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{d}</Text>
            </View>
          ))}
        </View>

        <View onLayout={handleLayout} style={{ height: 6 * ((pageWidth || 1) / 7) }}>
          {pageWidth > 0 ? (
            <FlatList
              ref={listRef}
              data={months}
              keyExtractor={(m) => `${m.year}-${m.month}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
              onScroll={handleScroll}
              scrollEventThrottle={32}
              renderItem={({ item }) => (
                <View style={{ width: pageWidth }}>
                  <MonthGrid
                    year={item.year}
                    month={item.month}
                    selected={selected}
                    today={today}
                    onSelectDay={(d) => onSelect(d.toISOString())}
                    colors={colors}
                  />
                </View>
              )}
            />
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

function MonthGrid({
  year,
  month,
  selected,
  today,
  onSelectDay,
  colors,
}: {
  year: number;
  month: number;
  selected: Date | null;
  today: Date;
  onSelectDay: (date: Date) => void;
  colors: any;
}) {
  const startWeekday = new Date(year, month, 1).getDay();
  const dim = daysInMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {cells.map((d, i) => {
        const date = d != null ? new Date(year, month, d) : null;
        const isSelected = date && selected && sameDay(date, selected);
        const isToday = date && sameDay(date, today);

        return (
          <Pressable
            key={i}
            disabled={d == null}
            onPress={() => date && onSelectDay(date)}
            style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" }}
          >
            {d != null ? (
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected ? colors.onSurface : "transparent",
                  borderWidth: isToday && !isSelected ? 1 : 0,
                  borderColor: colors.onSurface,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: isSelected || isToday ? "600" : "400",
                    color: isSelected ? colors.surface : colors.onSurface,
                  }}
                >
                  {d}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
