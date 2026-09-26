import { api } from "@/lib/api";
import type {
  HomeDocumentEntry,
  HomeExpenseEntry,
  HomeMaintenanceEntry,
  HomeRecurringEntry,
  HomeSupplyEntry,
  HomeTaskEntry,
  SupplyRestockEvent,
} from "@/lib/spaces/home/home.types";
import { isSavedItemId } from "@/lib/spaces/itemSync";

/**
 * Same reasoning as lib/spaces/car/carItems.ts (read that file's doc
 * comment first): Home's 5 categories were frontend-only local state
 * (home.mock.ts's initialHomeData, mutated in memory in
 * app/(tabs)/[id].tsx) -- nothing was ever sent to the server, and the
 * dashboard didn't even have a setter for it. There's no dedicated table
 * for any of these (unlike home_profiles) -- instead this reuses the
 * generic `items` table + /api/items CRUD, exactly like Car already does.
 * The 5 pairs below are the only place that knows how a HomeXEntry maps
 * onto an Item -- app/(tabs)/[id].tsx's handle*Save functions call the
 * *ToItemBody side, loadHomeItems() (called once from the same file's
 * load()) calls the itemTo* side to rebuild homeData.*Entries from what's
 * actually saved.
 */

export { isSavedItemId };

const TYPE_DOCUMENT = "home_document";
const TYPE_EXPENSE = "home_expense";
const TYPE_MAINTENANCE = "home_maintenance";
const TYPE_RECURRING = "home_recurring";
const TYPE_SUPPLY = "home_supply";
const TYPE_TASK = "home_task";

// -------------------------------------------------------------------
// Documents
// -------------------------------------------------------------------

export function documentEntryToItemBody(spaceId: string | number, entry: HomeDocumentEntry) {
  return {
    space_id: spaceId,
    type: TYPE_DOCUMENT,
    title: entry.title,
    due_at: entry.date,
    metadata: {
      documentType: entry.documentType ?? null,
      issuer: entry.issuer ?? null,
      issueDate: entry.issueDate ?? null,
      expiryDate: entry.expiryDate ?? null,
    },
  };
}

function itemToDocumentEntry(item: any): HomeDocumentEntry {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    date: item.due_at ?? item.created_at,
    documentType: meta.documentType ?? "Other",
    title: item.title,
    issuer: meta.issuer ?? undefined,
    issueDate: meta.issueDate ?? undefined,
    expiryDate: meta.expiryDate ?? undefined,
  };
}

// -------------------------------------------------------------------
// Expenses
// -------------------------------------------------------------------

export function expenseEntryToItemBody(spaceId: string | number, entry: HomeExpenseEntry) {
  return {
    space_id: spaceId,
    type: TYPE_EXPENSE,
    title: entry.title,
    amount: entry.amount ?? null,
    currency: entry.amount != null ? "RON" : null,
    due_at: entry.date,
    metadata: {
      notes: entry.notes ?? null,
    },
  };
}

function itemToExpenseEntry(item: any): HomeExpenseEntry {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    date: item.due_at ?? item.created_at,
    title: item.title,
    amount: item.amount != null ? Number(item.amount) : 0,
    notes: meta.notes ?? undefined,
  };
}

// -------------------------------------------------------------------
// Maintenance
// -------------------------------------------------------------------

// due_at doubles as the recurrence anchor when isRecurring is on -- the
// same due_at + recurrence + RecurrenceProjector machinery home_recurring
// bills already use, so "done on this date, every N weeks/months/years"
// projects forward to a real next-due date instead of needing a separate
// nextDueDate input. recurrenceInterval has no dedicated column (like
// every other type-specific flag on Item), so it lives in metadata --
// RecurrenceProjector reads it from there and defaults to 1 for every
// recurring item that never set it (home_recurring, custom_event).
export function maintenanceEntryToItemBody(spaceId: string | number, entry: HomeMaintenanceEntry) {
  return {
    space_id: spaceId,
    type: TYPE_MAINTENANCE,
    title: entry.service,
    amount: entry.price ?? null,
    currency: entry.price != null ? "RON" : null,
    due_at: entry.date,
    status: entry.completed ? "done" : "pending",
    recurrence: entry.isRecurring ? entry.recurrenceFrequency ?? "monthly" : null,
    metadata: {
      description: entry.description ?? null,
      provider: entry.provider ?? null,
      nextDueDate: entry.nextDueDate ?? null,
      recurrenceInterval: entry.isRecurring ? entry.recurrenceInterval ?? 1 : null,
    },
  };
}

function itemToMaintenanceEntry(item: any): HomeMaintenanceEntry {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    date: item.due_at ?? item.created_at,
    service: item.title,
    description: meta.description ?? "",
    price: item.amount != null ? Number(item.amount) : 0,
    provider: meta.provider ?? undefined,
    nextDueDate: meta.nextDueDate ?? undefined,
    isRecurring: !!item.recurrence,
    recurrenceFrequency: (item.recurrence as HomeMaintenanceEntry["recurrenceFrequency"]) ?? undefined,
    recurrenceInterval: meta.recurrenceInterval != null ? Number(meta.recurrenceInterval) : undefined,
    completed: item.status === "done",
  };
}

// -------------------------------------------------------------------
// Recurring
// -------------------------------------------------------------------

export function recurringEntryToItemBody(spaceId: string | number, entry: HomeRecurringEntry) {
  return {
    space_id: spaceId,
    type: TYPE_RECURRING,
    title: entry.title,
    amount: entry.amount ?? null,
    currency: entry.amount != null ? "RON" : null,
    category: entry.category,
    recurrence: entry.frequency,
    due_at: entry.nextDueDate,
    metadata: {
      notes: entry.notes ?? null,
    },
  };
}

function itemToRecurringEntry(item: any): HomeRecurringEntry {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    title: item.title,
    category: item.category ?? "Other",
    amount: item.amount != null ? Number(item.amount) : 0,
    frequency: (item.recurrence as HomeRecurringEntry["frequency"]) ?? "monthly",
    nextDueDate: item.due_at ?? item.created_at,
    notes: meta.notes ?? undefined,
  };
}

// -------------------------------------------------------------------
// Supplies
// -------------------------------------------------------------------

// spaceId is optional so Grocery can write back a restock event to a
// supply it doesn't own the space context for (see
// GroceryDashboard.tsx's logSupplyRestock) -- omitting space_id from
// the body just leaves the item's space untouched (see
// ItemController::update), unlike Home's own calls here which always
// pass their current space id.
export function supplyEntryToItemBody(spaceId: string | number | undefined, entry: HomeSupplyEntry) {
  return {
    ...(spaceId != null ? { space_id: spaceId } : {}),
    type: TYPE_SUPPLY,
    title: entry.name,
    category: entry.category,
    due_at: entry.lastRestockedDate ?? null,
    metadata: {
      quantity: entry.quantity ?? null,
      unit: entry.unit ?? null,
      notes: entry.notes ?? null,
      restockHistory: entry.restockHistory ?? [],
    },
  };
}

// Exported (unlike the other itemTo* mappers here) so Grocery's shopping
// list can read the user's Home supplies cross-space -- GET /api/items
// with only `type` (no space_id) already returns every item of that
// type the user owns regardless of which space it lives in, see
// ItemController::index -- and reuse the exact same mapping instead of
// duplicating it, for the restock-suggestion feature (see
// GroceryDashboard.tsx's suggestion popup).
// Tolerates the old restockHistory shape (plain date strings, no
// quantity) from before quantity-weighted estimation was added -- falls
// back to the supply's current quantity so old data doesn't just vanish.
function normalizeRestockHistory(raw: any, fallbackQuantity: number): SupplyRestockEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (typeof e === "string") return { date: e, quantity: fallbackQuantity };
      if (e && typeof e === "object" && e.date) {
        return { date: e.date, quantity: e.quantity != null ? Number(e.quantity) : fallbackQuantity };
      }
      return null;
    })
    .filter((e): e is SupplyRestockEvent => e != null);
}

export function itemToSupplyEntry(item: any): HomeSupplyEntry {
  const meta = item.metadata ?? {};
  const quantity = meta.quantity != null ? Number(meta.quantity) : 1;
  return {
    id: String(item.id),
    name: item.title,
    category: item.category ?? "Other",
    quantity,
    unit: meta.unit ?? "pcs",
    lastRestockedDate: item.due_at ?? undefined,
    notes: meta.notes ?? undefined,
    spaceId: item.space_id != null ? String(item.space_id) : undefined,
    restockHistory: normalizeRestockHistory(meta.restockHistory, quantity),
  };
}

// -------------------------------------------------------------------
// Tasks
// -------------------------------------------------------------------

// Notes maps straight onto Item.notes (a real column) instead of
// metadata -- unlike the categories above, a task's notes has no other
// field it could collide with, so there's no reason to nest it.
// Price maps onto amount/currency, same as Maintenance -- so a resolved
// purchase task rolls into Item::SPENDING_TYPES the same way a
// maintenance visit's price does, no separate aggregation needed.
export function taskEntryToItemBody(spaceId: string | number, entry: HomeTaskEntry) {
  return {
    space_id: spaceId,
    type: TYPE_TASK,
    title: entry.title,
    due_at: entry.dueDate ?? null,
    status: entry.completed ? "done" : "pending",
    completed_at: entry.completedAt ?? null,
    amount: entry.price ?? null,
    currency: entry.price != null ? "RON" : null,
    notes: entry.notes ?? null,
    metadata: {
      isPurchase: entry.isPurchase ?? false,
      isRecurring: entry.isRecurring ?? false,
      recurrenceFrequency: entry.recurrenceFrequency ?? null,
    },
  };
}

function itemToTaskEntry(item: any): HomeTaskEntry {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    title: item.title,
    dueDate: item.due_at ?? undefined,
    completed: item.status === "done",
    completedAt: item.completed_at ?? undefined,
    notes: item.notes ?? undefined,
    isPurchase: meta.isPurchase ?? false,
    price: item.amount != null ? Number(item.amount) : undefined,
    isRecurring: meta.isRecurring ?? false,
    recurrenceFrequency: meta.recurrenceFrequency ?? undefined,
  };
}

// -------------------------------------------------------------------
// Load all 6 categories for a Home space in one request, newest first.
// -------------------------------------------------------------------

export async function loadHomeItems(spaceId: string | number) {
  const items = await api.listItems({ space_id: spaceId });

  const byType = (type: string) =>
    items
      .filter((item) => item.type === type)
      .sort(
        (a, b) =>
          new Date(b.due_at ?? b.created_at).getTime() -
          new Date(a.due_at ?? a.created_at).getTime(),
      );

  return {
    documentEntries: byType(TYPE_DOCUMENT).map(itemToDocumentEntry),
    expenseEntries: byType(TYPE_EXPENSE).map(itemToExpenseEntry),
    maintenanceEntries: byType(TYPE_MAINTENANCE).map(itemToMaintenanceEntry),
    recurringEntries: byType(TYPE_RECURRING).map(itemToRecurringEntry),
    supplyEntries: byType(TYPE_SUPPLY).map(itemToSupplyEntry),
    taskEntries: byType(TYPE_TASK).map(itemToTaskEntry),
  };
}
