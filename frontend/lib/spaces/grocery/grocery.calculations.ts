import { GROCERY_CATEGORY_ORDER, type GroceryCategory, type GroceryItem, type GroceryList } from "./grocery.types";

export function getGroceryProgress(items: GroceryItem[]): { bought: number; total: number } {
  return {
    bought: items.filter((item) => item.inCart).length,
    total: items.length,
  };
}

/** All items belonging to one list, in original (added-date) order --
 * the basic building block every per-list view filters `items` down
 * with first. */
export function getItemsForList(items: GroceryItem[], listId: string): GroceryItem[] {
  return items.filter((item) => item.listId === listId);
}

/** Same as getGroceryProgress, scoped to a single list -- what each
 * list card on GroceryListsPage shows. */
export function getGroceryListProgress(items: GroceryItem[], listId: string): { bought: number; total: number } {
  return getGroceryProgress(getItemsForList(items, listId));
}

/** Case-insensitive, trimmed name match against an existing list --
 * mirrors findGroceryItemByName below, used when naming a new list so
 * "week 1" doesn't sit twice under slightly different capitalization. */
export function findGroceryListByName(lists: GroceryList[], name: string): GroceryList | undefined {
  const normalized = name.trim().toLowerCase();
  return lists.find((list) => list.name.trim().toLowerCase() === normalized);
}

export type GroceryCategoryGroup = { category: GroceryCategory; items: GroceryItem[] };

/**
 * Groups anything with a `.category` by category -- built-ins first in
 * GROCERY_CATEGORY_ORDER, then any custom category (see
 * GroceryProductModal's "+ New category") sorted alphabetically, with
 * "Other" always last so it stays the catch-all bucket. Empty
 * categories are left out entirely rather than showing a header with
 * nothing under it. Deriving the category list from the items
 * themselves (instead of only iterating GROCERY_CATEGORY_ORDER) is what
 * keeps custom-category items from silently disappearing from a grouped
 * view -- and, generic rather than tied to GroceryItem specifically, is
 * what lets a Smart List draft (SmartListDraftItem, not a real
 * GroceryItem yet) group the same way instead of only ever showing the
 * 5-4-3-2-1 formula's own 5 categories, which a recipe-derived draft
 * isn't limited to.
 */
export function groupByCategory<T extends { category: GroceryCategory }>(
  items: T[],
): { category: GroceryCategory; items: T[] }[] {
  const builtins: GroceryCategory[] = GROCERY_CATEGORY_ORDER.filter((c) => c !== "Other");

  const customCategories = Array.from(
    new Set(
      items
        .map((item) => item.category)
        .filter((category) => !GROCERY_CATEGORY_ORDER.some((c) => c.toLowerCase() === category.toLowerCase())),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const order: GroceryCategory[] = [...builtins, ...customCategories, "Other"];

  return order
    .map((category) => ({
      category,
      items: items.filter((item) => item.category.toLowerCase() === category.toLowerCase()),
    }))
    .filter((group) => group.items.length > 0);
}

/** @deprecated Use groupByCategory directly -- kept as a thin, typed
 * alias so existing GroceryItem[] call sites don't need to change. */
export function groupGroceryItemsByCategory(items: GroceryItem[]): GroceryCategoryGroup[] {
  return groupByCategory(items);
}

/**
 * Case-insensitive, trimmed name match -- the basic "is this already on
 * the list" check used by both the Smart List generator and (in a later
 * pass) recipe ingredient matching, so a suggestion never gets added
 * twice under a slightly different capitalization.
 */
export function findGroceryItemByName(items: GroceryItem[], name: string): GroceryItem | undefined {
  const normalized = name.trim().toLowerCase();
  return items.find((item) => item.name.trim().toLowerCase() === normalized);
}
