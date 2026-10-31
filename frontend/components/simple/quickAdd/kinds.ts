import type { SpaceKind } from "@/lib/spaces/spaceProfile";
import type { CarDocumentEntry, CarExpenseEntry, CarFuelEntry, CarMaintenanceEntry } from "@/lib/spaces/car/car.types";
import type { HomeExpenseEntry, HomeRecurringEntry, HomeSupplyEntry, HomeTaskEntry } from "@/lib/spaces/home/home.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { MAX_GROCERY_LISTS, type GroceryCategory, type GroceryItem, type GroceryList } from "@/lib/spaces/grocery/grocery.types";
import { findGroceryListByName } from "@/lib/spaces/grocery/grocery.calculations";
import {
  documentEntryToItemBody as carDocumentBody,
  expenseEntryToItemBody as carExpenseBody,
  fuelEntryToItemBody,
  maintenanceEntryToItemBody,
} from "@/lib/spaces/car/carItems";
import {
  expenseEntryToItemBody as homeExpenseBody,
  recurringEntryToItemBody,
  supplyEntryToItemBody,
  taskEntryToItemBody,
} from "@/lib/spaces/home/homeItems";
import { expenseEntryToItemBody as expensesSpaceBody } from "@/lib/spaces/expenses/expensesItems";
import { groceryItemToItemBody, groceryListToItemBody, groceryTripToItemBody } from "@/lib/spaces/grocery/groceryItems";
import { HOME_CATEGORIES } from "@/components/spaces/home/homeCategoryConfig";
import { validateFuelEntry } from "@/lib/spaces/car/validation/fuel.validation";
import { validateMaintenanceEntry } from "@/lib/spaces/car/validation/maintenance.validation";
import { getLatestFuelEntry } from "@/lib/spaces/car/utils/fuel.utils";
import { formatDateInput, parseDateInput } from "@/lib/spaces/car/utils/dateInput";
import { NON_RECURRING_MAINTENANCE_TYPES } from "@/lib/spaces/car/calculations/dashboard.calculations";
import { parseLocaleNumber } from "@/lib/format";

/**
 * orgOS Simplu's "Adaugă" sheet: what each kind chip saves, and how. The
 * RULE here: every kind builds the SAME entry object its full-app form
 * builds and converts it with the SAME *ToItemBody helper the full app's
 * save calls (app/(tabs)/[id].tsx's handle*Save, GroceryDashboard), so a
 * quick-added record is indistinguishable from one added the long way.
 * Where the form's own logic isn't exported (maintenance types/auto next
 * date, document/expense type lists) it is mirrored here with a pointer
 * to the original -- keep the two in step.
 */

export type QuickKind =
  | "car_fuel"
  | "car_service"
  | "car_document"
  | "car_expense"
  | "home_bill"
  | "home_task"
  | "home_supply"
  | "home_expense"
  | "grocery_list"
  | "grocery_item"
  | "grocery_trip"
  | "expense";

export const KINDS_BY_SPACE: Record<Exclude<SpaceKind, "other">, { key: QuickKind; label: string }[]> = {
  car: [
    { key: "car_fuel", label: "Alimentare" },
    { key: "car_service", label: "Service" },
    { key: "car_document", label: "Document" },
    { key: "car_expense", label: "Altă cheltuială" },
  ],
  home: [
    { key: "home_bill", label: "Factură" },
    { key: "home_task", label: "Sarcină" },
    // No "Provizie": supplies (stock, restock alerts) are Complet only. The
    // home_supply form code below is kept, just not offered here.
    { key: "home_expense", label: "Altă cheltuială" },
  ],
  // Only "Listă nouă" (user decision 2026-10-15): products go on a list
  // from the Cumpărături screen's own bar, and a trip's price from
  // "Am terminat cumpărăturile". The grocery_item / grocery_trip form code
  // below is kept, just not offered here (same as home_supply).
  grocery: [{ key: "grocery_list", label: "Listă nouă" }],
  expenses: [{ key: "expense", label: "Cheltuială" }],
};

/** The "Detalii (...)" expander's label; null = the kind has no extra fields. */
export const DETAILS_LABEL: Record<QuickKind, string | null> = {
  car_fuel: "Detalii (litri, kilometraj, benzinărie)",
  car_service: "Detalii (kilometraj, service, garanție, notă)",
  car_document: "Detalii (titlu, emitent, emis pe, notă)",
  car_expense: "Detalii (titlu, kilometraj, furnizor, notă)",
  home_bill: "Detalii (frecvență)",
  home_task: "Detalii (cumpărare, repetare, notă)",
  home_supply: "Detalii (categorie, notă)",
  home_expense: null,
  grocery_list: null,
  grocery_item: "Detalii (cantitate)",
  grocery_trip: null,
  expense: "Detalii (notă)",
};

/** How the amount field behaves per kind ("none" hides it). */
export const AMOUNT_MODE: Record<QuickKind, "required" | "optional" | "none"> = {
  car_fuel: "required",
  car_service: "required", // 0 allowed only "În garanție" (validateMaintenanceEntry)
  car_document: "optional",
  car_expense: "required",
  home_bill: "required",
  home_task: "none", // price is asked only when the task is resolved
  home_supply: "none",
  home_expense: "required",
  grocery_list: "none",
  grocery_item: "none",
  grocery_trip: "required", // a trip record only exists with a price
  expense: "required",
};

/** The date field per kind: label, picker range, and what "no pick" means. */
export const DATE_MODE: Record<
  QuickKind,
  { label: string; range: "past" | "future" | "any"; empty: "today" | "none" | "required" } | null
> = {
  car_fuel: { label: "Când", range: "past", empty: "today" },
  car_service: { label: "Când", range: "past", empty: "today" },
  car_document: { label: "Expiră pe", range: "any", empty: "required" },
  car_expense: { label: "Când", range: "past", empty: "today" },
  home_bill: { label: "Scadență", range: "any", empty: "today" },
  home_task: { label: "Termen", range: "any", empty: "none" },
  home_supply: null,
  home_expense: { label: "Când", range: "past", empty: "today" },
  grocery_list: null,
  grocery_item: null,
  grocery_trip: { label: "Când", range: "past", empty: "today" },
  expense: { label: "Când", range: "past", empty: "today" },
};

// Mirrors CarMaintenanceForm.tsx's MAINTENANCE_TYPES (stored English key,
// shown via maintenanceLabel) and AUTO_DATE_INTERVAL_MONTHS.
export const MAINTENANCE_TYPES = ["Oil Change", "Filters", "Brakes", "Tires", "Battery", "Fluids", "Service", "Repair"];
const AUTO_DATE_INTERVAL_MONTHS: Record<string, number> = { "Oil Change": 12, Battery: 60 };
/** Simplu's suggested km to the next oil change (user decision
 * 2026-10-15): "Următorul schimb la" = Kilometraj + this, editable. */
export const OIL_CHANGE_KM_INTERVAL = 10_000;
// Mirrors CarDocumentForm.tsx's DOCUMENT_TYPES.
export const DOCUMENT_TYPES = ["RCA", "CASCO", "ITP", "Rovinieta", "Tax"];
/** Display names: the types are stored as typed ("Rovinieta", "Tax"). */
export const DOC_TYPE_LABEL: Record<string, string> = {
  RCA: "RCA",
  CASCO: "CASCO",
  ITP: "ITP",
  Rovinieta: "Rovinietă",
  Tax: "Impozit",
};
// Mirrors CarExpenseForm.tsx's EXPENSE_CATEGORIES.
export const CAR_EXPENSE_CATEGORIES = ["Parcare", "Amenzi", "Spălătorie", "Accesorii", "Taxe de drum", "Altele"];

export function maintenanceHasNextKm(service: string): boolean {
  return !!service && !NON_RECURRING_MAINTENANCE_TYPES.has(service);
}

export type QuickForm = {
  amount: string;
  /** ISO (local midnight from DatePickerSheet); null = the kind's default. */
  date: string | null;
  title: string;
  /** Maintenance type / document type / car expense category. */
  choice: string;
  listId: string;
  // Detalii
  liters: string;
  odometer: string;
  station: string;
  provider: string;
  notes: string;
  nextKm: string;
  underWarranty: boolean;
  issuer: string;
  issueDate: string | null;
  /** Home supply quantity (the form defaults it to "1"). */
  quantity: string;
  unit: string;
  /** Grocery product's free-form quantity ("1 kg"), empty by default. */
  groceryQuantity: string;
  category: string;
  isPurchase: boolean;
  isRecurring: boolean;
  taskFrequency: "daily" | "weekly" | "monthly" | null;
  billFrequency: "weekly" | "monthly" | "yearly";
};

export function emptyForm(amount = ""): QuickForm {
  return {
    amount,
    date: null,
    title: "",
    choice: "",
    listId: "",
    liters: "",
    odometer: "",
    station: "",
    provider: "",
    notes: "",
    nextKm: "",
    underWarranty: false,
    issuer: "",
    issueDate: null,
    quantity: "1",
    unit: "",
    groceryQuantity: "",
    category: "",
    isPurchase: false,
    isRecurring: false,
    taskFrequency: null,
    billFrequency: "monthly",
  };
}

export type QuickContext = {
  spaceId: string;
  fuelEntries: CarFuelEntry[];
  groceryLists: GroceryList[];
  groceryCategory: (name: string) => GroceryCategory;
  /** The car's current km (GET /spaces' `odometer` = max(manual, logged));
   * 0 = unknown. A NEW record can't log less. */
  currentOdometer: number;
};

/** A new record's km below the car's current one -> the save error
 * (user decision 2026-10-15: an error on Save, not a warning up front). */
function odometerBelowCurrent(raw: string, ctx: QuickContext): string | null {
  if (!raw.trim() || ctx.currentOdometer <= 0) return null;
  const v = num(raw);
  if (!Number.isFinite(v) || v >= ctx.currentOdometer) return null;
  return `Kilometrajul nu poate fi mai mic decât cel actual (${ctx.currentOdometer.toLocaleString("ro-RO")} km).`;
}

const num = (raw: string) => parseLocaleNumber(raw);
const optNum = (raw: string): number | undefined => {
  if (!raw.trim()) return undefined;
  const v = num(raw);
  return Number.isFinite(v) ? v : undefined;
};
const validAmount = (raw: string, allowZero = false) => {
  if (!raw.trim()) return false;
  const v = num(raw);
  return Number.isFinite(v) && (allowZero ? v >= 0 : v > 0);
};

function sameLocalDay(iso: string, d = new Date()) {
  const a = new Date(iso);
  return a.getFullYear() === d.getFullYear() && a.getMonth() === d.getMonth() && a.getDate() === d.getDate();
}

function localYmd(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The car forms' own date path: "ZZ.LL.AAAA" (DateField) -> ISO. */
const carDateIso = (date: string | null) => parseDateInput(formatDateInput(date ?? new Date()))!;

/** Cheap "can Save be pressed" check (required fields present). Deeper
 * checks run in buildQuickBody and come back as an inline error. */
export function canSave(kind: QuickKind, f: QuickForm, ctx: Pick<QuickContext, "groceryLists">): boolean {
  switch (kind) {
    case "car_fuel":
      return validAmount(f.amount);
    case "car_service":
      if (!f.choice) return false;
      if (f.choice === "Oil Change" && !validAmount(f.odometer)) return false;
      return f.underWarranty || validAmount(f.amount);
    case "car_document":
      return !!f.choice && !!f.date && (!f.amount.trim() || validAmount(f.amount, true));
    case "car_expense":
      return validAmount(f.amount) && !!(f.choice || f.title.trim());
    case "home_bill":
    case "home_expense":
      return !!f.title.trim() && validAmount(f.amount, true);
    case "home_task":
      return !!f.title.trim() && (!f.isRecurring || !!f.taskFrequency);
    case "home_supply":
      return !!f.title.trim() && validAmount(f.quantity, true);
    case "expense":
      return !!f.title.trim() && validAmount(f.amount, true);
    case "grocery_list":
      return !!f.title.trim();
    case "grocery_item":
      return !!f.title.trim() && !!f.listId && ctx.groceryLists.some((l) => l.id === f.listId);
    case "grocery_trip":
      return validAmount(f.amount, true) && !!f.listId && ctx.groceryLists.some((l) => l.id === f.listId);
  }
}

/** Builds the item body exactly like the full app; `error` = a
 * validation message the full form would show. */
export function buildQuickBody(kind: QuickKind, f: QuickForm, ctx: QuickContext): { body: any } | { error: string } {
  const spaceId = ctx.spaceId;
  switch (kind) {
    // CarFuelForm.handleSave -> [id].tsx handleFuelSave
    case "car_fuel": {
      const below = odometerBelowCurrent(f.odometer, ctx);
      if (below) return { error: below };
      const draft: Omit<CarFuelEntry, "id" | "date"> = {
        liters: optNum(f.liters),
        total_paid: optNum(f.amount),
        odometer: optNum(f.odometer),
        station: f.station.trim() || undefined,
        level_before: undefined,
        level_after: undefined,
      };
      const result = validateFuelEntry(draft, getLatestFuelEntry(ctx.fuelEntries));
      if (!result.valid) return { error: result.error ?? "Verifică valorile introduse." };
      const entry: CarFuelEntry = { id: `fuel-${Date.now()}`, date: carDateIso(f.date), ...draft, guiltFree: false };
      return { body: fuelEntryToItemBody(spaceId, entry) };
    }

    // CarMaintenanceForm.handleSave (batch mode, one line) -> handleMaintenanceSave
    case "car_service": {
      const below = odometerBelowCurrent(f.odometer, ctx);
      if (below) return { error: below };
      const dateIso = carDateIso(f.date);
      const months = AUTO_DATE_INTERVAL_MONTHS[f.choice];
      let nextServiceDate: string | undefined;
      if (months !== undefined) {
        const d = new Date(dateIso);
        d.setMonth(d.getMonth() + months);
        nextServiceDate = formatDateInput(d);
      }
      const draft: Omit<CarMaintenanceEntry, "id" | "date"> = {
        service: f.choice,
        description: f.notes.trim(),
        price: f.underWarranty ? 0 : num(f.amount),
        underWarranty: f.underWarranty,
        odometer: f.odometer ? num(f.odometer) : undefined,
        provider: f.provider.trim() || undefined,
        nextServiceOdometer: maintenanceHasNextKm(f.choice) && f.nextKm ? num(f.nextKm) : undefined,
        nextServiceDate,
      };
      const result = validateMaintenanceEntry(draft);
      if (!result.valid) return { error: result.error ?? "Verifică valorile introduse." };
      const entry: CarMaintenanceEntry = { id: `maintenance-${Date.now()}`, date: dateIso, ...draft, guiltFree: false };
      return { body: maintenanceEntryToItemBody(spaceId, entry) };
    }

    // CarDocumentForm.handleSave -> handleDocumentSave. Dates are stored
    // as "ZZ.LL.AAAA" strings (not ISO), like the form's DateFields.
    case "car_document": {
      if (!f.date) return { error: "Alege data expirării." };
      // "Emis pe" stays unset unless the user picks it under Detalii: a
      // made-up "today" would shrink the renewal period documentRenewal
      // derives from issue -> expiry (no issue date = its 12-month default).
      const issueDate = f.issueDate ? formatDateInput(f.issueDate) : undefined;
      const expiryDate = formatDateInput(f.date);
      if (issueDate && parseDateInput(expiryDate)! < parseDateInput(issueDate)!) {
        return { error: "Data expirării nu poate fi înaintea celei de emitere." };
      }
      const price = f.amount.trim() ? num(f.amount) : undefined;
      const entry: CarDocumentEntry = {
        id: `document-${Date.now()}`,
        date: new Date().toISOString(),
        documentType: f.choice,
        // The form pre-fills the title with the type when left untouched.
        title: f.title.trim() || f.choice,
        issuer: f.issuer.trim() || undefined,
        issueDate,
        expiryDate,
        price,
        notes: f.notes.trim() || undefined,
        renewedFromId: undefined,
        guiltFree: false,
      };
      return { body: carDocumentBody(spaceId, entry) };
    }

    // CarExpenseForm.handleSave -> handleExpenseSave
    case "car_expense": {
      const odometer = f.odometer ? num(f.odometer) : undefined;
      if (f.odometer && (odometer === undefined || Number.isNaN(odometer) || odometer <= 0)) {
        return { error: "Introdu un kilometraj valid." };
      }
      const below = odometerBelowCurrent(f.odometer, ctx);
      if (below) return { error: below };
      const entry: CarExpenseEntry = {
        id: `expense-${Date.now()}`,
        date: carDateIso(f.date),
        category: f.choice.trim(),
        // The form pre-fills the title with the category when left untouched.
        title: f.title.trim() || f.choice.trim(),
        amount: num(f.amount),
        odometer,
        provider: f.provider.trim() || undefined,
        notes: f.notes.trim() || undefined,
        guiltFree: false,
      };
      return { body: carExpenseBody(spaceId, entry) };
    }

    // HomeCategoryPage values -> HOME_CATEGORIES "recurring".buildEntry -> handleHomeRecurringSave
    case "home_bill": {
      const values: Record<string, string> = { title: f.title.trim(), amount: f.amount.trim(), frequency: f.billFrequency };
      if (f.date) values.nextDueDate = f.date;
      const entry = category("recurring").buildEntry(values) as HomeRecurringEntry;
      return { body: recurringEntryToItemBody(spaceId, entry) };
    }

    // HOME_CATEGORIES "expenses".buildEntry -> handleHomeExpenseSave. The
    // full form has no date (always today); a picked other day replaces
    // `date` in the same YYYY-MM-DD shape.
    case "home_expense": {
      const entry = category("expenses").buildEntry({ title: f.title.trim(), amount: f.amount.trim() }) as HomeExpenseEntry;
      const dated = f.date && !sameLocalDay(f.date) ? { ...entry, date: localYmd(f.date) } : entry;
      return { body: homeExpenseBody(spaceId, dated) };
    }

    // HomeTaskForm.handleSave -> handleHomeTaskSave
    case "home_task": {
      const entry: HomeTaskEntry = {
        id: `task-${Date.now()}`,
        title: f.title.trim(),
        dueDate: f.date ?? undefined,
        completed: false,
        completedAt: undefined,
        isPurchase: f.isPurchase,
        price: undefined,
        isRecurring: f.isRecurring,
        recurrenceFrequency: f.isRecurring ? f.taskFrequency ?? undefined : undefined,
        notes: f.notes.trim() || undefined,
        spendHistory: undefined,
        guiltFree: undefined,
      };
      return { body: taskEntryToItemBody(spaceId, entry) };
    }

    // HomeSupplyForm.handleSave -> handleHomeSupplySave
    case "home_supply": {
      const entry: HomeSupplyEntry = {
        id: `supply-${Date.now()}`,
        name: f.title.trim(),
        category: f.category.trim() || "Altele",
        quantity: num(f.quantity),
        unit: f.unit.trim() || "buc",
        lastRestockedDate: undefined,
        restockHistory: undefined,
        notes: f.notes.trim() || undefined,
      };
      return { body: supplyEntryToItemBody(spaceId, entry) };
    }

    // ExpensesAddBar -> ExpensesDashboard.handleAdd -> handleExpenseEntrySave
    case "expense": {
      const entry: ExpenseEntry = {
        id: `exp-${Date.now()}`,
        name: f.title.trim(),
        price: num(f.amount),
        date: f.date ?? new Date().toISOString(),
        notes: f.notes.trim() || undefined,
      };
      return { body: expensesSpaceBody(spaceId, entry) };
    }

    // GroceryDashboard.createOrReuseList
    case "grocery_list": {
      if (findGroceryListByName(ctx.groceryLists, f.title)) return { error: "Ai deja o listă cu numele ăsta." };
      if (ctx.groceryLists.length >= MAX_GROCERY_LISTS) {
        return { error: `Poți avea cel mult ${MAX_GROCERY_LISTS} liste. Șterge una ca să creezi alta.` };
      }
      const list: GroceryList = {
        id: `list-${Date.now()}`,
        name: f.title.trim(),
        createdDate: new Date().toISOString().slice(0, 10),
        spaceId: String(spaceId),
      };
      return { body: groceryListToItemBody(spaceId, list) };
    }

    // GroceryQuickAddBar (category guessed from the name) -> GroceryDashboard.handleAdd
    case "grocery_item": {
      const item: GroceryItem = {
        id: `gr-${Date.now()}`,
        listId: f.listId,
        name: f.title.trim(),
        category: ctx.groceryCategory(f.title),
        quantity: f.groceryQuantity.trim() || undefined,
        price: undefined,
        inCart: false,
        addedDate: new Date().toISOString().slice(0, 10),
        linkedSupplyId: undefined,
      };
      return { body: groceryItemToItemBody(spaceId, item) };
    }

    // GroceryFinishShoppingSheet -> handleFinishShopping's trip record
    // (only the spend; the cart and supply restocks are left alone). The
    // helper stamps due_at = now; a picked other day replaces it.
    case "grocery_trip": {
      const list = ctx.groceryLists.find((l) => l.id === f.listId);
      const body: any = groceryTripToItemBody(spaceId, {
        listId: f.listId,
        listName: list?.name ?? "Cumpărături",
        price: num(f.amount),
        guiltFree: false,
      });
      if (f.date && !sameLocalDay(f.date)) body.due_at = f.date;
      return { body };
    }
  }
}

function category(key: string) {
  const c = HOME_CATEGORIES.find((x) => x.key === key);
  if (!c) throw new Error(`Home category "${key}" missing`);
  return c;
}

/** Whether this kind writes spending (Buget's plan cache wants a refresh). */
export const SPENDS: Record<QuickKind, boolean> = {
  car_fuel: true,
  car_service: true,
  car_document: true,
  car_expense: true,
  home_bill: true,
  home_task: false,
  home_supply: false,
  home_expense: true,
  grocery_list: false,
  grocery_item: false,
  grocery_trip: true,
  expense: true,
};
