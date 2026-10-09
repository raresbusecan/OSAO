import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { Group, IconWell, SectionHeader, EmptyState } from "@/components/ui/primitives";
import { GuiltFreeChip } from "@/components/dashboard/GuiltFree";
import { TitleChipRow } from "./TitleChipRow";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { capitalize, lei, roDate } from "@/lib/format";

export type ExpensesListSectionProps = {
  entries: ExpenseEntry[];
  onEntryPress?: (entry: ExpenseEntry) => void;
  /** Swipe-left delete (asks first). An expense is a log -- there's
   * nothing to "resolve", so no swipe-right. */
  onEntryDelete?: (entry: ExpenseEntry) => void;
  /** Empty-state line -- the dashboard points at its add bar; a filtered
   * page (no add bar) says the period is empty instead. */
  emptyMessage?: string;
  emptyTitle?: string;
};

/** Every expense, newest first, grouped by month ("Octombrie"), each
 * month on its own card with its own total. Calendar purchases are listed
 * read-only ("din Calendar", no swipe); a planned one shows muted and
 * stays out of the month's total. */
export function ExpensesListSection({ entries, onEntryPress, onEntryDelete, emptyMessage, emptyTitle }: ExpensesListSectionProps) {
  const { colors, spacing, isDark } = useTheme();
  const tint = spaceTextColor("expenses", isDark) ?? SPACE_IDENTITY_COLORS.expenses!;

  const groups = useMemo(() => {
    const sorted = [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const out: { key: string; label: string; total: number; items: ExpenseEntry[] }[] = [];
    sorted.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        const label = capitalize(d.toLocaleDateString("ro-RO", { month: "long", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}) }));
        g = { key, label, total: 0, items: [] };
        out.push(g);
      }
      if (!e.planned) g.total += e.price;
      g.items.push(e);
    });
    return out;
  }, [entries]);

  if (entries.length === 0) {
    return <EmptyState icon="receipt-outline" title={emptyTitle ?? "Nicio cheltuială încă"} message={emptyMessage ?? "Scrie mai sus ce ai cumpărat și cât a costat."} />;
  }

  return (
    <View style={{ gap: spacing.section }}>
      {groups.map((group) => (
        <View key={group.key} style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <SectionHeader title={group.label} />
            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{lei(group.total)}</Text>
          </View>
          <Group inset={68}>
            {group.items.map((entry) => (
              <SwipeRow key={entry.id} cornerRadius={0} colors={colors} onDelete={onEntryDelete && entry.source !== "calendar" ? () => onEntryDelete(entry) : undefined}>
              <TitleChipRow
                testID={`expense-row-${entry.id}`}
                onPress={onEntryPress ? () => onEntryPress(entry) : undefined}
                leading={<IconWell icon={entry.source === "calendar" ? "calendar-outline" : "receipt-outline"} color={SPACE_IDENTITY_COLORS.expenses!} tint={tint} />}
                title={entry.name}
                chip={entry.guiltFree ? <GuiltFreeChip testID={`expense-row-${entry.id}-guilt-free`} /> : undefined}
                subtitle={
                  entry.source === "calendar"
                    ? `${entry.planned ? "Planificat pe " : ""}${roDate(entry.date)} · din Calendar`
                    : roDate(entry.date)
                }
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {entry.notes ? <Ionicons name="document-text-outline" size={14} color={colors.onSurfaceTertiary} /> : null}
                    <Text style={{ fontSize: 15, fontWeight: entry.planned ? "400" : "600", color: entry.planned ? colors.onSurfaceTertiary : colors.onSurface }}>{lei(entry.price)}</Text>
                  </View>
                }
              />
              </SwipeRow>
            ))}
          </Group>
        </View>
      ))}
    </View>
  );
}
