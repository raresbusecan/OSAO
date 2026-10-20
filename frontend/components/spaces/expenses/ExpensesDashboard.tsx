import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmAction } from "@/lib/confirm";
import { useRecordAction } from "@/lib/navigation/recordAction";
import { DeviceEventEmitter, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";

import type { ExpensesData } from "./expenses.data.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { ExpensesHeader } from "./ExpensesHeader";
import { ExpensesStats, lastSixMonths, monthKey } from "./ExpensesStats";
import { Pill } from "@/components/ui/primitives";
import { ExpensesAddBar, type ExpensesAddBarDraft } from "./ExpensesAddBar";
import { ExpensesListSection } from "./ExpensesListSection";
import { ExpenseEditModal } from "./ExpenseEditModal";
import { ExpensesDetailPage } from "./ExpensesDetailPage";
import { ExpensesCreditsSection } from "./ExpensesCreditsSection";
import { loadCreditItems } from "@/lib/spaces/expenses/expensesItems";
import type { CreditEntry } from "@/lib/spaces/expenses/credits";
import { getAllTimeExpensesTotal, getThisMonthExpensesTotal } from "@/lib/spaces/expenses/calculations/dashboard.calculations";

export type ExpensesDashboardProps = {
  space: any;
  expensesData: ExpensesData;
  /** Calendar events' purchases (read-only here): a spent one counts like
   * any expense; a planned one (its day not reached) is listed under this
   * month but not counted. */
  calendarEntries?: ExpenseEntry[];
  onEdit?: () => void;
  /** Saves one entry (new or edited) -- id is a client-generated
   * placeholder for a new one, the real saved id once it round-trips.
   * See app/(tabs)/[id].tsx's handleExpenseEntrySave. */
  onEntrySave: (entry: ExpenseEntry) => void;
  onEntryDelete: (id: string) => void;
  initialOpenItem?: { id: string; type: string } | null;
};

function makeEntryId(): string {
  return `gx-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export default function ExpensesDashboard({
  space,
  expensesData,
  calendarEntries = [],
  onEdit,
  onEntrySave,
  onEntryDelete,
  initialOpenItem,
}: ExpensesDashboardProps) {
  const { spacing, colors } = useTheme();
  const router = useRouter();
  const recordAction = useRecordAction();

  // Credits ("Credite") live in this space but are NOT expenses: loaded
  // on their own and never mixed into `entries` or any total below.
  const [credits, setCredits] = useState<CreditEntry[]>([]);
  const reloadCredits = useCallback(() => {
    if (space?.id == null) return;
    loadCreditItems(space.id)
      .then(setCredits)
      .catch((error) => console.error("[EXPENSES CREDITS] failed to load:", error));
  }, [space?.id]);
  useEffect(() => {
    reloadCredits();
    const sub = DeviceEventEmitter.addListener("lifeos.refresh", reloadCredits);
    return () => sub.remove();
  }, [reloadCredits]);

  // Everything spent: this space's own expenses + Calendar purchases whose
  // day has come -- the same total Buget shows for Cheltuieli.
  const entries = useMemo(
    () => [...expensesData.entries, ...calendarEntries.filter((e) => !e.planned)],
    [expensesData.entries, calendarEntries],
  );
  const plannedEntries = useMemo(() => calendarEntries.filter((e) => e.planned), [calendarEntries]);
  const plannedTotal = plannedEntries.reduce((sum, e) => sum + e.price, 0);
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  // Opened by tapping the "All time" card -- trend chart + breakdown,
  // see ExpensesDetailPage.
  const [detailPageVisible, setDetailPageVisible] = useState(false);
  // The main page lists ONLY the current month; past months stay saved
  // and open by tapping their bar in the chart (or from Detalii). Tapping
  // the same bar again -- or the filter pill -- comes back to this month.
  const currentMonth = monthKey(new Date());
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const openedInitialItemRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialOpenItem || initialOpenItem.type !== "expense_item" || openedInitialItemRef.current === initialOpenItem.id) return;
    const entry = expensesData.entries.find((e) => e.id === initialOpenItem.id);
    if (!entry) return;
    openedInitialItemRef.current = initialOpenItem.id;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Consume a navigation request after the saved expense becomes available.
    setSelectedMonth(monthKey(new Date(entry.date)));
    setEditingEntry(entry);
  }, [initialOpenItem, expensesData.entries]);
  const toggleMonth = (key: string) => setSelectedMonth((cur) => (cur === key || key === currentMonth ? null : key));
  const selectedLabel = useMemo(
    () => (selectedMonth ? lastSixMonths(entries).find((m) => m.key === selectedMonth)?.longLabel ?? null : null),
    [selectedMonth, entries],
  );
  const visibleEntries = useMemo(
    () => [...entries, ...(selectedMonth ? [] : plannedEntries)].filter((e) => monthKey(new Date(e.date)) === (selectedMonth ?? currentMonth)),
    [selectedMonth, currentMonth, entries, plannedEntries],
  );

  // A Calendar purchase is edited in Calendar: tapping it opens that day.
  const openEntry = (entry: ExpenseEntry) => {
    if (entry.source === "calendar") {
      const d = new Date(entry.date);
      router.push(`/calendar?date=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` as any);
      return;
    }
    setEditingEntry(entry);
  };

  const handleAdd = (draft: ExpensesAddBarDraft) => {
    onEntrySave({
      id: makeEntryId(),
      name: draft.name,
      price: draft.price,
      date: draft.date,
      notes: draft.notes,
    });
  };

  const handleEditSave = async (entry: ExpenseEntry) => {
    await onEntrySave(entry);
    setEditingEntry(null);
  };

  const handleEditDelete = async (id: string) => {
    await onEntryDelete(id);
    setEditingEntry(null);
  };

  // Swipe-left on a list row -- asks first (the edit sheet's own delete
  // button confirms inside ExpenseEditModal).
  const handleSwipeDelete = async (entry: ExpenseEntry) => {
    const ok = await confirmAction("Ștergi cheltuiala?", `„${entry.name}” se șterge definitiv.`, { confirmLabel: "Șterge", destructive: true });
    if (ok) onEntryDelete(entry.id);
  };

  const allTimeTotal = useMemo(
    () => getAllTimeExpensesTotal({ entries }),
    [entries],
  );
  const thisMonthTotal = useMemo(
    () => getThisMonthExpensesTotal({ entries }),
    [entries],
  );

  if (detailPageVisible) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ExpensesDetailPage
          expensesData={{ ...expensesData, entries }}
          onBack={() => setDetailPageVisible(false)}
          onEntryPress={openEntry}
          onEntryDelete={handleSwipeDelete}
        />

        <ExpenseEditModal
          entry={editingEntry}
          onClose={() => { setEditingEntry(null); recordAction?.cancel(); }}
          onSave={handleEditSave}
          onDelete={handleEditDelete}
        />
      </View>
    );
  }

  return (
    <SwipeBackView onBack={() => router.push("/spaces")}>
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: spacing.gutter,
        paddingTop: spacing.md,
        paddingBottom: 100,
        gap: spacing.section,
      }}
    >
      <ExpensesHeader space={space} onEdit={onEdit} />

      <ExpensesStats
        entries={entries}
        allTimeTotal={allTimeTotal}
        thisMonthTotal={thisMonthTotal}
        plannedThisMonth={plannedTotal}
        onTotalPress={() => setDetailPageVisible(true)}
        selectedMonth={selectedMonth}
        onMonthPress={toggleMonth}
      />

      <ExpensesAddBar onAdd={handleAdd} />

      {space?.id != null ? <ExpensesCreditsSection spaceId={space.id} credits={credits} onChanged={reloadCredits} initialEditId={initialOpenItem?.type === "expense_credit" ? initialOpenItem.id : undefined} /> : null}

      {selectedLabel ? (
        <View style={{ flexDirection: "row" }}>
          <Pill testID="expenses-month-filter-clear" label={`Doar ${selectedLabel.toLowerCase()}`} icon="close" active tone={colors.onSurface} onPress={() => setSelectedMonth(null)} />
        </View>
      ) : null}

      <ExpensesListSection
        entries={visibleEntries}
        onEntryPress={openEntry}
        onEntryDelete={handleSwipeDelete}
        emptyTitle={selectedLabel ? `Nicio cheltuială în ${selectedLabel.toLowerCase()}` : "Nicio cheltuială luna asta"}
        emptyMessage={
          selectedLabel
            ? "Atinge din nou luna în grafic ca să revii la luna curentă."
            : entries.length > 0
              ? "Scrie mai sus ce ai cumpărat. Lunile trecute le vezi atingând luna în grafic."
              : undefined
        }
      />

      <ExpenseEditModal
        entry={editingEntry}
        onClose={() => { setEditingEntry(null); recordAction?.cancel(); }}
        onSave={handleEditSave}
        onDelete={handleEditDelete}
      />
    </ScrollView>
    </SwipeBackView>
  );
}
