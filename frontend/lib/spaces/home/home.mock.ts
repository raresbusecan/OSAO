import type {
  HomeDocumentEntry,
  HomeExpenseEntry,
  HomeMaintenanceEntry,
  HomeRecurringEntry,
  HomeSupplyEntry,
} from "./home.types";

// Dates below are deliberately kept close to "now" (updated 2026-09-09) --
// stale dates here made this space invisible to the cross-space Monthly
// Expenses card (frontend/lib/dashboard/monthlyExpenses.ts) and to this
// space's own NEXT section, since both are computed relative to the real
// current date. Keep future edits to these dates recent for the same reason.

export const MOCK_DOCUMENT_ENTRIES: HomeDocumentEntry[] = [
  {
    id: "doc-1",
    date: "2026-03-15",
    documentType: "RCA",
    title: "Road Tax Certificate",
    issuer: "Local Authority",
    issueDate: "2026-03-15",
    expiryDate: "2026-09-20",
  },
  {
    id: "doc-2",
    date: "2025-08-20",
    documentType: "Insurance",
    title: "Comprehensive Insurance",
    issuer: "ABC Insurance",
    issueDate: "2025-08-20",
    expiryDate: "2026-08-20",
  },
];

export const MOCK_EXPENSE_ENTRIES: HomeExpenseEntry[] = [
  {
    id: "exp-1",
    date: "2026-09-05",
    category: "Utilities",
    title: "Electricity Bill",
    amount: 125.75,
    notes: "Monthly bill",
  },
  {
    id: "exp-2",
    date: "2026-09-02",
    category: "Groceries",
    title: "Weekly Shopping",
    amount: 89.40,
    notes: "Organic produce and pantry items",
  },
];

export const MOCK_MAINTENANCE_ENTRIES: HomeMaintenanceEntry[] = [
  {
    id: "maint-1",
    date: "2026-09-07",
    service: "Air Conditioning Service",
    description: "Full AC system check and recharge",
    price: 180.0,
    provider: "AC Services Ltd",
    nextDueDate: "2027-04-15",
  },
  {
    id: "maint-2",
    date: "2025-09-20",
    service: "Plumbing Check",
    description: "Leak inspection and minor repairs",
    price: 95.5,
    provider: "Local Plumbers Inc",
    nextDueDate: "2026-09-15",
  },
];

export const MOCK_RECURRING_ENTRIES: HomeRecurringEntry[] = [
  {
    id: "rec-1",
    title: "Internet Subscription",
    category: "Utilities",
    amount: 65.0,
    frequency: "monthly",
    nextDueDate: "2026-09-15",
    notes: "Monthly payment due",
  },
  {
    id: "rec-2",
    title: "Gym Membership",
    category: "Health",
    amount: 45.0,
    frequency: "monthly",
    nextDueDate: "2026-10-05",
    notes: "Annual membership renewal",
  },
];

export const MOCK_SUPPLY_ENTRIES: HomeSupplyEntry[] = [
  {
    id: "sup-1",
    name: "Toilet Paper",
    category: "Bathroom",
    quantity: 12,
    unit: "rolls",
    lastRestockedDate: "2026-09-01",
    notes: "Charmin Ultra Soft",
  },
  {
    id: "sup-2",
    name: "Laundry Detergent",
    category: "Cleaning",
    quantity: 2,
    unit: "bottles",
    lastRestockedDate: "2026-08-20",
    notes: "HE detergent, 100 oz",
  },
];