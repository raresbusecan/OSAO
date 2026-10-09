import { api } from "@/lib/api";
import type { GroceryItem, GroceryList } from "@/lib/spaces/grocery/grocery.types";

/**
 * Lists and items were frontend-only local state (grocery.mock.ts's
 * initialGroceryData, mutated in memory via setItems/setLists in
 * GroceryDashboard.tsx) -- nothing was ever sent to the server, so
 * everything (including any "+ New category" a user created) vanished
 * on refresh. Same fix as Car (see lib/spaces/car/carItems.ts, which
 * this mirrors): reuse the generic `items` table + /api/items CRUD
 * (user-scoped already, nothing shared between accounts) instead of
 * building 2 more dedicated tables for what's fundamentally the same
 * shape. A list has no parent of its own; an item's `metadata.listId`
 * points at its owning list's item id -- the one place a hierarchy
 * exists here, and the reason list items must be deleted individually
 * when their list is deleted (see GroceryDashboard's handleDeleteList)
 * rather than relying on a DB-level cascade that doesn't exist for a
 * JSON-referenced relationship like this one.
 */

const TYPE_LIST = "grocery_list";
const TYPE_ITEM = "grocery_item";
const TYPE_TRIP = "grocery_trip";

// -------------------------------------------------------------------
// Lists
// -------------------------------------------------------------------

export function groceryListToItemBody(spaceId: string | number, list: GroceryList) {
  return {
    space_id: spaceId,
    type: TYPE_LIST,
    title: list.name,
    metadata: {
      recipeIds: list.recipeIds ?? [],
    },
  };
}

function itemToGroceryList(item: any): GroceryList {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    name: item.title,
    createdDate: (item.created_at ?? "").slice(0, 10),
    recipeIds: Array.isArray(meta.recipeIds) ? meta.recipeIds.map(String) : [],
    createdBy: item.user ? { id: String(item.user.id), name: item.user.name } : undefined,
    spaceId: String(item.space_id),
  };
}

// -------------------------------------------------------------------
// Items
// -------------------------------------------------------------------

export function groceryItemToItemBody(spaceId: string | number, item: GroceryItem) {
  return {
    space_id: spaceId,
    type: TYPE_ITEM,
    title: item.name,
    category: item.category,
    amount: item.price ?? null,
    currency: item.price != null ? "RON" : null,
    metadata: {
      listId: item.listId,
      quantity: item.quantity ?? null,
      inCart: item.inCart,
      linkedSupplyId: item.linkedSupplyId ?? null,
    },
  };
}

function itemToGroceryItem(item: any): GroceryItem {
  const meta = item.metadata ?? {};
  return {
    id: String(item.id),
    listId: String(meta.listId),
    name: item.title,
    category: item.category ?? "Other",
    quantity: meta.quantity ?? undefined,
    price: item.amount != null ? Number(item.amount) : undefined,
    inCart: !!meta.inCart,
    addedDate: (item.created_at ?? "").slice(0, 10),
    addedBy: item.user ? { id: String(item.user.id), name: item.user.name } : undefined,
    linkedSupplyId: meta.linkedSupplyId ?? undefined,
  };
}

// -------------------------------------------------------------------
// Trips -- one write-only expense record per "Finalizează cumpărăturile"
// tap with a price entered (see GroceryDashboard.tsx's
// handleFinishShopping). Nothing in Grocery reads this back; it exists
// purely so Item::SPENDING_TYPES picks it up for the dashboard's
// Monthly Expenses breakdown and BudgetController's per-category totals,
// same as every other space's spend types.
// -------------------------------------------------------------------

export function groceryTripToItemBody(
  spaceId: string | number,
  trip: { listId: string; listName: string; price: number; guiltFree?: boolean },
) {
  return {
    space_id: spaceId,
    type: TYPE_TRIP,
    title: `Cumpărături -- ${trip.listName}`,
    category: "Grocery",
    amount: trip.price,
    currency: "RON",
    due_at: new Date().toISOString(),
    // "Bani fără vină" (GroceryFinishShoppingSheet) -- grocery_trip is a spending type.
    guilt_free: !!trip.guiltFree,
    metadata: {
      listId: trip.listId,
    },
  };
}

// -------------------------------------------------------------------
// Load everything Grocery's Home shows for ONE Grocery space -- that
// space's own lists plus any list someone else shared with the user,
// cross-space (see api.ts's getMyGroceryData / the backend's
// ItemController::myGrocery). Sharing a list is a STATE on it, never a
// different space to visit -- a shared list surfaces here right
// alongside the user's own, distinguished only by GroceryList.spaceId
// not matching the space they're currently viewing (see
// GroceryDashboard's isSharedList). spaceId is required -- without it, a
// user with more than one Grocery space saw every space's lists merged
// together. Lists come back oldest-first (creation order, so a
// freshly-created one lands at the end like it did locally), items
// newest-first (matches Car's convention).
// -------------------------------------------------------------------

export async function loadMyGroceryData(
  spaceId: string | number,
): Promise<{ lists: GroceryList[]; items: GroceryItem[] }> {
  const { lists: listRecords, items: itemRecords } = await api.getMyGroceryData(spaceId);

  const lists = [...listRecords]
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(itemToGroceryList);

  const items = [...itemRecords]
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(itemToGroceryItem);

  return { lists, items };
}

/** A client-generated placeholder id (see GroceryDashboard.tsx's
 * makeListId/makeItemId) looks like "list-<timestamp>-<n>" or
 * "gr-<timestamp>-<n>" -- never a bare number. A real, already-saved
 * item's id is the numeric database id (as a string). Used to decide
 * create vs. update/delete, and to skip network calls entirely for
 * something that hasn't finished its initial save yet. */
export function isSavedItemId(id: string): boolean {
  return /^\d+$/.test(id);
}
