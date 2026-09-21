/**
 * The 5 categories the Smart List formula (5-4-3-2-1, see
 * grocery.smartList.ts) is built around, plus a few general ones for
 * everyday items the formula doesn't cover (milk, bread, cleaning
 * supplies...). GROCERY_CATEGORY_ORDER controls section order everywhere
 * a built-in category list is shown (the Add Product pills, the Smart
 * List formula).
 */
export type BuiltinGroceryCategory =
  | "Vegetables"
  | "Fruits"
  | "Protein"
  | "Grains / Starches"
  | "Healthy Fats"
  | "Dairy"
  | "Bakery"
  | "Household"
  | "Other";

/**
 * Open type: the 9 built-ins above still autocomplete, but a shopping
 * list item can also carry a brand-new category a user typed on the fly
 * (see GroceryProductModal's "+ New category") -- anything that isn't a
 * built-in is just another string here. `(string & {})` is a TS trick
 * that keeps the literal union suggestions in editors while still
 * accepting any string.
 */
export type GroceryCategory = BuiltinGroceryCategory | (string & {});

export const GROCERY_CATEGORY_ORDER: BuiltinGroceryCategory[] = [
  "Vegetables",
  "Fruits",
  "Protein",
  "Grains / Starches",
  "Healthy Fats",
  "Dairy",
  "Bakery",
  "Household",
  "Other",
];

/**
 * A user-named list -- "Week 1", "Party shopping", whatever grouping
 * makes sense to them; each one owns its own set of items via
 * GroceryItem.listId. Always lives in its CREATOR's own space
 * (space_id never changes, see ItemController::store/update) --
 * sharing it (see SpaceMembersModal) is a STATE on the list itself
 * (spaceId below not matching the space you're currently viewing),
 * never a matter of moving it or making you "visit" someone else's
 * space: a list shared with you surfaces right on YOUR OWN Home, next
 * to your own lists (see loadMyGroceryData / GroceryDashboard's
 * isSharedList).
 */
export type GroceryList = {
  id: string;
  name: string;
  createdDate: string;
  /** The space this list actually lives in -- always its creator's own
   * (creating a list in someone else's space is refused server-side,
   * see ItemController::store). Comparing this to the space you're
   * currently viewing is what tells "mine" apart from "shared with me"
   * (see GroceryDashboard's isSharedList) -- the list itself never
   * moves, this is just which of your Home's lists it counts as. */
  spaceId: string;
  /** Ids of every recipe (see recipeMatching.ts's Recipe) that has ever
   * contributed ingredients to this list -- via a Quick Template
   * (GroceryListsPage), "Add ingredients from N recipes"
   * (GroceryRecipesPage), or "Generate list from recipes" / "Add
   * missing to list" (GrocerySmartListPage). Accumulated, never
   * replaced: adding from more recipes later just grows this. Shown
   * back on GroceryShoppingListPage as "Made with recipes", right under
   * the list's own items, so a list built from a filtered selection
   * (e.g. Romanian + Italian) still shows exactly those recipes and
   * nothing else. */
  recipeIds?: string[];
  /** Who created this list -- always its own space's owner (see
   * ItemController::canCreateInSpace: creating a grocery_list is
   * strictly owner-only). Kept mainly for display; canManageList on
   * the backend is really just "are you this list's space's owner" now.
   * Undefined only for a list that hasn't finished its first save yet. */
  createdBy?: { id: string; name: string };
};

/** A per-user cap on how many lists someone can have at once -- Home's
 * "YOUR LISTS" card shows usage against this (see GroceryDashboard.tsx),
 * and creating a list past it is refused (see createOrReuseList). */
export const MAX_GROCERY_LISTS = 10;

export type GroceryItem = {
  id: string;
  /** Which GroceryList this item belongs to -- every item lives on
   * exactly one list. */
  listId: string;
  name: string;
  category: GroceryCategory;
  /** Free-form display string, e.g. "1 kg" or "10 pcs" -- the add/edit
   * form collects amount + unit as two fields and joins them into this
   * one, but nothing downstream needs them split back apart. */
  quantity?: string;
  /** Optional per-product price in RON -- nothing reads this yet (not
   * mandatory, not shown on the row or summed anywhere); it's here so
   * whoever wants to track cost per product already can, ahead of the
   * planned "basket cost" total and budget sync that will read it
   * later. Maps to the generic Item.amount/currency columns, same ones
   * Car/Home spending already uses (see Item::SPENDING_TYPES on the
   * backend) -- grocery_item just isn't in that list yet. */
  price?: number;
  /** Checked off while actually shopping -- already in the cart/bought.
   * Always reversible: toggling never deletes the item (see
   * GroceryShoppingListPage.tsx). */
  inCart: boolean;
  addedDate: string;
  /** Who created this item -- any member of a shared space, not just
   * its owner (see Space::members on the backend). Undefined only for
   * an item that hasn't finished its first save yet (see
   * groceryItems.ts's isSavedItemId), since the server is what attaches
   * this. */
  addedBy?: { id: string; name: string };
  /** Set only when this item was added from the "probably running low"
   * Home supply suggestion popup -- the Home supply's own item id
   * (cross-space, see GroceryDashboard.tsx's computeSupplySuggestions).
   * If this item is still checked into cart when "Finalizează
   * cumpărăturile" is tapped, its quantity logs a real restock event on
   * that supply -- see handleFinishShopping's logSupplyRestock call. */
  linkedSupplyId?: string;
};

/** One person who can use the active list -- the space's owner (who
 * can see every list in their own space) or someone added to just this
 * one list via the "+" on the Grocery header (see SpaceMembersModal.tsx).
 * Mirrors the shape /items/{id}/members returns. Same shape either way,
 * so this type is shared rather than duplicated. */
export type SpaceMember = {
  id: string;
  name: string;
  email: string;
};
