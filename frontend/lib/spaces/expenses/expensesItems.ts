import { api } from "@/lib/api";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { isSavedItemId } from "@/lib/spaces/itemSync";

/**
 * The Expenses space's entries were frontend-only local state
 * (expenses.mock.ts's initialExpensesData, mutated only inside
 * ExpensesDashboard's own useState -- never sent up to
 * app/(tabs)/[id].tsx, let alone the server) -- nothing survived a
 * remount, let alone a reload. Same fix as every other space this
 * session: reuse the generic `items` table + /api/items CRUD instead of
 * a dedicated table for what's just {name, price, date}.
 */

export { isSavedItemId };

const TYPE_EXPENSE = "expense_item";

export function expenseEntryToItemBody(spaceId: string | number, entry: ExpenseEntry) {
  return {
    space_id: spaceId,
    type: TYPE_EXPENSE,
    title: entry.name,
    amount: entry.price,
    currency: "RON",
    due_at: entry.date,
    notes: entry.notes ?? null,
  };
}

function itemToExpenseEntry(item: any): ExpenseEntry {
  return {
    id: String(item.id),
    name: item.title,
    price: item.amount != null ? Number(item.amount) : 0,
    date: item.due_at ?? item.created_at,
    notes: item.notes ?? undefined,
  };
}

export async function loadExpenseItems(spaceId: string | number): Promise<ExpenseEntry[]> {
  const items = await api.listItems({ space_id: spaceId, type: TYPE_EXPENSE });

  return [...items]
    .sort(
      (a, b) =>
        new Date(b.due_at ?? b.created_at).getTime() -
        new Date(a.due_at ?? a.created_at).getTime(),
    )
    .map(itemToExpenseEntry);
}
