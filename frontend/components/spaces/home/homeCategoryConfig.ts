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
  /** HomeCategoryPage blocks submit (and shows an inline error once the
   * field has been typed into) unless this field's LEADING number --
   * see parseLeadingNumber -- exists and is >= 0. Covers both a pure
   * amount field ("50") and a combined one like Supplies' quantity
   * ("12 rolls") the same way, since both are just "a number, maybe
   * with trailing text." Without this, `Number(raw) || 0`/`|| 1` in
   * buildEntry below silently accepted "-50" as a real negative
   * expense, or "abc" as a nonsensical one coerced to 0/1 with no
   * indication anything was wrong. */
  nonNegativeNumber?: boolean;
};

// Shared between parseLeadingNumber and the Supplies unit-extraction
// below, so the two never drift apart -- `\.?\d*` (not `(\.\d+)?`)
// deliberately also consumes a bare trailing dot ("50."), otherwise a
// leftover "." was left behind as the "unit" instead of falling back
// to "pcs"/existing.
const LEADING_NUMBER = /^[+-]?\d+\.?\d*/;

/** The numeric value a field like "50", "-12.5", "+8", or "12 rolls"
 * leads with -- comma treated as a decimal separator (matches how
 * every buildEntry below already parses amounts). Null when the
 * string doesn't start with a number at all (empty, or non-numeric
 * text). */
export function parseLeadingNumber(raw: string): number | null {
  const match = raw.trim().replace(",", ".").match(LEADING_NUMBER);
  if (!match) return null;
  return Number(match[0]);
}

/** Maintenance's nextDueDate is fully derived, never typed by hand --
 * "serviced on X, recurs every N months" implies "next due on X + N
 * months" on its own, so asking the user to also pick that date would
 * just be asking them to do this arithmetic themselves. Deliberately
 * NOT built on dashboard.calculations.ts's nextTaskOccurrence (no
 * `interval` support, no "yearly", and it has its own known
 * month-rollover bug already logged in BACKLOG.md) -- clamps to the
 * target month's real last day instead of letting e.g. Jan 31 + 1
 * month silently roll into March. */
export function addRecurrenceInterval(
  baseDate: string,
  frequency: "weekly" | "monthly" | "yearly",
  interval: number,
): string {
  const base = new Date(baseDate);
  const step = Math.max(1, interval);

  if (frequency === "weekly") {
    const next = new Date(base);
    next.setDate(next.getDate() + step * 7);
    return next.toISOString().slice(0, 10);
  }

  const day = base.getDate();
  const next = new Date(base);
  next.setDate(1); // parked on day 1 so setMonth/setFullYear can't overflow into the wrong month

  if (frequency === "yearly") next.setFullYear(next.getFullYear() + step);
  else next.setMonth(next.getMonth() + step);

  const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, daysInTargetMonth));

  return next.toISOString().slice(0, 10);
}

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
  /** Only set for a category with a "Resolved" action (currently just
   * Maintenance -- see its own entry below). Pure, like buildEntry: takes
   * the full existing entry, returns the entry to save. HomeCategorySection
   * only shows the resolve button on a category that provides this. */
  resolveEntry?: (existing: any) => any;
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
      { key: "amount", label: "Amount (RON)", placeholder: "0", nonNegativeNumber: true },
    ],
    submitLabel: "Add Expense",
    emptyLabel: "No expenses yet.",
    entries: (data) => data.expenseEntries,
    buildEntry: (values, existing?: HomeExpenseEntry): HomeExpenseEntry => ({
      id: existing?.id ?? makeId("exp"),
      date: existing?.date ?? today(),
      title: values.title,
      amount: parseLeadingNumber(values.amount) ?? 0,
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
      { key: "price", label: "Price (RON)", placeholder: "0", nonNegativeNumber: true },
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
    // Resolved-and-inactive (a non-recurring entry, once resolved --
    // see resolveEntry below) drops out of the active list entirely,
    // rather than lingering marked "done".
    entries: (data) => data.maintenanceEntries.filter((entry) => !entry.completed),
    buildEntry: (values, existing?: HomeMaintenanceEntry): HomeMaintenanceEntry => {
      const isRecurring = values.isRecurring === "true";
      const date = values.date || existing?.date || today();
      const frequency = (values.recurrenceFrequency as HomeMaintenanceEntry["recurrenceFrequency"]) || "monthly";
      const interval = Math.max(1, Number(values.recurrenceInterval) || 1);

      // nextDueDate is only ever SEEDED here (a brand-new entry, or an
      // existing one that just had "Recurring" switched on) -- from
      // then on, only the Resolved action (resolveEntry below) is
      // allowed to advance it. Otherwise editing an unrelated field
      // (price, service name) on an entry that's already been resolved
      // a few times would silently reset its schedule back to date +
      // one interval, wiping out every resolve since creation.
      const wasAlreadyRecurring = !!existing?.isRecurring && !!existing?.nextDueDate;
      const nextDueDate = isRecurring
        ? wasAlreadyRecurring
          ? existing!.nextDueDate
          : addRecurrenceInterval(date, frequency, interval)
        : undefined;

      return {
        id: existing?.id ?? makeId("maint"),
        date,
        service: values.service,
        description: existing?.description ?? values.service,
        price: parseLeadingNumber(values.price) ?? 0,
        provider: existing?.provider,
        nextDueDate,
        isRecurring,
        recurrenceFrequency: isRecurring ? frequency : undefined,
        recurrenceInterval: isRecurring ? interval : undefined,
        completed: existing?.completed ?? false,
      };
    },
    /** The "Resolved" action -- recurring: advances nextDueDate one
     * cycle forward from wherever it currently is (never from "today",
     * same reasoning as Tasks' own resolveTask/nextTaskOccurrence: keeps
     * a fixed schedule instead of drifting whenever it happens to get
     * resolved a few days late) and stays active. Not recurring: this
     * was a one-off, so resolving it just retires it. */
    resolveEntry: (existing: HomeMaintenanceEntry): HomeMaintenanceEntry => {
      if (existing.isRecurring) {
        const base = existing.nextDueDate || existing.date;
        return {
          ...existing,
          nextDueDate: addRecurrenceInterval(base, existing.recurrenceFrequency ?? "monthly", existing.recurrenceInterval ?? 1),
        };
      }
      return { ...existing, completed: true };
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
      data.maintenanceEntries
        .filter((entry) => !entry.completed)
        .map((entry) => ({
          id: entry.id,
          title: entry.service,
          subtitle: entry.isRecurring
            ? entry.nextDueDate
              ? `${entry.description} · next ${formatDate(entry.nextDueDate)}`
              : `${entry.description} · every ${entry.recurrenceInterval ?? 1} ${entry.recurrenceFrequency ?? "monthly"}`
            : `${entry.description} · ${formatDate(entry.date)}`,
          amount: entry.price.toLocaleString("en-US"),
          isRecurring: entry.isRecurring,
        })),
  },
  {
    key: "recurring",
    label: "Recurring",
    icon: "repeat-outline",
    fields: [
      { key: "title", label: "Title", placeholder: "e.g. Internet Subscription" },
      { key: "amount", label: "Amount (RON)", placeholder: "0", nonNegativeNumber: true },
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
      amount: parseLeadingNumber(values.amount) ?? 0,
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
      { key: "quantity", label: "Quantity", placeholder: "e.g. 12 rolls", nonNegativeNumber: true },
    ],
    submitLabel: "Add Supply",
    emptyLabel: "No supplies tracked yet.",
    entries: (data) => data.supplyEntries,
    buildEntry: (values, existing?: HomeSupplyEntry): HomeSupplyEntry => ({
      id: existing?.id ?? makeId("sup"),
      name: values.name,
      category: existing?.category ?? "Other",
      // Was `Number(values.quantity) || 1` -- for a combined value like
      // "12 rolls" that's NaN (the whole string isn't a number), so it
      // silently saved quantity 1 no matter what number was actually
      // typed. parseLeadingNumber reads just the leading numeric part,
      // and the unit is now whatever's left AFTER that exact match
      // (not a blanket digit-strip, which also broke on a decimal like
      // "2.5 L" -- left a stray ". L").
      quantity: parseLeadingNumber(values.quantity) ?? existing?.quantity ?? 1,
      // Same comma-as-decimal-separator normalization as
      // parseLeadingNumber above, so "2,5 kg" (a very normal way to
      // type a decimal in Romanian) doesn't leave ",5 kg" behind as a
      // nonsense "unit" -- before this matched LEADING_NUMBER directly
      // against the raw string, which doesn't understand a comma.
      unit: values.quantity.trim().replace(",", ".").replace(LEADING_NUMBER, "").trim() || existing?.unit || "pcs",
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
