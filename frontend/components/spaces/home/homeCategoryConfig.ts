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
import { roCount, roDate, roUnit, normalizeNumberText } from "@/lib/format";
import {
  daysUntil,
  dueSubtitle,
  classifyDocumentUrgencyTier,
  classifyTaskUrgencyTier,
} from "@/lib/spaces/home/calculations/dashboard.calculations";

/** "a, b" without a dangling comma when either side is empty. */
function joinParts(...parts: (string | null | undefined)[]): string {
  const text = parts.filter((p) => p && p.trim()).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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
   * homeCategoryConfig.ts's "recurring" entry). "guiltFree" is the
   * shared "Bani fără vină" GuiltFreeToggle (stores "true"/"false"; it
   * hides itself until the person has an income plan). */
  type?: "text" | "date" | "select" | "toggle" | "guiltFree";
  /** guiltFree only: show it just while the record is flagged (see
   * GuiltFreeToggle's `onlyIfSet`). */
  onlyIfSet?: boolean;
  /** A date field that may not fall before another date field's value
   * (a document's expiry vs. its issue date). */
  notBefore?: string;
  /** A unit shown at the end of a text field, worked out from the rest
   * of the form (e.g. the interval's "luni" follows the frequency). */
  suffix?: (values: Record<string, string>) => string | undefined;
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
/** "Bani fără vină" -- only on the categories whose item type the server
 * accepts it for (home_expense, home_maintenance, home_recurring; see
 * Item::SPENDING_TYPES / RECURRING_TYPE_SPACE). Never supplies/documents. */
const GUILT_FREE_FIELD: HomeCategoryField = {
  key: "guiltFree",
  label: "Bani fără vină",
  placeholder: "",
  type: "guiltFree",
  required: false,
};
/** Bills and maintenance are rarely guilt-free: kept only to undo a flag. */
const GUILT_FREE_IF_SET: HomeCategoryField = { ...GUILT_FREE_FIELD, onlyIfSet: true };

export function parseLeadingNumber(raw: string): number | null {
  const match = normalizeNumberText(raw).match(LEADING_NUMBER);
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
    return localDay(next);
  }

  const day = base.getDate();
  const next = new Date(base);
  next.setDate(1); // parked on day 1 so setMonth/setFullYear can't overflow into the wrong month

  if (frequency === "yearly") next.setFullYear(next.getFullYear() + step);
  else next.setMonth(next.getMonth() + step);

  const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, daysInTargetMonth));

  return localDay(next);
}

/** "YYYY-MM-DD" of the LOCAL calendar day. toISOString() would shift a
 * local-midnight due date (stored as e.g. 22:00Z the day before in
 * Romania) back one day on every resolve. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  return roDate(date);
}

const today = () => localDay(new Date());

/** A date field's value for buildEntry: the form's value when the field
 * is in `values` (an emptied field = explicitly cleared -> undefined),
 * the existing entry's value only when the form never had the key. A
 * plain `values.x || existing.x` used to turn a cleared date into a
 * silent no-op that kept the old one. */
function dateValue(values: Record<string, string>, key: string, existing: string | undefined): string | undefined {
  return key in values ? values[key] || undefined : existing;
}

const FREQUENCY_LABEL: Record<string, string> = { weekly: "Săptămânal", monthly: "Lunar", yearly: "Anual" };
const UNIT: Record<string, [string, string]> = { weekly: ["săptămână", "săptămâni"], monthly: ["lună", "luni"], yearly: ["an", "ani"] };

/** "la fiecare 3 luni" / "în fiecare lună". */
function everyLabel(interval: number, frequency: string): string {
  const [one, many] = UNIT[frequency] ?? UNIT.monthly;
  return interval <= 1 ? `în fiecare ${one}` : `la fiecare ${roCount(interval, one, many)}`;
}

export const HOME_CATEGORIES: HomeCategoryConfig[] = [
  {
    key: "documents",
    label: "Documente",
    icon: "document-text-outline",
    fields: [
      { key: "title", label: "Titlu", placeholder: "ex. Certificat de impozit" },
      { key: "documentType", label: "Tip document", placeholder: "ex. RCA" },
      // Both validity dates are required (same rule as Car documents):
      // urgency, "Expiră pe", and a renewal's next period all come from
      // them -- never from the day the document was entered.
      { key: "issueDate", label: "Emis pe", placeholder: "", type: "date" },
      { key: "expiryDate", label: "Expiră pe", placeholder: "", type: "date", notBefore: "issueDate" },
    ],
    submitLabel: "Adaugă documentul",
    emptyLabel: "Niciun document încă.",
    entries: (data) => data.documentEntries,
    buildEntry: (values, existing?: HomeDocumentEntry): HomeDocumentEntry => ({
      id: existing?.id ?? makeId("doc"),
      date: existing?.date ?? today(),
      documentType: values.documentType || "Other",
      title: values.title,
      issuer: existing?.issuer,
      issueDate: dateValue(values, "issueDate", existing?.issueDate),
      expiryDate: dateValue(values, "expiryDate", existing?.expiryDate),
    }),
    valuesFromEntry: (entry: HomeDocumentEntry) => ({
      title: entry.title,
      documentType: entry.documentType,
      issueDate: entry.issueDate ?? "",
      expiryDate: entry.expiryDate ?? "",
    }),
    rows: (data) => {
      const now = new Date();
      return data.documentEntries.map((entry) => {
        const remaining = entry.expiryDate ? daysUntil(entry.expiryDate, now) : null;
        const tier = remaining !== null ? classifyDocumentUrgencyTier(remaining) : undefined;

        return {
          id: entry.id,
          title: entry.title,
          subtitle: entry.expiryDate
            ? tier
              ? joinParts(entry.documentType, dueSubtitle(remaining!, "Expires"))
              : joinParts(entry.documentType, `expiră pe ${formatDate(entry.expiryDate)}`)
            : entry.documentType,
          urgencyTier: tier,
        };
      });
    },
  },
  {
    key: "expenses",
    label: "Cheltuieli",
    icon: "card-outline",
    fields: [
      { key: "title", label: "Titlu", placeholder: "ex. Reparație acoperiș" },
      { key: "amount", label: "Sumă (lei)", placeholder: "0", nonNegativeNumber: true },
      GUILT_FREE_FIELD,
    ],
    submitLabel: "Adaugă cheltuiala",
    emptyLabel: "Nicio cheltuială încă.",
    entries: (data) => data.expenseEntries,
    buildEntry: (values, existing?: HomeExpenseEntry): HomeExpenseEntry => ({
      id: existing?.id ?? makeId("exp"),
      date: existing?.date ?? today(),
      title: values.title,
      amount: parseLeadingNumber(values.amount) ?? 0,
      notes: existing?.notes,
      guiltFree: values.guiltFree === "true",
    }),
    valuesFromEntry: (entry: HomeExpenseEntry) => ({
      title: entry.title,
      amount: String(entry.amount),
      guiltFree: entry.guiltFree ? "true" : "false",
    }),
    rows: (data) =>
      data.expenseEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        subtitle: formatDate(entry.date),
        amount: `${entry.amount.toLocaleString("ro-RO")} lei`,
        guiltFree: entry.guiltFree,
      })),
  },
  {
    key: "maintenance",
    label: "Mentenanță",
    icon: "construct-outline",
    fields: [
      { key: "service", label: "Lucrare", placeholder: "ex. Verificare instalație" },
      { key: "price", label: "Preț (lei)", placeholder: "0", nonNegativeNumber: true },
      { key: "date", label: "Data", placeholder: "", type: "date", required: false },
      { key: "isRecurring", label: "Se repetă", placeholder: "Recurent", type: "toggle", required: false },
      {
        key: "recurrenceFrequency",
        label: "Se repetă la",
        placeholder: "",
        type: "select",
        required: false,
        defaultValue: "monthly",
        showWhen: "isRecurring",
        options: [
          { value: "weekly", label: "Săptămâni" },
          { value: "monthly", label: "Luni" },
          { value: "yearly", label: "Ani" },
        ],
      },
      {
        key: "recurrenceInterval",
        label: "La fiecare",
        placeholder: "1",
        suffix: (values) => {
          const n = Number(values.recurrenceInterval || 1);
          const unit = ({ weekly: ["săptămână", "săptămâni"], monthly: ["lună", "luni"], yearly: ["an", "ani"] } as Record<string, [string, string]>)[values.recurrenceFrequency || "monthly"];
          return unit ? (n === 1 ? unit[0] : unit[1]) : undefined;
        },
        required: false,
        showWhen: "isRecurring",
        keyboardType: "numeric",
      },
      GUILT_FREE_IF_SET,
    ],
    submitLabel: "Adaugă lucrarea",
    emptyLabel: "Nicio lucrare de mentenanță încă.",
    // Resolved-and-inactive (a non-recurring entry, once resolved --
    // see resolveEntry below) drops out of the active list entirely,
    // rather than lingering marked "done".
    entries: (data) => data.maintenanceEntries.filter((entry) => !entry.completed),
    buildEntry: (values, existing?: HomeMaintenanceEntry): HomeMaintenanceEntry => {
      const isRecurring = values.isRecurring === "true";
      // Always has a date (today when none is picked); the picker offers
      // "Azi", not "Fără dată".
      const date = dateValue(values, "date", existing?.date) || today();
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
        // Carried forward like `completed`: the mapper always sends
        // completed_at, so dropping it here would wipe a resolved
        // entry's completion date on its next edit.
        completedAt: existing?.completedAt,
        // Preserved, never derived from the form -- only
        // HomeMaintenanceResolveSheet's own confirm (via
        // handleMaintenanceResolveConfirm) is allowed to append to
        // this. An unrelated edit (price, service name) must not wipe
        // out every resolve logged so far.
        spendHistory: existing?.spendHistory,
        guiltFree: values.guiltFree === "true",
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
      return { ...existing, completed: true, completedAt: new Date().toISOString() };
    },
    valuesFromEntry: (entry: HomeMaintenanceEntry) => ({
      service: entry.service,
      price: String(entry.price),
      date: entry.date,
      isRecurring: entry.isRecurring ? "true" : "false",
      recurrenceFrequency: entry.recurrenceFrequency ?? "monthly",
      recurrenceInterval: entry.recurrenceInterval != null ? String(entry.recurrenceInterval) : "1",
      guiltFree: entry.guiltFree ? "true" : "false",
    }),
    rows: (data) => {
      const now = new Date();
      return data.maintenanceEntries
        .filter((entry) => !entry.completed)
        .map((entry) => {
          // Same window/tier a recurring entry is already flagged with in
          // the Restanțe widget (getRecurringTaskWarnings) and the tile's
          // own dots (getMaintenanceTierCounts) -- gated only on
          // nextDueDate existing (not also entry.isRecurring, which
          // those two don't check either) so this can never disagree
          // with either of them on which entries count as urgent.
          const remaining = entry.nextDueDate ? daysUntil(entry.nextDueDate, now) : null;
          const taskTier = remaining !== null ? classifyTaskUrgencyTier(remaining) : undefined;

          return {
            id: entry.id,
            title: entry.service,
            // joinParts: an empty description used to leave a leading
            // ", în 1 zi" on every row without one.
            subtitle: entry.isRecurring
              ? entry.nextDueDate
                ? taskTier
                  ? joinParts(entry.description, dueSubtitle(remaining!, "Due"))
                  : joinParts(entry.description, `următoarea pe ${formatDate(entry.nextDueDate)}`)
                : joinParts(entry.description, everyLabel(entry.recurrenceInterval ?? 1, entry.recurrenceFrequency ?? "monthly"))
              : joinParts(entry.description, formatDate(entry.date)),
            amount: `${entry.price.toLocaleString("ro-RO")} lei`,
            isRecurring: entry.isRecurring,
            urgencyTier: taskTier,
            guiltFree: entry.guiltFree,
          };
        });
    },
  },
  {
    key: "recurring",
    label: "Facturi",
    icon: "repeat-outline",
    fields: [
      { key: "title", label: "Titlu", placeholder: "ex. Abonament internet" },
      { key: "amount", label: "Sumă (lei)", placeholder: "0", nonNegativeNumber: true },
      { key: "nextDueDate", label: "Următoarea plată", placeholder: "", type: "date", required: false },
      {
        key: "frequency",
        label: "Frecvență",
        placeholder: "",
        type: "select",
        required: false,
        defaultValue: "monthly",
        options: [
          { value: "weekly", label: "Săptămânal" },
          { value: "monthly", label: "Lunar" },
          { value: "yearly", label: "Anual" },
        ],
      },
      GUILT_FREE_IF_SET,
    ],
    submitLabel: "Adaugă factura",
    emptyLabel: "Nicio factură încă.",
    entries: (data) => data.recurringEntries,
    buildEntry: (values, existing?: HomeRecurringEntry): HomeRecurringEntry => ({
      id: existing?.id ?? makeId("rec"),
      title: values.title,
      category: existing?.category ?? "Other",
      amount: parseLeadingNumber(values.amount) ?? 0,
      frequency: (values.frequency as HomeRecurringEntry["frequency"]) || existing?.frequency || "monthly",
      // A bill always has a next payment (today when none is picked).
      nextDueDate: dateValue(values, "nextDueDate", existing?.nextDueDate) || today(),
      notes: existing?.notes,
      // Preserved, never derived from the form -- only resolveCategoryEntry
      // appends to this. An unrelated edit (amount, title) must not wipe
      // out every payment logged so far.
      spendHistory: existing?.spendHistory,
      guiltFree: values.guiltFree === "true",
    }),
    // Every entry here recurs by definition (there's no on/off toggle
    // like Maintenance's "Recurent") -- Resolved always just advances
    // nextDueDate one cycle forward and stays active, never retires.
    resolveEntry: (existing: HomeRecurringEntry): HomeRecurringEntry => ({
      ...existing,
      nextDueDate: addRecurrenceInterval(existing.nextDueDate, existing.frequency, 1),
    }),
    valuesFromEntry: (entry: HomeRecurringEntry) => ({
      title: entry.title,
      amount: String(entry.amount),
      nextDueDate: entry.nextDueDate,
      frequency: entry.frequency,
      guiltFree: entry.guiltFree ? "true" : "false",
    }),
    rows: (data) => {
      const now = new Date();
      return data.recurringEntries.map((entry) => {
        // Same window/tier already computed for this entry in the
        // Restanțe warnings widget (getRecurringTaskWarnings) -- every
        // Recurring entry always has a nextDueDate (no isRecurring
        // guard needed, unlike Maintenance), so this always runs.
        const remaining = daysUntil(entry.nextDueDate, now);
        const taskTier = classifyTaskUrgencyTier(remaining);

        return {
          id: entry.id,
          title: entry.title,
          subtitle: taskTier
            ? `${FREQUENCY_LABEL[entry.frequency] ?? entry.frequency}, ${dueSubtitle(remaining, "Due")}`
            : `${FREQUENCY_LABEL[entry.frequency] ?? entry.frequency}, următoarea pe ${formatDate(entry.nextDueDate)}`,
          amount: `${entry.amount.toLocaleString("ro-RO")} lei`,
          isRecurring: true,
          urgencyTier: taskTier,
          guiltFree: entry.guiltFree,
        };
      });
    },
  },
  {
    key: "supplies",
    label: "Provizii",
    icon: "basket-outline",
    fields: [
      { key: "name", label: "Nume", placeholder: "ex. Hârtie igienică" },
      { key: "quantity", label: "Cantitate", placeholder: "ex. 12", nonNegativeNumber: true },
    ],
    submitLabel: "Adaugă provizia",
    emptyLabel: "Nicio provizie urmărită încă.",
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
      unit: normalizeNumberText(values.quantity).replace(LEADING_NUMBER, "").trim() || existing?.unit || "pcs",
      lastRestockedDate: existing?.lastRestockedDate,
      notes: existing?.notes,
    }),
    valuesFromEntry: (entry: HomeSupplyEntry) => ({
      name: entry.name,
      quantity: `${entry.quantity} ${roUnit(entry.unit)}`,
    }),
    rows: (data) =>
      data.supplyEntries.map((entry) => ({
        id: entry.id,
        title: entry.name,
        subtitle: `${entry.category}, ${entry.quantity} ${roUnit(entry.unit)}`,
      })),
  },
];
