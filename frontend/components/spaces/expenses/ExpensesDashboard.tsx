import React, { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useTheme } from "@/lib/theme";

import type { ExpensesData } from "./expenses.data.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { ExpensesHeader } from "./ExpensesHeader";
import { ExpensesStats } from "./ExpensesStats";
import { ExpensesAddBar, type ExpensesAddBarDraft } from "./ExpensesAddBar";
import { ExpensesListSection } from "./ExpensesListSection";
import { ExpenseEditModal } from "./ExpenseEditModal";
import { ExpensesDetailPage } from "./ExpensesDetailPage";
import { getAllTimeExpensesTotal } from "@/lib/spaces/expenses/calculations/dashboard.calculations";

export type ExpensesDashboardProps = {
  space: any;
  expensesData: ExpensesData;
  onEdit?: () => void;
  /** Saves one entry (new or edited) -- id is a client-generated
   * placeholder for a new one, the real saved id once it round-trips.
   * See app/(tabs)/[id].tsx's handleExpenseEntrySave. */
  onEntrySave: (entry: ExpenseEntry) => void;
  onEntryDelete: (id: string) => void;
};

function makeEntryId(): string {
  return `gx-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export default function ExpensesDashboard({
  space,
  expensesData,
  onEdit,
  onEntrySave,
  onEntryDelete,
}: ExpensesDashboardProps) {
  const { spacing, colors } = useTheme();

  const entries = expensesData.entries;
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  // Opened by tapping the "All time" card -- trend chart + breakdown,
  // see ExpensesDetailPage.
  const [detailPageVisible, setDetailPageVisible] = useState(false);

  const handleAdd = (draft: ExpensesAddBarDraft) => {
    onEntrySave({
      id: makeEntryId(),
      name: draft.name,
      price: draft.price,
      date: draft.date,
      notes: draft.notes,
    });
  };

  const handleEditSave = (entry: ExpenseEntry) => {
    onEntrySave(entry);
    setEditingEntry(null);
  };

  const handleEditDelete = (id: string) => {
    onEntryDelete(id);
    setEditingEntry(null);
  };

  const allTimeTotal = useMemo(
    () => getAllTimeExpensesTotal({ entries }),
    [entries],
  );

  if (detailPageVisible) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ExpensesDetailPage
          expensesData={expensesData}
          onBack={() => setDetailPageVisible(false)}
          onEntryPress={setEditingEntry}
        />

        <ExpenseEditModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={handleEditSave}
          onDelete={handleEditDelete}
        />
      </View>
    );
  }

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

      <ExpensesStats
        allTimeTotal={allTimeTotal}
        itemCount={entries.length}
        onTotalPress={() => setDetailPageVisible(true)}
      />

      <ExpensesAddBar onAdd={handleAdd} />

      <ExpensesListSection entries={entries} onEntryPress={setEditingEntry} />

      <ExpenseEditModal
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSave={handleEditSave}
        onDelete={handleEditDelete}
      />
    </ScrollView>
  );
}
