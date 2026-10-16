import React, { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Sheet } from "@/components/ui/Sheet";
import { Button, CircleButton } from "@/components/ui/primitives";
import { useTheme } from "@/lib/theme";
import { capitalize } from "@/lib/format";
import { MonthSwipeView, useMonthPager } from "@/components/ui/MonthSwipe";

export type DatePickerSheetProps = {
  /** ISO string -- opens on this date's month (today's when unset). */
  value?: string;
  onCancel: () => void;
  /** ISO string of the picked day (local midnight), or undefined for
   * "Fără dată" when `clearable`. */
  onSelect: (dateIso: string | undefined) => void;
  /** Which months can be reached and which days picked: "past" (an
   * expense, a fuel fill-up -- nothing after today), "future" (a due
   * date -- nothing before today), "any". */
  range?: "past" | "future" | "any";
  /** Footer offers "Fără dată" instead of "Azi". */
  clearable?: boolean;
  title?: string;
};

const MONTH_SPAN = 24;
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

type MonthKey = { year: number; month: number };

function addMonths(y: number, m: number, delta: number): MonthKey {
  const total = y * 12 + m + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * The one date picker every form uses (Casă, Cheltuieli, Mașină,
 * Calendar): a Monday-first month grid like the Calendar tab, paged with
 * the chevrons or a sideways swipe on the grid (MonthSwipe). Only the
 * visible month is rendered -- no paging
 * FlatList, whose initial scroll position react-native-web doesn't
 * reliably honor (see the history in ExpenseDatePickerSheet).
 */
export function DatePickerSheet({ value, onCancel, onSelect, range = "any", clearable, title = "Alege data" }: DatePickerSheetProps) {
  const { colors } = useTheme();
  const today = new Date();

  const months = useMemo<MonthKey[]>(() => {
    const from = range === "future" ? 0 : -MONTH_SPAN;
    const to = range === "past" ? 0 : MONTH_SPAN;
    const arr: MonthKey[] = [];
    for (let i = from; i <= to; i++) arr.push(addMonths(today.getFullYear(), today.getMonth(), i));
    return arr;
    // Built once, off today's date at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = value ? new Date(value) : null;
  const [index, setIndex] = useState(() => {
    const target = selected && !Number.isNaN(selected.getTime()) ? selected : today;
    const i = months.findIndex((m) => m.year === target.getFullYear() && m.month === target.getMonth());
    if (i >= 0) return i;
    return months.findIndex((m) => m.year === today.getFullYear() && m.month === today.getMonth());
  });
  const current = months[index];
  const pager = useMonthPager();
  const canPrev = index > 0;
  const canNext = index < months.length - 1;
  const page = (dir: 1 | -1) => {
    if (dir === 1 ? !canNext : !canPrev) return;
    pager.slide(dir, () => setIndex((i) => Math.min(months.length - 1, Math.max(0, i + dir))));
  };

  const startWeekday = (new Date(current.year, current.month, 1).getDay() + 6) % 7; // Monday-first
  const dim = new Date(current.year, current.month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const isDisabled = (date: Date) =>
    (range === "past" && date.getTime() > startOfToday) || (range === "future" && date.getTime() < startOfToday);

  return (
    <Sheet
      visible
      onClose={onCancel}
      title={title}
      footer={
        clearable
          ? <Button variant="secondary" label="Fără dată" onPress={() => onSelect(undefined)} />
          : <Button variant="secondary" label="Azi" onPress={() => onSelect(new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString())} />
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <CircleButton icon="chevron-back" label="Luna trecută" onPress={() => page(-1)} disabled={!canPrev} />
        <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }}>
          {capitalize(new Date(current.year, current.month, 1).toLocaleDateString("ro-RO", { month: "long", year: "numeric" }))}
        </Text>
        <CircleButton icon="chevron-forward" label="Luna viitoare" onPress={() => page(1)} disabled={!canNext} />
      </View>

      <MonthSwipeView pager={pager} onSwipe={page} canPrev={canPrev} canNext={canNext}>
        <View style={{ flexDirection: "row", marginBottom: 4 }}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={{ flex: 1, textAlign: "center", fontSize: 12, color: colors.onSurfaceTertiary, paddingBottom: 6 }}>{d}</Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((d, i) => {
            const date = d != null ? new Date(current.year, current.month, d) : null;
            const isSelected = !!(date && selected && sameDay(date, selected));
            const isToday = !!(date && sameDay(date, today));
            const disabled = !date || isDisabled(date);
            return (
              <Pressable
                key={i}
                disabled={disabled}
                onPress={() => date && onSelect(date.toISOString())}
                accessibilityRole={date ? "button" : undefined}
                accessibilityLabel={date ? date.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }) : undefined}
                accessibilityState={date ? { selected: isSelected, disabled } : undefined}
                style={{ width: `${100 / 7}%`, height: 46, alignItems: "center", justifyContent: "center" }}
              >
                {d != null ? (
                  <View
                    style={{
                      width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center",
                      backgroundColor: isSelected ? colors.onSurface : "transparent",
                      borderWidth: isToday && !isSelected ? 1.5 : 0,
                      borderColor: colors.onSurfaceTertiary,
                      opacity: disabled ? 0.3 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: isSelected || isToday ? "600" : "400", color: isSelected ? colors.surface : colors.onSurface }}>{d}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </MonthSwipeView>
    </Sheet>
  );
}
