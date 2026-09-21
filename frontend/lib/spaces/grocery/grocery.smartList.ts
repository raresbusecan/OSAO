import type { GroceryCategory, GroceryItem } from "./grocery.types";
import type { IngredientReference } from "./ingredientLookup";

/**
 * The 5-4-3-2-1 formula: a balanced basket is 5 vegetables, 4 fruits, 3
 * proteins, 2 grains/starches, 1 healthy fat -- 15 products total. Order
 * here is the display order everywhere the formula itself is shown
 * (Smart List page, Home's teaser card).
 *
 * Deliberately kept to these 5 built-in food-group categories -- it's a
 * nutritional-balance formula, and a user's own custom categories
 * ("Snacks", "Baby items"...) don't really fit that premise. What *is*
 * DB-connected now is each category's suggestion pool (see
 * buildSmartListPools below), not the formula's shape.
 */
export const SMART_LIST_FORMULA: { category: GroceryCategory; count: number }[] = [
  { category: "Vegetables", count: 5 },
  { category: "Fruits", count: 4 },
  { category: "Protein", count: 3 },
  { category: "Grains / Starches", count: 2 },
  { category: "Healthy Fats", count: 1 },
];

export const SMART_LIST_TOTAL = SMART_LIST_FORMULA.reduce((sum, f) => sum + f.count, 0);

export type SmartListPools = Record<string, string[]>;

// Last-resort pool, only used for a formula category if both the global
// ingredient dictionary and the user's own history come back empty for
// it (e.g. offline with a brand-new account) -- see buildSmartListPools.
// Was the *only* pool before this connected to real data; kept small
// and only as a safety net now.
const SMART_LIST_FALLBACK_POOLS: SmartListPools = {
  Vegetables: [
    "Carrots", "Onion", "Broccoli", "Spinach", "Bell peppers", "Zucchini",
    "Cauliflower", "Green beans", "Cucumber", "Tomatoes", "Garlic", "Mushrooms",
  ],
  Fruits: [
    "Apples", "Bananas", "Blueberries", "Oranges", "Strawberries", "Grapes",
    "Lemons", "Pears",
  ],
  Protein: [
    "Chicken", "Salmon", "Eggs", "Ground beef", "Tofu", "Greek yogurt",
    "Turkey", "Shrimp",
  ],
  "Grains / Starches": [
    "Brown rice", "Potatoes", "Oats", "Whole wheat pasta", "Quinoa", "Sweet potatoes",
  ],
  "Healthy Fats": ["Avocado", "Almonds", "Olive oil", "Walnuts", "Peanut butter"],
};

/**
 * Builds each formula category's suggestion pool from two real sources
 * instead of a hardcoded list:
 *  1. The global ingredient dictionary (ingredient_references, ~225
 *     rows) -- shared, curated, the same one Add Product uses to
 *     auto-categorize.
 *  2. This user's own grocery history (every product they've actually
 *     added, on any of their lists, past or present) -- this is what
 *     makes Smart List "learn" a product a user typed that wasn't in
 *     the dictionary: it never gets written back into the shared
 *     dictionary (that stays curated, not user-writable), but it's
 *     immediately eligible to be suggested to *that* user again here.
 * Merged case-insensitively (dictionary spelling wins on a collision),
 * dictionary entries first so a fresh account still gets sensible,
 * correctly-spelled suggestions before any history exists.
 */
export function buildSmartListPools(
  ingredientReferences: IngredientReference[],
  historyItems: GroceryItem[],
): SmartListPools {
  const pools: SmartListPools = {};

  SMART_LIST_FORMULA.forEach(({ category }) => {
    const seen = new Map<string, string>();

    const addAll = (names: string[]) => {
      names.forEach((name) => {
        const key = name.trim().toLowerCase();
        if (key && !seen.has(key)) seen.set(key, name.trim());
      });
    };

    addAll(
      ingredientReferences
        .filter((ref) => ref.category.toLowerCase() === category.toLowerCase())
        .map((ref) => ref.name),
    );

    addAll(
      historyItems
        .filter((item) => item.category.toLowerCase() === category.toLowerCase())
        .map((item) => item.name),
    );

    if (seen.size === 0) addAll(SMART_LIST_FALLBACK_POOLS[category] ?? []);

    pools[category] = Array.from(seen.values());
  });

  return pools;
}

function pickRandomUnique(pool: string[], count: number, exclude: string[]): string[] {
  const excludeLower = exclude.map((e) => e.toLowerCase());
  const available = pool.filter((p) => !excludeLower.includes(p.toLowerCase()));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export type SmartListDraftItem = { id: string; name: string; category: GroceryCategory };

/** A fresh 15-product draft following the formula exactly, drawn from
 * `pools` (see buildSmartListPools). Every id is unique per call, so
 * generating twice in a row never collides. */
export function generateSmartList(pools: SmartListPools): SmartListDraftItem[] {
  const draft: SmartListDraftItem[] = [];

  SMART_LIST_FORMULA.forEach(({ category, count }) => {
    const picks = pickRandomUnique(pools[category] ?? [], count, []);
    picks.forEach((name) => {
      draft.push({
        id: `smart-${category}-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        category,
      });
    });
  });

  return draft;
}

/** One alternative for a single draft item -- excludes whatever's
 * already in the draft for that category so "Replace" never offers a
 * name that's already sitting elsewhere in the same list. */
export function getSmartListReplacement(
  pools: SmartListPools,
  category: GroceryCategory,
  excludeNames: string[],
): string | null {
  const [replacement] = pickRandomUnique(pools[category] ?? [], 1, excludeNames);
  return replacement ?? null;
}
