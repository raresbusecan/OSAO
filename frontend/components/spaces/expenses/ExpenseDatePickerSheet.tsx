import React, { useMemo, useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type ExpenseDatePickerSheetProps = {
  /** ISO string -- the sheet opens on this date's month, defaulting to
   * the current month when unset. */
  value?: string;
  onCancel: () => void;
  onSelect: (dateIso: string) => void;
};

// How far back the strip reaches from the current month -- generous for
// backdating an old receipt, and cheap regardless since only the current
// index's grid is ever actually rendered (see below).
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

/**
 * Month-by-month picker, paged with the chevrons only -- an earlier
 * version paged via a horizontal FlatList (letting a swipe gesture also
 * change months) so it could jump straight to an existing entry's own
 * month when opened for editing, not just today's. That jump (a large,
 * non-zero initialScrollIndex) turned out to not be reliably honored by
 * a horizontal paging FlatList on react-native-web: it kept rendering
 * scrolled to month 0 (today minus MONTH_RANGE) regardless of
 * initialScrollIndex/contentOffset/an imperative scrollToIndex
 * correction, sometimes additionally leaving the grid itself blank until
 * a manual swipe forced VirtualizedList to recompute what's in view.
 * Rendering only the current month directly -- no list, no
 * virtualization, nothing to desync -- sidesteps the whole class of bug:
 * `index` is plain React state, so it opens on the right month the
 * moment this mounts, full stop.
 */
export function ExpenseDatePickerSheet({ value, onCancel, onSelect }: ExpenseDatePickerSheetProps) {
  const { colors, spacing, radius } = useTheme();

  const now = new Date();
  const anchorYear = now.getFullYear();
  const anchorMonth = now.getMonth();

  const months = useMemo<MonthKey[]>(() => {
    const arr: MonthKey[] = [];
    for (let i = MONTH_RANGE; i >= 0; i--) {
      arr.push(addMonths(anchorYear, anchorMonth, -i));
    }
    return arr;
    // Built once off today's real date at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentMonthIndex = months.length - 1;

  // Opens on the recorded entry's own month (not always today's) so its
  // day is visibly highlighted the moment the sheet appears. Falls back
  // to today's month when there's no value yet (a brand-new entry) or
  // the value predates this strip's range.
  const today = new Date();
  const initialIndex = useMemo(() => {
    if (!value) return currentMonthIndex;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return currentMonthIndex;
    const idx = months.findIndex((mo) => mo.year === d.getFullYear() && mo.month === d.getMonth());
    return idx >= 0 ? idx : 0;
    // Computed once, off the value this sheet was opened with -- not
    // meant to re-jump if `value` changes while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [index, setIndex] = useState(initialIndex);

  const selected = value ? new Date(value) : today;
  const current = months[index];

  const goToIndex = (target: number) => {
    setIndex(Math.max(0, Math.min(months.length - 1, target)));
  };

  const monthLabel = new Date(current.year, current.month, 1).toLocaleDateString("ro-RO", { month: "long", year: "numeric" });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg + 4,
            borderTopRightRadius: radius.lg + 4,
            padding: spacing.xl,
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
              alignSelf: "center",
              marginBottom: spacing.lg,
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg }}>
            <Pressable onPress={() => goToIndex(index - 1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
            </Pressable>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.onSurface, textTransform: "capitalize" }}>
              {monthLabel}
            </Text>
            {/* Disabled, not hidden, on the current month -- an expense
                can't be dated in the future. */}
            <Pressable
              onPress={() => goToIndex(index + 1)}
              disabled={index === currentMonthIndex}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={20} color={index === currentMonthIndex ? colors.border : colors.onSurface} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", marginBottom: 4 }}>
            {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", paddingBottom: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onSurfaceTertiary }}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={{ marginBottom: spacing.lg }}>
            <MonthGrid
              year={current.year}
              month={current.month}
              selected={selected}
              today={today}
              onSelectDay={(d) => onSelect(d.toISOString())}
              colors={colors}
            />
          </View>

          <Pressable
            onPress={() => {
              onSelect(today.toISOString());
              goToIndex(currentMonthIndex);
            }}
            accessibilityRole="button"
            accessibilityLabel="Today"
            style={{
              height: 48,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.onSurfaceTertiary }}>Astăzi</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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
        // Can't log an expense in the future.
        const isFuture = date ? date.getTime() > today.getTime() && !isToday : false;

        return (
          <Pressable
            key={i}
            disabled={d == null || isFuture}
            onPress={() => date && onSelectDay(date)}
            style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" }}
          >
            {d != null ? (
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected ? colors.onSurface : "transparent",
                  borderWidth: isToday && !isSelected ? 1 : 0,
                  borderColor: colors.onSurface,
                  opacity: isFuture ? 0.3 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: isSelected || isToday ? "800" : "500",
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
