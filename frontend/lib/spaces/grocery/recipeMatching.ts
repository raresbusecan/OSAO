import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { GroceryItem } from "./grocery.types";
import type { IngredientReference } from "./ingredientLookup";

export type RecipeIngredient = { name: string; quantity?: string };

export type Recipe = {
  id: string;
  title: string;
  imageKey?: string;
  timeMinutes?: number;
  difficulty?: string;
  steps: string[];
  tags: string[];
  ingredients: RecipeIngredient[];
};

function toRecipe(raw: any): Recipe {
  return {
    id: String(raw.id),
    title: raw.title,
    imageKey: raw.image_key ?? undefined,
    timeMinutes: raw.time_minutes ?? undefined,
    difficulty: raw.difficulty ?? undefined,
    steps: raw.steps ?? [],
    tags: raw.tags ?? [],
    ingredients: (raw.ingredients ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((i: any) => ({ name: i.name, quantity: i.quantity ?? undefined })),
  };
}

// Module-level cache -- same reasoning as ingredientLookup.ts's: the
// recipe library is shared/global and rarely changes, fetched once per
// app session rather than every time the Smart List page mounts.
let cache: Recipe[] | null = null;
let inFlight: Promise<Recipe[]> | null = null;

async function loadRecipes(): Promise<Recipe[]> {
  if (cache) return cache;

  if (!inFlight) {
    inFlight = api
      .listRecipes()
      .then((raw) => {
        cache = raw.map(toRecipe);
        return cache;
      })
      .catch((err) => {
        inFlight = null;
        throw err;
      });
  }

  return inFlight;
}

/** Returns the cached recipe library once loaded (empty before that and
 * if the fetch fails -- recipe suggestions are a nice-to-have, never a
 * reason to break the Smart List page). */
export function useRecipes(): Recipe[] {
  const [list, setList] = useState<Recipe[]>(cache ?? []);

  useEffect(() => {
    let mounted = true;

    loadRecipes()
      .then((data) => {
        if (mounted) setList(data);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  return list;
}

/** Same name-or-alias identity ingredientLookup.ts's matchIngredientCategory
 * uses, but returning a canonical key instead of a category -- so a
 * recipe ingredient ("Green onion") and a list item typed differently
 * ("Scallion") are recognized as the same thing when both resolve to
 * the same dictionary entry. Falls back to the trimmed, lowercased name
 * itself when nothing in the dictionary matches either side, so
 * unrecognized products/ingredients still match each other exactly. */
function canonicalKey(name: string, references: IngredientReference[]): string {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return normalized;

  const match = references.find((ref) => {
    if (ref.name.toLowerCase() === normalized) return true;
    return (ref.aliases ?? []).some((alias) => alias.toLowerCase() === normalized);
  });

  return match ? match.name.toLowerCase() : normalized;
}

/** Crude, dependency-free singular/plural fold -- "tomatoes" and
 * "tomato" (or "boxes"/"box") end up as the same string. Not
 * linguistically perfect, just enough that a manually-typed product
 * doesn't need to match a recipe's ingredient spelling exactly. */
function foldPlural(key: string): string {
  if (key.endsWith("oes") && key.length > 5) return key.slice(0, -2);
  if (key.endsWith("es") && key.length > 4) return key.slice(0, -2);
  if (key.endsWith("s") && !key.endsWith("ss") && key.length > 3) return key.slice(0, -1);
  return key;
}

/**
 * Whether a recipe ingredient and a grocery item should count as the
 * same thing -- three tiers, loosest last: (1) exact match once both
 * are resolved through the ingredient dictionary (handles aliases like
 * "Scallion" / "Green onion"), (2) the same after a basic plural fold
 * ("Tomato" / "Tomatoes"), (3) one name contains the other as a whole
 * word-ish substring ("Cherry tomatoes" covers a "Tomatoes" ingredient,
 * "Chicken breast" covers "Chicken"). Manually-typed products go
 * through the exact same checks as recognized ones -- there's no
 * separate path for "not in the dictionary", the dictionary is only
 * ever an alias lookup along the way.
 */
function ingredientMatchesItem(
  ingredientName: string,
  itemName: string,
  references: IngredientReference[],
): boolean {
  const a = canonicalKey(ingredientName, references);
  const b = canonicalKey(itemName, references);
  if (a === b) return true;

  const foldedA = foldPlural(a);
  const foldedB = foldPlural(b);
  if (foldedA === foldedB) return true;

  if (foldedA.length >= 4 && foldedB.length >= 4 && (foldedA.includes(foldedB) || foldedB.includes(foldedA))) {
    return true;
  }

  return false;
}

export type RecipeMatch = {
  recipe: Recipe;
  matchedIngredients: string[];
  missingIngredients: string[];
  matchRatio: number;
};

/** One recipe's match info against a set of items -- the building block
 * both matchRecipesToItems (Smart List's "recipes you can make", which
 * only wants recipes with at least one hit) and GroceryRecipesPage (the
 * browsing library, which wants match info for *every* recipe
 * regardless of tag filter, hits or not) need. */
export function matchRecipeIngredients(
  recipe: Recipe,
  items: GroceryItem[],
  ingredientReferences: IngredientReference[],
): RecipeMatch {
  const matchedIngredients: string[] = [];
  const missingIngredients: string[] = [];

  recipe.ingredients.forEach((ingredient) => {
    const hasIt = items.some((item) => ingredientMatchesItem(ingredient.name, item.name, ingredientReferences));
    if (hasIt) {
      matchedIngredients.push(ingredient.name);
    } else {
      missingIngredients.push(ingredient.name);
    }
  });

  const total = recipe.ingredients.length || 1;

  return {
    recipe,
    matchedIngredients,
    missingIngredients,
    matchRatio: matchedIngredients.length / total,
  };
}

/**
 * Ranks the recipe library against one list's items -- what "Recipes
 * you can make" on the Smart List page shows. Only recipes with at
 * least one overlapping ingredient are returned, sorted by how complete
 * a match they are (most-covered first), so the top of the list is
 * always the recipe closest to "you already have everything".
 */
export function matchRecipesToItems(
  recipes: Recipe[],
  items: GroceryItem[],
  ingredientReferences: IngredientReference[],
): RecipeMatch[] {
  return recipes
    .map((recipe) => matchRecipeIngredients(recipe, items, ingredientReferences))
    .filter((match) => match.matchedIngredients.length > 0)
    .sort((a, b) => {
      if (b.matchRatio !== a.matchRatio) return b.matchRatio - a.matchRatio;
      if (b.matchedIngredients.length !== a.matchedIngredients.length) {
        return b.matchedIngredients.length - a.matchedIngredients.length;
      }
      return a.recipe.title.localeCompare(b.recipe.title);
    });
}

/** The subset of a recipe's `tags` that represent when you'd eat it --
 * one of the two filter axes on GroceryRecipesPage. Everything else in
 * `tags` that isn't also a cuisine ("quick", "vegetarian",
 * "high-protein"...) is shown as a plain descriptive chip instead, not
 * a filter. */
export const MEAL_TYPE_TAGS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPE_TAGS)[number];

/** The other filter axis -- which cuisine tags RecipeSeeder actually
 * uses. A fixed, explicit list (not "every tag that isn't a meal type",
 * which would wrongly turn "quick"/"vegetarian" into cuisine pills) --
 * add to it here whenever a new cuisine is seeded. GroceryRecipesPage
 * still only shows a pill for one of these if a recipe with that tag
 * actually exists right now, so this list can stay ahead of the
 * library without an empty pill ever showing up. */
export const CUISINE_TAGS = ["italian", "mexican", "asian", "mediterranean", "american", "romanian"] as const;
export type Cuisine = (typeof CUISINE_TAGS)[number];
