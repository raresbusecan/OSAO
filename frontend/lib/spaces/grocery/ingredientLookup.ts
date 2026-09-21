import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { GroceryCategory } from "./grocery.types";

export type IngredientReference = {
  id: number;
  name: string;
  category: GroceryCategory;
  aliases: string[] | null;
};

// Module-level cache -- the dictionary is shared, global, and rarely
// changes, so every screen that needs it (Add Product in the Dashboard,
// Edit in the Shopping List page) reads the same in-memory copy instead
// of each re-fetching its own. Fetched once per app session.
let cache: IngredientReference[] | null = null;
let inFlight: Promise<IngredientReference[]> | null = null;

async function loadIngredientReferences(): Promise<IngredientReference[]> {
  if (cache) return cache;

  if (!inFlight) {
    inFlight = api
      .getIngredientReferences()
      .then((list) => {
        cache = list as IngredientReference[];
        return cache;
      })
      .catch((err) => {
        inFlight = null;
        throw err;
      });
  }

  return inFlight;
}

/** Returns the cached list once loaded (empty array before that finishes
 * and if it fails -- auto-categorization is a nice-to-have, so a failed
 * fetch just means no suggestions, never a broken Add Product form). */
export function useIngredientReferences(): IngredientReference[] {
  const [list, setList] = useState<IngredientReference[]>(cache ?? []);

  useEffect(() => {
    let mounted = true;

    loadIngredientReferences()
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

/**
 * Case-insensitive match against a known ingredient's canonical name or
 * any of its aliases (e.g. typing "scallion" matches "Green onion").
 * Returns null when nothing matches -- typing something not in the
 * dictionary is completely normal, the user just keeps picking the
 * category manually for that one.
 */
export function matchIngredientCategory(
  list: IngredientReference[],
  typedName: string,
): GroceryCategory | null {
  const normalized = typedName.trim().toLowerCase();
  if (!normalized) return null;

  const match = list.find((ref) => {
    if (ref.name.toLowerCase() === normalized) return true;
    return (ref.aliases ?? []).some((alias) => alias.toLowerCase() === normalized);
  });

  return match?.category ?? null;
}
