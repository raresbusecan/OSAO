import type { HomeData } from "./home.data.types";
import {
  MOCK_DOCUMENT_ENTRIES,
  MOCK_EXPENSE_ENTRIES,
  MOCK_MAINTENANCE_ENTRIES,
  MOCK_RECURRING_ENTRIES,
  MOCK_SUPPLY_ENTRIES,
} from "@/lib/spaces/home/home.mock";

export const initialHomeData: HomeData = {
  documentEntries: MOCK_DOCUMENT_ENTRIES,
  expenseEntries: MOCK_EXPENSE_ENTRIES,
  maintenanceEntries: MOCK_MAINTENANCE_ENTRIES,
  recurringEntries: MOCK_RECURRING_ENTRIES,
  supplyEntries: MOCK_SUPPLY_ENTRIES,
};
