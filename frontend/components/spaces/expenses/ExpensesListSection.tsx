import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { Group, Row, IconWell, SectionHeader, EmptyState } from "@/components/ui/primitives";
import { capitalize, lei, roDate } from "@/lib/format";

export type ExpensesListSectionProps = {
  entries: ExpenseEntry[];
  onEntryPress?: (entry: ExpenseEntry) => void;
  /** Empty-state line -- the dashboard points at its add bar; a filtered
   * page (no add bar) says the period is empty instead. */
  emptyMessage?: string;
};

/** Every expense, newest first, grouped by month ("Octombrie"), each
 * month on its own card with its own total. */
export function ExpensesListSection({ entries, onEntryPress, emptyMessage }: ExpensesListSectionProps) {
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
      g.total += e.price;
      g.items.push(e);
    });
    return out;
  }, [entries]);

  if (entries.length === 0) {
    return <EmptyState icon="receipt-outline" title="Nicio cheltuială încă" message={emptyMessage ?? "Scrie mai sus ce ai cumpărat și cât a costat."} />;
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
              <Row
                key={entry.id}
                testID={`expense-row-${entry.id}`}
                onPress={onEntryPress ? () => onEntryPress(entry) : undefined}
                leading={<IconWell icon="receipt-outline" color={SPACE_IDENTITY_COLORS.expenses!} tint={tint} />}
                title={entry.name}
                subtitle={roDate(entry.date)}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {entry.notes ? <Ionicons name="document-text-outline" size={14} color={colors.onSurfaceTertiary} /> : null}
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(entry.price)}</Text>
                  </View>
                }
              />
            ))}
          </Group>
        </View>
      ))}
    </View>
  );
}
