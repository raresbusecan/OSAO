import type {
  HomeDocumentEntry,
  HomeExpenseEntry,
  HomeMaintenanceEntry,
  HomeRecurringEntry,
  HomeSupplyEntry,
} from "@/lib/spaces/home/home.types";

export type HomeData = {
  documentEntries: HomeDocumentEntry[];
  expenseEntries: HomeExpenseEntry[];
  maintenanceEntries: HomeMaintenanceEntry[];
  recurringEntries: HomeRecurringEntry[];
  supplyEntries: HomeSupplyEntry[];
};