import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { notifyAction } from "@/lib/confirm";
import type { GroceryItem, GroceryList } from "@/lib/spaces/grocery/grocery.types";
import { findGroceryItemByName, getItemsForList } from "@/lib/spaces/grocery/grocery.calculations";
import type { SmartListDraftItem } from "@/lib/spaces/grocery/grocery.smartList";
import { matchIngredientCategory, useIngredientReferences } from "@/lib/spaces/grocery/ingredientLookup";
import {
  CUISINE_TAGS,
  MEAL_TYPE_TAGS,
  matchRecipeIngredients,
  useRecipes,
  type Cuisine,
  type MealType,
} from "@/lib/spaces/grocery/recipeMatching";
import { GroceryNewListModal } from "./GroceryNewListModal";
import { GroceryRecipeDetailModal } from "./GroceryRecipeDetailModal";

export type GroceryRecipesPageProps = {
  /** Every grocery item this user has ever added, across every list --
   * what each recipe's "X/Y ingredients you have" is checked against,
   * same as Smart List's "recipes you can make". */
  allItems: GroceryItem[];
  lists: GroceryList[];
  onBack: () => void;
  onCreateList: (name: string) => Promise<string>;
  onAddToList: (draft: SmartListDraftItem[], listId: string, recipeIds?: string[]) => void;
  /** Whether the inline "name your list" input (in ADD TO below) is
   * open -- controlled from GroceryDashboard, same shared flag the "+"
   * FAB's "New List" action uses. */
  creatingList: boolean;
  onCreatingListClose: () => void;
  /** Opens that same inline input -- the "+ New list" pill at the end
   * of ADD TO's row triggers this directly now, so creating a list no
   * longer requires leaving this page for the shared "+" FAB. */
  onCreatingListOpen: () => void;
  /** Confirms, then deletes -- same shared flow Home's own list grid
   * uses (GroceryDashboard's confirmDeleteList), so a list deleted from
   * here behaves identically (same confirmation copy, same cleanup). */
  onDeleteList: (list: GroceryList) => void;
  /** Whether the current user may delete a given list -- the space
   * owner, or whoever created it (mirrors the backend's own rule, see
   * GroceryDashboard's canManageList). Gates the "x" on ADD TO's
   * selected pill below the same way it gates Home's list-card "x". */
  canManageList: (list: GroceryList) => boolean;
};

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

const CUISINE_LABEL: Record<Cuisine, string> = {
  italian: "Italian",
  mexican: "Mexican",
  asian: "Asian",
  mediterranean: "Mediterranean",
  american: "American",
  romanian: "Romanian",
};

/** One muted accent pair per cuisine -- `block` is the grid card's
 * "photo" placeholder (a colored block standing in for a real recipe
 * photo, see the card rendering below), `accent` is the same hue
 * darkened enough to read as text on the card's near-white cuisine tag.
 * Kept muted/soft rather than saturated so a grid of six still reads as
 * one calm surface, not a rainbow. */
const CUISINE_VISUALS: Record<Cuisine, { block: string; accent: string }> = {
  italian: { block: "#7FA66B", accent: "#3F6B2E" },
  mexican: { block: "#E0A458", accent: "#8A5A1E" },
  asian: { block: "#C77DAE", accent: "#7A3A63" },
  mediterranean: { block: "#6FA8AA", accent: "#2E5C5E" },
  american: { block: "#6B85C4", accent: "#33447E" },
  romanian: { block: "#D98B72", accent: "#8A4A32" },
};
// A recipe with no recognized cuisine tag still needs a block/accent --
// this is that fallback, not a 7th cuisine.
const DEFAULT_VISUAL = { block: "#9AA0A6", accent: "#4A4E52" };

/** First cuisine/meal-type tag a recipe actually carries, for the
 * card's photo-block tag and meta line -- a recipe only ever has one of
 * each in practice, but tags is an unordered string array so this picks
 * deterministically off CUISINE_TAGS'/MEAL_TYPE_TAGS' own order. */
function getPrimaryCuisine(tags: string[]): Cuisine | null {
  return (CUISINE_TAGS.find((c) => tags.includes(c)) as Cuisine | undefined) ?? null;
}
function getPrimaryMealType(tags: string[]): MealType | null {
  return (MEAL_TYPE_TAGS.find((m) => tags.includes(m)) as MealType | undefined) ?? null;
}

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

/**
 * A dedicated page, reached from the shared "+" FAB on Home (alongside
 * Smart List) as well as Home's own "What can you cook?" row -- browses
 * the recipe library directly by *what you're in the mood for* (cuisine
 * + meal type), the opposite direction from Smart List's "recipes you
 * can make": there, you start from what's already on a list and see
 * what it can become; here, you pick what you want first and worry
 * about the ingredients after, via the same "add missing to list" /
 * "add ingredients from N recipes" actions once you've decided.
 */
export function GroceryRecipesPage({
  allItems,
  lists,
  onBack,
  onCreateList,
  onAddToList,
  creatingList,
  onCreatingListClose,
  onCreatingListOpen,
  onDeleteList,
  canManageList,
}: GroceryRecipesPageProps) {
  const { colors, spacing, radius } = useTheme();
  const recipes = useRecipes();
  const ingredientReferences = useIngredientReferences();

  // Both filter axes are multi-select: an empty set means "no filter on
  // this axis, show everything" -- picking one or more values on an
  // axis narrows to recipes carrying at least one of them, and the two
  // axes combine with AND (e.g. "Italian" + "Romanian" cuisines AND
  // "Dinner" meal type shows Italian or Romanian dinners, not just one).
  const [selectedCuisines, setSelectedCuisines] = useState<Set<Cuisine>>(new Set());
  const [selectedMealTypes, setSelectedMealTypes] = useState<Set<MealType>>(new Set());
  // Which of the two filter groups shows below the tab row -- switching
  // tabs never clears the other group's picks, it just changes which
  // one is visible (see the CUISINE/MEAL TYPE tabs below).
  const [filterTab, setFilterTab] = useState<"cuisine" | "meal">("cuisine");
  // Which recipe's detail sheet is open (GroceryRecipeDetailModal) --
  // replaces an old inline expand-in-place: a photo-grid card (see the
  // LIBRARY grid below) is too small to unfold ingredients/steps into
  // without breaking the grid, so tapping a card's body opens this
  // instead of expanding the card itself.
  const [detailRecipeId, setDetailRecipeId] = useState<string | null>(null);
  // Which recipes are checked for "Add ingredients from N recipes" --
  // separate from detailRecipeId (checking one doesn't open its detail
  // sheet, and vice versa), and kept as ids from the full `recipes`
  // list rather than `filteredRecipes` so a selection survives changing
  // the filters.
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());
  const [targetListId, setTargetListId] = useState<string | null>(lists[0]?.id ?? null);
  // Falls back the same way Home's effectiveActiveListId does -- a list
  // deleted from here (or from Home, while this page happened to be
  // open) can't leave targetListId pointing at an id that no longer
  // exists in `lists`.
  useEffect(() => {
    if (targetListId && !lists.some((list) => list.id === targetListId)) {
      setTargetListId(lists[0]?.id ?? null);
    }
  }, [lists, targetListId]);
  const [newListName, setNewListName] = useState("");
  const [savingList, setSavingList] = useState(false);
  // Ingredients waiting on a "which list?" decision -- both add paths
  // (the bulk button below and a single recipe's "Add missing to list"
  // in its detail sheet) used to drop straight onto targetListId with
  // no warning, which is exactly what a user who never touched the ADD
  // TO picker wouldn't expect. Set here instead of adding immediately;
  // resolveAddToCurrentList/resolveAddToNewList below is what actually
  // calls onAddToList, once the user's picked one. Null means no
  // prompt is open.
  const [pendingAdd, setPendingAdd] = useState<{
    items: SmartListDraftItem[];
    recipeIds: string[];
    /** Bulk "Add elements to your selected list" clears its checkboxes
     * on success; a single recipe's "Add missing to list" has no
     * checkbox selection to clear. */
    clearSelectionAfter: boolean;
    /** How many of the bulk selection's ingredients were already on
     * the CURRENT target list -- 0 for the single-recipe path (its
     * missingIngredients are already gap-checked against that same
     * list). Meaningless if the user ends up picking "new list"
     * instead (an empty list skips nothing), so only the "add to
     * current list" message below reads this. */
    skippedOnCurrentList: number;
  } | null>(null);
  // Recipes stay hidden until "Show Recipes" is pressed -- picking a
  // cuisine/meal-type filter narrows what pressing it will reveal, it
  // never repopulates the screen by itself. Any further filter change
  // (including Clear filters) hides an already-shown list again, so
  // "what's on screen" always matches the filters the button was last
  // pressed for, never a stale set from before the last change.
  const [shown, setShown] = useState(false);

  // Only offers a cuisine pill for one that actually has a recipe right
  // now -- CUISINE_TAGS can list more than the library currently has
  // (e.g. once a cuisine is planned but not seeded yet) without an
  // empty, useless pill ever showing up.
  const availableCuisines = useMemo(
    () => CUISINE_TAGS.filter((cuisine) => recipes.some((recipe) => recipe.tags.includes(cuisine))),
    [recipes],
  );

  const hasActiveFilters = selectedCuisines.size > 0 || selectedMealTypes.size > 0;

  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      const cuisineOk = selectedCuisines.size === 0 || recipe.tags.some((tag) => selectedCuisines.has(tag as Cuisine));
      const mealTypeOk = selectedMealTypes.size === 0 || recipe.tags.some((tag) => selectedMealTypes.has(tag as MealType));
      return cuisineOk && mealTypeOk;
    });
  }, [recipes, selectedCuisines, selectedMealTypes]);

  const handleToggleCuisine = (cuisine: Cuisine) => {
    setSelectedCuisines((prev) => toggleInSet(prev, cuisine));
    setShown(false);
  };

  const handleToggleMealType = (mealType: MealType) => {
    setSelectedMealTypes((prev) => toggleInSet(prev, mealType));
    setShown(false);
  };

  const detailRecipe = useMemo(
    () => (detailRecipeId ? filteredRecipes.find((r) => r.id === detailRecipeId) ?? null : null),
    [detailRecipeId, filteredRecipes],
  );
  const detailMatch = useMemo(
    () => (detailRecipe ? matchRecipeIngredients(detailRecipe, allItems, ingredientReferences) : null),
    [detailRecipe, allItems, ingredientReferences],
  );
  const detailOtherTags = useMemo(
    () => (detailRecipe ? detailRecipe.tags.filter((tag) => !MEAL_TYPE_TAGS.includes(tag as MealType)) : []),
    [detailRecipe],
  );

  const handleCreateListInline = async () => {
    if (savingList) return;

    const trimmed = newListName.trim();
    if (!trimmed) {
      onCreatingListClose();
      return;
    }

    setSavingList(true);
    try {
      const id = await onCreateList(trimmed);
      setTargetListId(id);
      setNewListName("");
      onCreatingListClose();

      // "Create new list" from the pending-add prompt below routes
      // through this same New List popup (see resolveAddToNewList) --
      // once the list actually exists, finish what was waiting on it
      // instead of leaving the ingredients stranded.
      if (pendingAdd) {
        onAddToList(pendingAdd.items, id, pendingAdd.recipeIds.length > 0 ? pendingAdd.recipeIds : undefined);
        notifyAction(
          "Added",
          `${pendingAdd.items.length} ingredient${pendingAdd.items.length === 1 ? "" : "s"} added to "${trimmed}".`,
        );
        if (pendingAdd.clearSelectionAfter) setSelectedRecipeIds(new Set());
        setPendingAdd(null);
      }
    } catch {
      // onCreateList's own implementation already shows the error --
      // leave the input open so the user can just try again.
    } finally {
      setSavingList(false);
    }
  };

  // Runs once the user picks "Add to '<list>'" on the pending-add
  // prompt (see resolveAddToNewList for the other branch).
  const resolveAddToCurrentList = () => {
    if (!pendingAdd || !targetListId) return;

    const targetList = lists.find((list) => list.id === targetListId);
    onAddToList(pendingAdd.items, targetListId, pendingAdd.recipeIds.length > 0 ? pendingAdd.recipeIds : undefined);
    notifyAction(
      "Added",
      pendingAdd.skippedOnCurrentList > 0
        ? `${pendingAdd.items.length} ingredients added to "${targetList?.name ?? "your list"}" -- ${pendingAdd.skippedOnCurrentList} were already on it.`
        : `${pendingAdd.items.length} ingredient${pendingAdd.items.length === 1 ? "" : "s"} added to "${targetList?.name ?? "your list"}".`,
    );
    if (pendingAdd.clearSelectionAfter) setSelectedRecipeIds(new Set());
    setPendingAdd(null);
  };

  // The other branch -- opens the same New List popup every "+ New
  // list" entry point uses; handleCreateListInline is what actually
  // adds the pending ingredients once that list exists. Deliberately
  // keeps pendingAdd set (only the prompt itself hides, see its
  // `visible` below) so there's something for that popup to finish.
  const resolveAddToNewList = () => {
    onCreatingListOpen();
  };

  const handleAddMissingIngredients = (missingIngredients: string[], recipeId: string) => {
    if (!targetListId || missingIngredients.length === 0) return;

    const draftItems: SmartListDraftItem[] = missingIngredients.map((name) => ({
      id: `recipe-${recipeId}-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      category: matchIngredientCategory(ingredientReferences, name) ?? "Other",
    }));

    setPendingAdd({ items: draftItems, recipeIds: [recipeId], clearSelectionAfter: false, skippedOnCurrentList: 0 });
  };

  const handleToggleRecipeSelection = (recipeId: string) => {
    setSelectedRecipeIds((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      return next;
    });
  };

  // Adds every ingredient the checked recipes call for, deduped across
  // them and skipping whatever's already on the target list -- unlike
  // "Add missing to list" on a single expanded recipe (which only adds
  // that one recipe's gaps), this is meant for "I want to cook all of
  // these" and just gets you the whole shopping list for them at once.
  const handleAddSelectedRecipes = () => {
    if (!targetListId || selectedRecipeIds.size === 0) return;

    const selected = recipes.filter((recipe) => selectedRecipeIds.has(recipe.id));
    const seen = new Map<string, string>();
    selected.forEach((recipe) => {
      recipe.ingredients.forEach((ingredient) => {
        const key = ingredient.name.trim().toLowerCase();
        if (key && !seen.has(key)) seen.set(key, ingredient.name.trim());
      });
    });

    const itemsOnTargetList = getItemsForList(allItems, targetListId);
    const toAdd = Array.from(seen.values()).filter((name) => !findGroceryItemByName(itemsOnTargetList, name));
    const skipped = seen.size - toAdd.length;

    if (toAdd.length === 0) {
      notifyAction("Nothing new", "All those ingredients are already on that list.");
      return;
    }

    const draftItems: SmartListDraftItem[] = toAdd.map((name) => ({
      id: `recipes-${Date.now()}-${name}-${Math.random().toString(36).slice(2)}`,
      name,
      category: matchIngredientCategory(ingredientReferences, name) ?? "Other",
    }));

    setPendingAdd({
      items: draftItems,
      recipeIds: Array.from(selectedRecipeIds),
      clearSelectionAfter: true,
      skippedOnCurrentList: skipped,
    });
  };

  return (
    <>
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 150 }}
    >
      {/* HEADER */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
        }}
      >
        <Pressable
          testID="grocery-recipes-back"
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>
          Recipes
        </Text>
      </View>

      {/* CUISINE / MEAL TYPE -- a 2-tab switcher instead of two always-
          stacked rows; only the active tab's pills show below. A small
          dot marks a tab whose group has a selection even while it's
          not the one open, so a filter picked on the other tab is
          never invisible. Switching tabs never clears either axis --
          both still combine with AND once picked (see filteredRecipes
          above), same as before. */}
      <View
        style={{
          flexDirection: "row",
          gap: 6,
          padding: 3,
          borderRadius: radius.sm,
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: spacing.md,
        }}
      >
        <Pressable
          testID="grocery-recipes-tab-cuisine"
          onPress={() => setFilterTab("cuisine")}
          hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            paddingVertical: 8,
            borderRadius: radius.sm,
            backgroundColor: "transparent",
            borderWidth: filterTab === "cuisine" ? 1 : 0,
            borderColor: colors.onSurface,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: filterTab === "cuisine" ? colors.onSurface : colors.onSurfaceTertiary,
            }}
          >
            Cuisine
          </Text>
          {selectedCuisines.size > 0 ? (
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.onSurface }} />
          ) : null}
        </Pressable>

        <Pressable
          testID="grocery-recipes-tab-meal"
          onPress={() => setFilterTab("meal")}
          hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            paddingVertical: 8,
            borderRadius: radius.sm,
            backgroundColor: "transparent",
            borderWidth: filterTab === "meal" ? 1 : 0,
            borderColor: colors.onSurface,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: filterTab === "meal" ? colors.onSurface : colors.onSurfaceTertiary,
            }}
          >
            Meal Type
          </Text>
          {selectedMealTypes.size > 0 ? (
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.onSurface }} />
          ) : null}
        </Pressable>
      </View>

      {filterTab === "cuisine" && availableCuisines.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: spacing.sm }}
          style={{ marginBottom: spacing.sm }}
        >
          {availableCuisines.map((cuisine) => {
            const selected = selectedCuisines.has(cuisine);
            return (
              <Pressable
                key={cuisine}
                testID={`grocery-recipes-cuisine-${cuisine}`}
                onPress={() => handleToggleCuisine(cuisine)}
                hitSlop={4}
                style={{
                  paddingHorizontal: spacing.md,
                  minHeight: 36,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.onSurface : "transparent",
                  borderWidth: 1,
                  borderColor: selected ? colors.onSurface : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: selected ? colors.surface : colors.onSurface }}>
                  {CUISINE_LABEL[cuisine]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {filterTab === "meal" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm }}>
          {MEAL_TYPE_TAGS.map((type) => {
            const selected = selectedMealTypes.has(type);
            return (
              <Pressable
                key={type}
                testID={`grocery-recipes-meal-${type}`}
                onPress={() => handleToggleMealType(type)}
                hitSlop={4}
                style={{
                  paddingHorizontal: spacing.md,
                  minHeight: 36,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.onSurface : "transparent",
                  borderWidth: 1,
                  borderColor: selected ? colors.onSurface : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: selected ? colors.surface : colors.onSurface }}>
                  {MEAL_TYPE_LABEL[type]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {hasActiveFilters ? (
        <Pressable
          testID="grocery-recipes-clear-filters"
          onPress={() => {
            setSelectedCuisines(new Set());
            setSelectedMealTypes(new Set());
            setShown(false);
          }}
          hitSlop={8}
          style={{ alignSelf: "flex-start", marginBottom: spacing.lg }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>Clear filters</Text>
        </Pressable>
      ) : (
        <View style={{ marginBottom: spacing.lg }} />
      )}

      {/* ADD TO -- applies to whichever recipe's "Add missing to list"
          gets tapped below; same inline "+ New list" creator as Smart
          List, for the same reason (never block browsing on having a
          list already). */}
      <View style={{ marginBottom: spacing.xl }}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "800",
            letterSpacing: 1,
            color: colors.onSurfaceTertiary,
            marginBottom: spacing.sm,
          }}
        >
          ADD TO
        </Text>

        {/* Horizontal, not wrapping -- a handful of lists used to pile
            up into more and more rows here; this keeps ADD TO to one
            line no matter how many lists exist. "+ New list" leads the
            scroll (not trailing) so it's never scrolled out of sight
            behind a long row of lists. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: spacing.sm }}
        >
          {/* Was only reachable via the shared "+" FAB elsewhere on
              Home before -- this is the one place that gated creating
              a list on leaving this page first. */}
          <Pressable
            testID="grocery-recipes-new-list"
            onPress={onCreatingListOpen}
            hitSlop={4}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: spacing.md,
              minHeight: 38,
              borderRadius: radius.pill,
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: colors.border,
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={14} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>New list</Text>
          </Pressable>

          {lists.map((list) => {
            const selected = targetListId === list.id;
            // Same restraint as Home's own list grid (ListCard's "x"):
            // only the selected pill can show delete, and only for
            // someone allowed to manage that specific list -- pick it
            // first, then delete, rather than cluttering every pill in
            // the row with its own "x".
            const canDelete = selected && canManageList(list);
            return (
              <Pressable
                key={list.id}
                testID={`grocery-recipes-target-${list.id}`}
                onPress={() => setTargetListId(list.id)}
                hitSlop={4}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: spacing.md,
                  minHeight: 38,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.onSurface : "transparent",
                  borderWidth: 1,
                  borderColor: selected ? colors.onSurface : colors.border,
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: selected ? colors.surface : colors.onSurface }}>
                  {list.name}
                </Text>

                {canDelete ? (
                  <Pressable
                    testID={`grocery-recipes-delete-${list.id}`}
                    onPress={() => onDeleteList(list)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${list.name}`}
                  >
                    <Ionicons name="close-circle" size={15} color={colors.error} />
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* SHOW RECIPES -- the library stays hidden below this until it's
          pressed (see the `shown` state above); pressing it again after
          changing a filter is required every time, on purpose. ADD
          SELECTED sits right under it (used to be all the way at the
          bottom, past the whole grid) so both of this page's primary
          actions stay together instead of one of them scrolling away
          as soon as a recipe's checked. */}
      <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        <Pressable
          testID="grocery-recipes-show"
          onPress={() => {
            if (filteredRecipes.length === 0) return;
            setShown(true);
          }}
          disabled={filteredRecipes.length === 0}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.sm,
            minHeight: 52,
            borderRadius: radius.pill,
            backgroundColor: filteredRecipes.length === 0 ? colors.surfaceTertiary : colors.onSurface,
          }}
        >
          <Ionicons name="restaurant-outline" size={16} color={filteredRecipes.length === 0 ? colors.onSurfaceTertiary : colors.surface} />
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: filteredRecipes.length === 0 ? colors.onSurfaceTertiary : colors.surface,
            }}
          >
            {filteredRecipes.length === 0
              ? "No recipes match"
              : `Show ${filteredRecipes.length} Recipe${filteredRecipes.length === 1 ? "" : "s"}`}
          </Text>
        </Pressable>

        {selectedRecipeIds.size > 0 ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable
              testID="grocery-recipes-add-selected"
              onPress={handleAddSelectedRecipes}
              disabled={!targetListId}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.sm,
                minHeight: 52,
                borderRadius: radius.pill,
                backgroundColor: colors.onSurface,
                opacity: targetListId ? 1 : 0.4,
              }}
            >
              <Ionicons name="cart-outline" size={16} color={colors.surface} />
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }} numberOfLines={1}>
                Add elements to your selected list
              </Text>
            </Pressable>

            {/* Its own labeled pill, not a bare icon -- "Clear recipes"
                says exactly what it clears, so it doesn't read as the
                unrelated "Clear cart" (HomeStatCard's onClear) that
                happens to use a similar icon elsewhere on this space. */}
            <Pressable
              testID="grocery-recipes-clear-selected"
              onPress={() => setSelectedRecipeIds(new Set())}
              accessibilityRole="button"
              accessibilityLabel="Clear selected recipes"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: spacing.md,
                minHeight: 52,
                borderRadius: radius.pill,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.onSurfaceTertiary} />
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                Clear recipes
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* LIBRARY -- a 2-column photo grid: each card's colored block
          stands in for a recipe photo (tinted per cuisine, see
          CUISINE_VISUALS), tapping a card's body opens its full detail
          (GroceryRecipeDetailModal) rather than expanding in place --
          there's no room in a grid cell for ingredients/steps. The
          corner checkbox is its own tap target, same split the old
          inline-expand row used, for bulk-selecting into "Add
          ingredients from N recipes" below without opening anything. */}
      {shown ? (
        filteredRecipes.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: spacing["3xl"] ?? 48, gap: spacing.sm }}>
            <Ionicons name="restaurant-outline" size={28} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface, textAlign: "center" }}>
              No recipes here yet.
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {filteredRecipes.map((recipe) => {
              const checked = selectedRecipeIds.has(recipe.id);
              const match = matchRecipeIngredients(recipe, allItems, ingredientReferences);
              const complete = match.missingIngredients.length === 0;
              const cuisine = getPrimaryCuisine(recipe.tags);
              const mealType = getPrimaryMealType(recipe.tags);
              const visual = cuisine ? CUISINE_VISUALS[cuisine] : DEFAULT_VISUAL;

              return (
                <Pressable
                  key={recipe.id}
                  testID={`grocery-recipe-${recipe.id}`}
                  onPress={() => setDetailRecipeId(recipe.id)}
                  style={{
                    width: "48%",
                    borderRadius: radius.sm,
                    overflow: "hidden",
                    borderWidth: checked ? 2 : 1,
                    borderColor: checked ? colors.onSurface : colors.border,
                    backgroundColor: colors.surface,
                  }}
                >
                  <View style={{ height: 96, backgroundColor: visual.block, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={(recipe.imageKey as any) ?? "restaurant-outline"} size={32} color={colors.surface} />

                    {cuisine ? (
                      <View
                        style={{
                          position: "absolute",
                          top: 6,
                          left: 6,
                          paddingHorizontal: spacing.sm,
                          paddingVertical: 2,
                          borderRadius: radius.pill,
                          backgroundColor: "rgba(255,255,255,0.88)",
                        }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 0.3, color: visual.accent, textTransform: "uppercase" }}>
                          {CUISINE_LABEL[cuisine]}
                        </Text>
                      </View>
                    ) : null}

                    {/* Its own tap target, separate from the card's own
                        (which opens the detail sheet) -- checking a
                        recipe to bulk-add its ingredients shouldn't
                        also open it. */}
                    <Pressable
                      testID={`grocery-recipe-check-${recipe.id}`}
                      onPress={() => handleToggleRecipeSelection(recipe.id)}
                      hitSlop={12}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 22,
                        height: 22,
                        borderRadius: radius.pill,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: checked ? colors.onSurface : "rgba(255,255,255,0.7)",
                        borderWidth: checked ? 0 : 1.5,
                        borderColor: "rgba(255,255,255,0.9)",
                      }}
                    >
                      {checked ? <Ionicons name="checkmark" size={13} color={colors.surface} /> : null}
                    </Pressable>
                  </View>

                  <View style={{ padding: spacing.md }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: 4 }} numberOfLines={2}>
                      {recipe.title}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
                      {recipe.timeMinutes ? `${recipe.timeMinutes} min` : ""}
                      {recipe.timeMinutes && mealType ? " · " : ""}
                      {mealType ? MEAL_TYPE_LABEL[mealType] : ""}
                    </Text>

                    <View
                      style={{
                        alignSelf: "flex-start",
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 2,
                        borderRadius: radius.pill,
                        backgroundColor: complete ? colors.success + "22" : "transparent",
                        borderWidth: complete ? 0 : 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "800", color: complete ? colors.success : colors.onSurfaceTertiary }}>
                        {complete ? "Ready to cook" : `${match.matchedIngredients.length}/${recipe.ingredients.length}`}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )
      ) : null}
    </ScrollView>
    </SwipeBackView>

    <GroceryNewListModal
      visible={creatingList}
      name={newListName}
      onChangeName={setNewListName}
      onClose={() => {
        onCreatingListClose();
        setNewListName("");
        // Backing out of "New list" while it was opened from the
        // pending-add prompt (see resolveAddToNewList) abandons the
        // add too, rather than leaving ingredients silently stranded
        // with no prompt left on screen to finish them.
        setPendingAdd(null);
      }}
      onCreate={handleCreateListInline}
      saving={savingList}
    />

    <GroceryRecipeDetailModal
      visible={!!detailRecipeId}
      recipe={detailRecipe}
      match={detailMatch}
      otherTags={detailOtherTags}
      onClose={() => setDetailRecipeId(null)}
      onAddMissing={
        detailRecipe && detailMatch && targetListId && detailMatch.missingIngredients.length > 0
          ? () => {
              handleAddMissingIngredients(detailMatch.missingIngredients, detailRecipe.id);
              setDetailRecipeId(null);
            }
          : undefined
      }
    />

    {/* PENDING ADD -- both add paths (bulk "Add elements to your
        selected list" and a single recipe's "Add missing to list")
        land here instead of adding straight to targetListId: a user
        who never touched ADD TO's picker has no way to know these
        ingredients are about to land on whatever list happens to be
        selected there, so this spells it out and offers starting a
        fresh list instead. */}
    <Modal
      visible={!!pendingAdd && !creatingList}
      transparent
      animationType="fade"
      onRequestClose={() => setPendingAdd(null)}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: spacing.xl,
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            padding: spacing.xl,
          }}
        >
          {pendingAdd ? (
            <>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm }}>
                Add to which list?
              </Text>
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, marginBottom: spacing.lg, lineHeight: 20 }}>
                {(() => {
                  const targetList = lists.find((list) => list.id === targetListId);
                  const targetCount = targetListId ? getItemsForList(allItems, targetListId).length : 0;
                  return `Add ${pendingAdd.items.length} ingredient${pendingAdd.items.length === 1 ? "" : "s"} to "${targetList?.name ?? "your list"}" (${targetCount} item${targetCount === 1 ? "" : "s"} already on it), or start a new list just for these?`;
                })()}
              </Text>

              <Pressable
                testID="grocery-pending-add-current"
                onPress={resolveAddToCurrentList}
                style={{
                  minHeight: 52,
                  borderRadius: radius.sm,
                  backgroundColor: colors.onSurface,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: spacing.sm,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }} numberOfLines={1}>
                  Add to "{lists.find((list) => list.id === targetListId)?.name ?? "your list"}"
                </Text>
              </Pressable>

              <Pressable
                testID="grocery-pending-add-new-list"
                onPress={resolveAddToNewList}
                style={{
                  minHeight: 52,
                  borderRadius: radius.sm,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: spacing.sm,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.onSurface }}>
                  Create a new list for these
                </Text>
              </Pressable>

              <Pressable
                testID="grocery-pending-add-cancel"
                onPress={() => setPendingAdd(null)}
                style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.error }}>Cancel</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
    </>
  );
}
