import { initialCarData } from "@/components/spaces/car/car.mock";
import { getThisMonthExpenses } from "@/lib/spaces/car/calculations/dashboard.calculations";

import { initialHomeData } from "@/components/spaces/home/home.mock";
import { getThisMonthHomeExpenses } from "@/lib/spaces/home/calculations/dashboard.calculations";

import { initialExpensesData } from "@/components/spaces/expenses/expenses.mock";
import { getThisMonthExpensesTotal } from "@/lib/spaces/expenses/calculations/dashboard.calculations";

export type MonthlyExpenseSource = {
  spaceName: string;
  icon: string;
  amount: number;
};

export type MonthlyExpensesBreakdown = {
  total: number;
  sources: MonthlyExpenseSource[];
};

/**
 * @deprecated Car and Home are both real now (persisted to the backend
 * `items` table, see lib/spaces/car/carItems.ts and
 * lib/spaces/home/homeItems.ts) -- this still sums each space's static
 * *mock* seed, which no longer reflects what's actually saved. Car's mock
 * ships empty, so its contribution here is permanently 0; Home's mock is
 * just stale. The main Dashboard (app/(tabs)/home.tsx) gets its real
 * number from api.dashboard()'s `monthlyExpenses` field instead (see
 * DashboardController::index()) -- nothing should call this anymore.
 * Kept in place rather than deleted (file deletion is denied in this
 * environment), matching how GroceryListsPage.tsx was retired earlier.
 */
export function getMonthlyExpensesBreakdown(): MonthlyExpensesBreakdown {
  const sources: MonthlyExpenseSource[] = [
    {
      spaceName: "Car",
      icon: "car-outline",
      amount: getThisMonthExpenses(initialCarData),
    },
    {
      spaceName: "Home",
      icon: "home-outline",
      amount: getThisMonthHomeExpenses(initialHomeData),
    },
    {
      spaceName: "Expenses",
      icon: "receipt-outline",
      amount: getThisMonthExpensesTotal(initialExpensesData),
    },
  ].filter((source) => source.amount > 0);

  const total = sources.reduce((sum, source) => sum + source.amount, 0);

  return { total, sources };
}
