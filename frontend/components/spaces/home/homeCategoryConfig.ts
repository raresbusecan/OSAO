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
  /** "text" (default) is the plain TextInput every field used to be.
   * "date" opens HomeDatePickerSheet and stores an ISO string; "select"
   * renders `options` as a row of segmented buttons and stores the
   * picked option's `value`. "toggle" renders a single on/off button
   * storing "true"/"false", for a field that turns other fields on --
   * added for Maintenance's "Recurent" switch (see the "maintenance"
   * entry below), reusable by any future category that needs the same
   * shape. Added specifically so Recurring can offer a real due-date
   * picker and a frequency choice instead of every new entry silently
   * defaulting to "today" / "monthly" with no way to change either (see
   * homeCategoryConfig.ts's "recurring" entry). */
  type?: "text" | "date" | "select" | "toggle";
  options?: { value: string; label: string }[];
  /** Shown as selected/pre-filled on a brand-new (non-edit) entry when
   * the user hasn't touched this field yet, so a "select" field never
   * looks like nothing is chosen even though buildEntry already has a
   * real fallback -- what's highlighted and what actually gets saved
   * always agree. */
  defaultValue?: string;
  /** Whether HomeCategoryPage blocks submit and shows the red "*" when
   * this field is empty. Defaults to true (every original text field's
   * existing behavior); "date"/"select"/"toggle" fields with a sensible
   * pre-filled default set this to false so they stay changeable
   * without becoming a new hard requirement. */
  required?: boolean;
  /** Only rendered (and only counted by the required check) while the
   * "toggle" field named here currently reads "true" -- lets a toggle
   * reveal extra fields, e.g. Maintenance's recurrence frequency/
   * interval only appearing once "Recurent" is switched on, instead of
   * always showing fields that don't apply yet. */
  showWhen?: string;
  /** Passed straight through to the underlying TextInput's
   * keyboardType -- "numeric" for a plain-text field that should only
   * ever hold digits (e.g. Maintenance's "every N periods" interval). */
  keyboardType?: "default" | "numeric";
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
  /** This category's own entries out of HomeData -- used generically for
   * edit/delete lookups by id instead of a per-category switch. */
  entries: (data: HomeData) => { id: string }[];
  /** Turns the form's raw text values into a concrete entry -- pure, no
   * side effects. When `existing` is passed (editing), its id and any
   * fields the form doesn't cover are preserved; HomeDashboard is what
   * actually saves the result, via the onXSave prop matching this
   * category's key. */
  buildEntry: (values: Record<string, string>, existing?: any) => any;
  /** Prefills the form's fields from an existing entry, for editing. */
  valuesFromEntry: (entry: any) => Record<string, string>;
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
    entries: (data) => data.documentEntries,
    buildEntry: (values, existing?: HomeDocumentEntry): HomeDocumentEntry => ({
      id: existing?.id ?? makeId("doc"),
      date: existing?.date ?? today(),
      documentType: values.documentType || "Other",
      title: values.title,
      issuer: existing?.issuer,
      issueDate: existing?.issueDate,
      expiryDate: existing?.expiryDate,
    }),
    valuesFromEntry: (entry: HomeDocumentEntry) => ({
      title: entry.title,
      documentType: entry.documentType,
    }),
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
      { key: "title", label: "Title", placeholder: "e.g. Roof Repair" },
      { key: "amount", label: "Amount (RON)", placeholder: "0" },
    ],
    submitLabel: "Add Expense",
    emptyLabel: "No expenses yet.",
    entries: (data) => data.expenseEntries,
    buildEntry: (values, existing?: HomeExpenseEntry): HomeExpenseEntry => ({
      id: existing?.id ?? makeId("exp"),
      date: existing?.date ?? today(),
      title: values.title,
      amount: Number(values.amount.replace(",", ".")) || 0,
      notes: existing?.notes,
    }),
    valuesFromEntry: (entry: HomeExpenseEntry) => ({
      title: entry.title,
      amount: String(entry.amount),
    }),
    rows: (data) =>
      data.expenseEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        subtitle: formatDate(entry.date),
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
      { key: "date", label: "Date", placeholder: "", type: "date", required: false },
      { key: "isRecurring", label: "Recurring", placeholder: "Recurent", type: "toggle", required: false },
      {
        key: "recurrenceFrequency",
        label: "Repeats every",
        placeholder: "",
        type: "select",
        required: false,
        defaultValue: "monthly",
        showWhen: "isRecurring",
        options: [
          { value: "weekly", label: "Week(s)" },
          { value: "monthly", label: "Month(s)" },
          { value: "yearly", label: "Year(s)" },
        ],
      },
      {
        key: "recurrenceInterval",
        label: "Interval (e.g. 3 = every 3)",
        placeholder: "1",
        required: false,
        showWhen: "isRecurring",
        keyboardType: "numeric",
      },
    ],
    submitLabel: "Add Maintenance",
    emptyLabel: "No maintenance entries yet.",
    entries: (data) => data.maintenanceEntries,
    buildEntry: (values, existing?: HomeMaintenanceEntry): HomeMaintenanceEntry => {
      const isRecurring = values.isRecurring === "true";
      return {
        id: existing?.id ?? makeId("maint"),
        date: values.date || existing?.date || today(),
        service: values.service,
        description: existing?.description ?? values.service,
        price: Number(values.price.replace(",", ".")) || 0,
        provider: existing?.provider,
        nextDueDate: existing?.nextDueDate,
        isRecurring,
        recurrenceFrequency: isRecurring
          ? ((values.recurrenceFrequency as HomeMaintenanceEntry["recurrenceFrequency"]) || "monthly")
          : undefined,
        recurrenceInterval: isRecurring ? Math.max(1, Number(values.recurrenceInterval) || 1) : undefined,
      };
    },
    valuesFromEntry: (entry: HomeMaintenanceEntry) => ({
      service: entry.service,
      price: String(entry.price),
      date: entry.date,
      isRecurring: entry.isRecurring ? "true" : "false",
      recurrenceFrequency: entry.recurrenceFrequency ?? "monthly",
      recurrenceInterval: entry.recurrenceInterval != null ? String(entry.recurrenceInterval) : "1",
    }),
    rows: (data) =>
      data.maintenanceEntries.map((entry) => ({
        id: entry.id,
        title: entry.service,
        subtitle: entry.isRecurring
          ? `${entry.description} · every ${entry.recurrenceInterval ?? 1} ${entry.recurrenceFrequency ?? "monthly"}`
          : `${entry.description} · ${formatDate(entry.date)}`,
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
      { key: "nextDueDate", label: "Next due date", placeholder: "", type: "date", required: false },
      {
        key: "frequency",
        label: "Frequency",
        placeholder: "",
        type: "select",
        required: false,
        defaultValue: "monthly",
        options: [
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly" },
        ],
      },
    ],
    submitLabel: "Add Recurring",
    emptyLabel: "No recurring payments yet.",
    entries: (data) => data.recurringEntries,
    buildEntry: (values, existing?: HomeRecurringEntry): HomeRecurringEntry => ({
      id: existing?.id ?? makeId("rec"),
      title: values.title,
      category: existing?.category ?? "Other",
      amount: Number(values.amount.replace(",", ".")) || 0,
      frequency: (values.frequency as HomeRecurringEntry["frequency"]) || existing?.frequency || "monthly",
      nextDueDate: values.nextDueDate || existing?.nextDueDate || today(),
      notes: existing?.notes,
    }),
    valuesFromEntry: (entry: HomeRecurringEntry) => ({
      title: entry.title,
      amount: String(entry.amount),
      nextDueDate: entry.nextDueDate,
      frequency: entry.frequency,
    }),
    rows: (data) =>
      data.recurringEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        subtitle: `${entry.frequency} · next ${formatDate(entry.nextDueDate)}`,
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
    entries: (data) => data.supplyEntries,
    buildEntry: (values, existing?: HomeSupplyEntry): HomeSupplyEntry => ({
      id: existing?.id ?? makeId("sup"),
      name: values.name,
      category: existing?.category ?? "Other",
      quantity: Number(values.quantity) || 1,
      unit: values.quantity.replace(/[0-9]/g, "").trim() || existing?.unit || "pcs",
      lastRestockedDate: existing?.lastRestockedDate,
      notes: existing?.notes,
    }),
    valuesFromEntry: (entry: HomeSupplyEntry) => ({
      name: entry.name,
      quantity: `${entry.quantity} ${entry.unit}`,
    }),
    rows: (data) =>
      data.supplyEntries.map((entry) => ({
        id: entry.id,
        title: entry.name,
        subtitle: `${entry.category} · ${entry.quantity} ${entry.unit}`,
      })),
  },
];
