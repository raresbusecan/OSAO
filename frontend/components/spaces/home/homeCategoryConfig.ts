import type { HomeIcon } from "./home.ui.types";
import type { HomeData } from "./home.data.types";
import type {
  HomeDocumentEntry,
  HomeExpenseEntry,
  HomeMaintenanceEntry,
  HomeRecurringEntry,
  HomeSupplyEntry,
} from "@/lib/spaces/home/home.types";
import type { HomeCategoryRow } from "./HomeCategorySection";

export type HomeCategoryField = {
  key: string;
  label: string;
  placeholder: string;
};

export type HomeCategoryKey =
  | "documents"
  | "expenses"
  | "maintenance"
  | "recurring"
  | "supplies";

export type HomeCategoryConfig = {
  key: HomeCategoryKey;
  label: string;
  icon: HomeIcon;
  fields: HomeCategoryField[];
  submitLabel: string;
  emptyLabel: string;
  /** Turns the form's raw text values into a real entry and appends it. */
  addEntry: (data: HomeData, values: Record<string, string>) => HomeData;
  /** Turns this category's entries into the shared row shape for display. */
  rows: (data: HomeData) => HomeCategoryRow[];
};

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

const today = () => new Date().toISOString().slice(0, 10);

export const HOME_CATEGORIES: HomeCategoryConfig[] = [
  {
    key: "documents",
    label: "Documents",
    icon: "document-text-outline",
    fields: [
      { key: "title", label: "Title", placeholder: "e.g. Road Tax Certificate" },
      { key: "documentType", label: "Document type", placeholder: "e.g. RCA" },
    ],
    submitLabel: "Add Document",
    emptyLabel: "No documents yet.",
    addEntry: (data, values) => {
      const entry: HomeDocumentEntry = {
        id: makeId("doc"),
        date: today(),
        documentType: values.documentType || "Other",
        title: values.title,
      };
      return { ...data, documentEntries: [entry, ...data.documentEntries] };
    },
    rows: (data) =>
      data.documentEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        subtitle: entry.expiryDate
          ? `${entry.documentType} · Expires ${formatDate(entry.expiryDate)}`
          : entry.documentType,
      })),
  },
  {
    key: "expenses",
    label: "Expenses",
    icon: "card-outline",
    fields: [
      { key: "title", label: "Title", placeholder: "e.g. Electricity Bill" },
      { key: "category", label: "Category", placeholder: "e.g. Utilities" },
      { key: "amount", label: "Amount (RON)", placeholder: "0" },
    ],
    submitLabel: "Add Expense",
    emptyLabel: "No expenses yet.",
    addEntry: (data, values) => {
      const entry: HomeExpenseEntry = {
        id: makeId("exp"),
        date: today(),
        category: values.category || "Other",
        title: values.title,
        amount: Number(values.amount.replace(",", ".")) || 0,
      };
      return { ...data, expenseEntries: [entry, ...data.expenseEntries] };
    },
    rows: (data) =>
      data.expenseEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        subtitle: `${entry.category} · ${formatDate(entry.date)}`,
        amount: entry.amount.toLocaleString("en-US"),
      })),
  },
  {
    key: "maintenance",
    label: "Maintenance",
    icon: "construct-outline",
    fields: [
      { key: "service", label: "Service", placeholder: "e.g. Plumbing Check" },
      { key: "price", label: "Price (RON)", placeholder: "0" },
    ],
    submitLabel: "Add Maintenance",
    emptyLabel: "No maintenance entries yet.",
    addEntry: (data, values) => {
      const entry: HomeMaintenanceEntry = {
        id: makeId("maint"),
        date: today(),
        service: values.service,
        description: values.service,
        price: Number(values.price.replace(",", ".")) || 0,
      };
      return { ...data, maintenanceEntries: [entry, ...data.maintenanceEntries] };
    },
    rows: (data) =>
      data.maintenanceEntries.map((entry) => ({
        id: entry.id,
        title: entry.service,
        subtitle: `${entry.description} · ${formatDate(entry.date)}`,
        amount: entry.price.toLocaleString("en-US"),
      })),
  },
  {
    key: "recurring",
    label: "Recurring",
    icon: "repeat-outline",
    fields: [
      { key: "title", label: "Title", placeholder: "e.g. Internet Subscription" },
      { key: "amount", label: "Amount (RON)", placeholder: "0" },
    ],
    submitLabel: "Add Recurring",
    emptyLabel: "No recurring payments yet.",
    addEntry: (data, values) => {
      const entry: HomeRecurringEntry = {
        id: makeId("rec"),
        title: values.title,
        category: "Other",
        amount: Number(values.amount.replace(",", ".")) || 0,
        frequency: "monthly",
        nextDueDate: today(),
      };
      return { ...data, recurringEntries: [entry, ...data.recurringEntries] };
    },
    rows: (data) =>
      data.recurringEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        subtitle: `${entry.category} · ${entry.frequency}`,
        amount: entry.amount.toLocaleString("en-US"),
      })),
  },
  {
    key: "supplies",
    label: "Supplies",
    icon: "basket-outline",
    fields: [
      { key: "name", label: "Name", placeholder: "e.g. Toilet Paper" },
      { key: "quantity", label: "Quantity", placeholder: "e.g. 12 rolls" },
    ],
    submitLabel: "Add Supply",
    emptyLabel: "No supplies tracked yet.",
    addEntry: (data, values) => {
      const entry: HomeSupplyEntry = {
        id: makeId("sup"),
        name: values.name,
        category: "Other",
        quantity: Number(values.quantity) || 1,
        unit: values.quantity.replace(/[0-9]/g, "").trim() || "pcs",
      };
      return { ...data, supplyEntries: [entry, ...data.supplyEntries] };
    },
    rows: (data) =>
      data.supplyEntries.map((entry) => ({
        id: entry.id,
        title: entry.name,
        subtitle: `${entry.category} · ${entry.quantity} ${entry.unit}`,
      })),
  },
];
