import React, { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { useTheme } from "@/lib/theme";

import type { ExpensesData } from "./expenses.data.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { ExpensesHeader } from "./ExpensesHeader";
import { ExpensesStats } from "./ExpensesStats";
import { ExpensesAddBar } from "./ExpensesAddBar";
import { ExpensesListSection } from "./ExpensesListSection";
import { getThisMonthExpensesTotal } from "@/lib/spaces/expenses/calculations/dashboard.calculations";

export type ExpensesDashboardProps = {
  space: any;
  expensesData: ExpensesData;
  onEdit?: () => void;
  onEntriesChange?: (entries: ExpenseEntry[]) => void;
};

function makeEntryId(): string {
  return `gx-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export default function ExpensesDashboard({
  space,
  expensesData,
  onEdit,
  onEntriesChange,
}: ExpensesDashboardProps) {
  const { spacing } = useTheme();

  const [entries, setEntries] = useState<ExpenseEntry[]>(expensesData.entries);

  const handleAdd = (name: string, price: number) => {
    const newEntry: ExpenseEntry = {
      id: makeEntryId(),
      name,
      price,
      date: new Date().toISOString().slice(0, 10),
    };

    const next = [newEntry, ...entries];
    setEntries(next);
    onEntriesChange?.(next);
  };

  const thisMonthTotal = useMemo(
    () => getThisMonthExpensesTotal({ entries }),
    [entries],
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        // Clears the floating Quick Add FAB in the bottom-right corner.
        // Same reasoning as Grocery's: one list, one category, so the FAB
        // stays as Quick Add here (nothing to fan out into).
        paddingBottom: 100,
      }}
    >
      <ExpensesHeader space={space} onEdit={onEdit} />

      <ExpensesStats thisMonthTotal={thisMonthTotal} itemCount={entries.length} />

      <ExpensesAddBar onAdd={handleAdd} />

      <ExpensesListSection entries={entries} />
    </ScrollView>
  );
}
