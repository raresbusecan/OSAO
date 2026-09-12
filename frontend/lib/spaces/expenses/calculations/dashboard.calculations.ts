import type { ExpensesData } from "@/components/spaces/expenses/expenses.data.types";

export function getThisMonthExpensesTotal(data: ExpensesData): number {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return data.entries.reduce((total, entry) => {
    const entryDate = new Date(entry.date);
    const isCurrentMonth =
      entryDate.getMonth() === currentMonth &&
      entryDate.getFullYear() === currentYear;

    return isCurrentMonth ? total + entry.price : total;
  }, 0);
}
