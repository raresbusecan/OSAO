import { api } from "@/lib/api";
import type {
  CarDocumentEntry,
  CarExpenseEntry,
  CarFuelEntry,
  CarMaintenanceEntry,
} from "@/lib/spaces/car/car.types";

/**
 * Fuel/Maintenance/Documents/Expenses entries were frontend-only local
 * state (car.mock.ts's initialCarData, mutated in memory via setCarData in
 * app/(tabs)/[id].tsx) -- nothing was ever sent to the server, so every
 * entry vanished on refresh. There's no dedicated table for any of these
 * (unlike car_profiles/home_profiles, added the same day) -- instead this
 * reuses the generic `items` table + /api/items CRUD that already existed
 * (backend/app/Http/Controllers/Api/ItemController.php, user- and
 * space-scoped, with a free-form `metadata` JSON column) rather than
 * building 4 more dedicated tables for what's fundamentally the same shape
 * (a dated, priced record attached to a space). The 4 functions below are
 * the only place that knows how a CarFuelEntry etc. maps onto an Item --
 * app/(tabs)/[id].tsx's handle*Save functions call the *ToItemBody side,
 * loadCarItems() (called once from the same file's load()) calls the
 * itemTo* side to rebuild carData.*Entries from what's actually saved.
 */

const TYPE_FUEL = "car_fuel";
const TYPE_MAINTENANCE = "car_maintenance";
const TYPE_DOCUMENT = "car_document";
const TYPE_EXPENSE = "car_expense";

// -------------------------------------------------------------------
// Fuel
// -------------------------------------------------------------------

export function fuelEntryToItemBody(spaceId: string | number, entry: CarFuelEntry) {
  return {
    space_id: spaceId,
    type: TYPE_FUEL,
    title: entry.station?.trim() || "Fuel fill-up",
    amount: entry.total_paid ?? null,
    currency: entry.total_paid != null ? "RON" : null,
    due_at: entry.date,
    metadata: {
      liters: entry.liters ?? null,
      odometer: entry.odometer ?? null,
      level_before: entry.level_before ?? null,
      level_after: entry.level_after ?? null,
      station: entry.station ?? null,
    },
  };
}

function itemToFuelEntry(item: any): CarFuelEntry {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    date: item.due_at ?? item.created_at,
    liters: meta.liters ?? undefined,
    total_paid: item.amount != null ? Number(item.amount) : undefined,
    odometer: meta.odometer ?? undefined,
    level_before: meta.level_before ?? undefined,
    level_after: meta.level_after ?? undefined,
    station: meta.station ?? undefined,
  };
}

// -------------------------------------------------------------------
// Maintenance
// -------------------------------------------------------------------

export function maintenanceEntryToItemBody(spaceId: string | number, entry: CarMaintenanceEntry) {
  return {
    space_id: spaceId,
    type: TYPE_MAINTENANCE,
    title: entry.service,
    amount: entry.price ?? null,
    currency: entry.price != null ? "RON" : null,
    due_at: entry.date,
    // Only set explicitly when archiving (see archiveMaintenanceEntry) --
    // omitted here so a normal save/edit never accidentally resets an
    // already-archived entry back to "pending".
    metadata: {
      description: entry.description ?? null,
      odometer: entry.odometer ?? null,
      provider: entry.provider ?? null,
      nextServiceOdometer: entry.nextServiceOdometer ?? null,
      renewedFromId: entry.renewedFromId ?? null,
    },
  };
}

function itemToMaintenanceEntry(item: any): CarMaintenanceEntry {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    date: item.due_at ?? item.created_at,
    service: item.title,
    description: meta.description ?? "",
    price: item.amount != null ? Number(item.amount) : 0,
    odometer: meta.odometer ?? 0,
    provider: meta.provider ?? undefined,
    nextServiceOdometer: meta.nextServiceOdometer ?? undefined,
    archived: item.status === "archived",
    renewedFromId: meta.renewedFromId ?? undefined,
  };
}

/** Archives the entry a renewal was created from -- see
 * CarDashboard.tsx's handleDocumentSave/handleMaintenanceSave. A plain
 * PUT with just `status` so nothing else about the old entry changes. */
export function archiveMaintenanceEntry(id: string) {
  return api.updateItem(id, { status: "archived" });
}

// -------------------------------------------------------------------
// Documents
// -------------------------------------------------------------------

export function documentEntryToItemBody(spaceId: string | number, entry: CarDocumentEntry) {
  return {
    space_id: spaceId,
    type: TYPE_DOCUMENT,
    title: entry.title,
    amount: entry.price ?? null,
    currency: entry.price != null ? "RON" : null,
    due_at: entry.date,
    metadata: {
      documentType: entry.documentType,
      issuer: entry.issuer ?? null,
      issueDate: entry.issueDate ?? null,
      expiryDate: entry.expiryDate ?? null,
      notes: entry.notes ?? null,
      renewedFromId: entry.renewedFromId ?? null,
    },
  };
}

function itemToDocumentEntry(item: any): CarDocumentEntry {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    date: item.due_at ?? item.created_at,
    documentType: meta.documentType ?? "Other",
    title: item.title,
    issuer: meta.issuer ?? undefined,
    issueDate: meta.issueDate ?? undefined,
    expiryDate: meta.expiryDate ?? undefined,
    price: item.amount != null ? Number(item.amount) : undefined,
    notes: meta.notes ?? undefined,
    archived: item.status === "archived",
    renewedFromId: meta.renewedFromId ?? undefined,
  };
}

/** Archives the entry a renewal was created from -- see
 * CarDashboard.tsx's handleDocumentSave/handleMaintenanceSave. A plain
 * PUT with just `status` so nothing else about the old entry changes. */
export function archiveDocumentEntry(id: string) {
  return api.updateItem(id, { status: "archived" });
}

// -------------------------------------------------------------------
// Expenses
// -------------------------------------------------------------------

export function expenseEntryToItemBody(spaceId: string | number, entry: CarExpenseEntry) {
  return {
    space_id: spaceId,
    type: TYPE_EXPENSE,
    title: entry.title,
    amount: entry.amount,
    currency: "RON",
    category: entry.category,
    due_at: entry.date,
    metadata: {
      odometer: entry.odometer ?? null,
      provider: entry.provider ?? null,
      notes: entry.notes ?? null,
    },
  };
}

function itemToExpenseEntry(item: any): CarExpenseEntry {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    date: item.due_at ?? item.created_at,
    category: item.category ?? "Other",
    title: item.title,
    amount: item.amount != null ? Number(item.amount) : 0,
    odometer: meta.odometer ?? undefined,
    provider: meta.provider ?? undefined,
    notes: meta.notes ?? undefined,
  };
}

// -------------------------------------------------------------------
// Load all 4 categories for a Car space in one request, newest first.
// -------------------------------------------------------------------

export async function loadCarItems(spaceId: string | number) {
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
    fuelEntries: byType(TYPE_FUEL).map(itemToFuelEntry),
    maintenanceEntries: byType(TYPE_MAINTENANCE).map(itemToMaintenanceEntry),
    documentEntries: byType(TYPE_DOCUMENT).map(itemToDocumentEntry),
    expenseEntries: byType(TYPE_EXPENSE).map(itemToExpenseEntry),
  };
}

/** A client-generated placeholder id (see CarFuelForm.tsx etc.) looks like
 * "fuel-<timestamp>" -- never a bare number. A real, already-saved item's
 * id is the numeric database id (as a string, via itemTo*Entry above). Used
 * to decide create vs. update when a *Save handler fires. */
export function isSavedItemId(id: string): boolean {
  return /^\d+$/.test(id);
}
