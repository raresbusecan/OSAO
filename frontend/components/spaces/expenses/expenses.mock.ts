import type { ExpensesData } from "./expenses.data.types";

/**
 * Starting state for an Expenses space BEFORE its real entries load
 * from the API (app/(tabs)/[id].tsx -> loadExpenseItems). Deliberately
 * empty: this used to be seeded with 4 fake entries ("Winter Jacket",
 * "Roof Leak Repair", ...) from lib/spaces/expenses/expenses.mock.ts,
 * which stayed on screen -- looking like real saved data, editable,
 * and re-saveable as brand-new items -- whenever the load failed (e.g.
 * a stale Cloudflare tunnel URL in frontend/.env). Same shape as Car's
 * seed (car.mock.ts), which already ships with empty entry lists.
 *
 * The file keeps its old name only so existing imports don't change.
 */
export const initialExpensesData: ExpensesData = {
  entries: [],
};
