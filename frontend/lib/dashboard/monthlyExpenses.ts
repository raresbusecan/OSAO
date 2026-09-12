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
 * Cross-space "Monthly Expenses" aggregation for the app's main Dashboard
 * (see zones.json's car -> dashboard-home connection, which anticipated
 * exactly this). Frontend-only for now, matching every space's own
 * current state -- each space still holds its own mock data locally
 * rather than coming from the backend, so this just sums each space's own
 * "this month" calculation, the same way the backend will eventually
 * query each space's model directly (see the "items" connection in
 * zones.json for the shape that migration should follow).
 *
 * A space with nothing to contribute (Grocery has no price field today)
 * is simply absent -- not listed at 0 -- so the breakdown only ever shows
 * real sources.
 *
 * Adding a new expense-tracking space means adding one line here; this
 * list is deliberately not auto-discovered, so a space that shouldn't
 * count towards spending (Grocery) never accidentally does.
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
