import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { PressableScale } from "@/components/ui/PressableScale";
import { TopBar, Identity, Segmented, Pill, SectionHeader, Button, EmptyState } from "@/components/ui/primitives";
import { roCount } from "@/lib/format";
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
  breakfast: "Mic dejun",
  lunch: "Prânz",
  dinner: "Cină",
  snack: "Gustări",
};

const CUISINE_LABEL: Record<Cuisine, string> = {
  italian: "Italiană",
  mexican: "Mexicană",
  asian: "Asiatică",
  mediterranean: "Mediteraneană",
  american: "Americană",
  romanian: "Românească",
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
  };

  const handleToggleMealType = (mealType: MealType) => {
    setSelectedMealTypes((prev) => toggleInSet(prev, mealType));
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
        notifyAction("Adăugat", `${roCount(pendingAdd.items.length, "ingredient", "ingrediente")} pe lista „${trimmed}”.`);
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
    const listName = targetList?.name ?? "lista ta";
    notifyAction(
      "Adăugat",
      pendingAdd.skippedOnCurrentList > 0
        ? `${roCount(pendingAdd.items.length, "ingredient", "ingrediente")} pe „${listName}”. ${roCount(pendingAdd.skippedOnCurrentList, "era", "erau")} deja pe ea.`
        : `${roCount(pendingAdd.items.length, "ingredient", "ingrediente")} pe „${listName}”.`,
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
      notifyAction("Nimic nou", "Toate ingredientele sunt deja pe lista aceea.");
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

  const groc = useSpaceColors("grocery");
  const GROC = groc.color;
  const muted = colors.onSurfaceTertiary;
  const targetList = lists.find((list) => list.id === targetListId);

  return (
    <>
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="grocery-recipes-back" />
      <Identity color={GROC} kicker="Cumpărături" title="Rețete" subtitle="Alege ce ai poftă, apoi pune pe listă ce lipsește" info="grocery.recipes" />

      {/* Filters: cuisine and meal type as two tabs of pills. A dot marks
          the tab that has a selection while it's not the one open. Both
          axes combine with AND (see filteredRecipes). */}
      <View style={{ gap: spacing.md }}>
        <Segmented
          testIDPrefix="grocery-recipes-tab"
          options={[
            { key: "cuisine", label: selectedCuisines.size > 0 ? `Bucătărie (${selectedCuisines.size})` : "Bucătărie" },
            { key: "meal", label: selectedMealTypes.size > 0 ? `Masa (${selectedMealTypes.size})` : "Masa" },
          ]}
          value={filterTab}
          onChange={setFilterTab}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {filterTab === "cuisine"
            ? availableCuisines.map((cuisine) => (
                <Pill
                  key={cuisine}
                  testID={`grocery-recipes-cuisine-${cuisine}`}
                  label={CUISINE_LABEL[cuisine]}
                  active={selectedCuisines.has(cuisine)}
                  tone={GROC}
                  onPress={() => handleToggleCuisine(cuisine)}
                />
              ))
            : MEAL_TYPE_TAGS.map((type) => (
                <Pill
                  key={type}
                  testID={`grocery-recipes-meal-${type}`}
                  label={MEAL_TYPE_LABEL[type]}
                  active={selectedMealTypes.has(type)}
                  tone={GROC}
                  onPress={() => handleToggleMealType(type)}
                />
              ))}
        </ScrollView>
        {hasActiveFilters ? (
          <Pressable
            testID="grocery-recipes-clear-filters"
            onPress={() => {
              setSelectedCuisines(new Set());
              setSelectedMealTypes(new Set());
            }}
            style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ fontSize: 14, color: muted }}>Șterge filtrele</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Target list for "add missing" -- "+ Listă nouă" leads the row so
          it's never scrolled out of sight. */}
      <View style={{ gap: spacing.sm }}>
        <SectionHeader title="Adaugă pe lista" muted />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <Pill testID="grocery-recipes-new-list" icon="add" label="Listă nouă" dashed onPress={onCreatingListOpen} />
          {lists.map((list) => {
            const selected = targetListId === list.id;
            const canDelete = selected && canManageList(list);
            return (
              <View key={list.id} style={{ flexDirection: "row", alignItems: "center", borderRadius: radius.pill, backgroundColor: selected ? groc.fill : colors.surfaceSecondary, paddingRight: canDelete ? spacing.sm : 0 }}>
                <Pressable
                  testID={`grocery-recipes-target-${list.id}`}
                  onPress={() => setTargetListId(list.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{ height: 40, paddingLeft: spacing.md + 2, paddingRight: canDelete ? spacing.xs : spacing.md + 2, justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 13, fontWeight: selected ? "600" : "500", color: selected ? groc.ink : colors.onSurface }}>{list.name}</Text>
                </Pressable>
                {canDelete ? (
                  <Pressable
                    testID={`grocery-recipes-delete-${list.id}`}
                    onPress={() => onDeleteList(list)}
                    hitSlop={{ top: 10, bottom: 10, right: 10, left: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Șterge lista ${list.name}`}
                    style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(26,18,6,0.12)" }}
                  >
                    <Ionicons name="close" size={14} color={groc.ink} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* The grid is always on screen (approved board) and the filters
          above narrow it live; selected recipes go on the list in one go. */}
      <View style={{ gap: spacing.sm }}>
        <SectionHeader title={hasActiveFilters ? `${roCount(filteredRecipes.length, "rețetă", "rețete")} potrivite` : roCount(filteredRecipes.length, "rețetă", "rețete")} muted />
        {selectedRecipeIds.size > 0 ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="grocery-recipes-add-selected"
                icon="cart-outline"
                label={`Pune pe listă (${selectedRecipeIds.size})`}
                tone={groc.fill}
                onPress={handleAddSelectedRecipes}
                disabled={!targetListId}
              />
            </View>
            <Button testID="grocery-recipes-clear-selected" variant="secondary" icon="close-circle-outline" label="Golește" onPress={() => setSelectedRecipeIds(new Set())} />
          </View>
        ) : null}
      </View>

      {
        filteredRecipes.length === 0 ? (
          <EmptyState icon="restaurant-outline" message={hasActiveFilters ? "Nicio rețetă nu se potrivește filtrelor." : "Nicio rețetă aici încă."} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {filteredRecipes.map((recipe) => {
              const checked = selectedRecipeIds.has(recipe.id);
              const match = matchRecipeIngredients(recipe, allItems, ingredientReferences);
              const complete = match.missingIngredients.length === 0;
              const cuisine = getPrimaryCuisine(recipe.tags);
              const mealType = getPrimaryMealType(recipe.tags);
              const visual = cuisine ? CUISINE_VISUALS[cuisine] : DEFAULT_VISUAL;
              const meta = [recipe.timeMinutes ? `${recipe.timeMinutes} min` : null, mealType ? MEAL_TYPE_LABEL[mealType] : null].filter(Boolean).join(", ");

              return (
                <PressableScale
                  key={recipe.id}
                  testID={`grocery-recipe-${recipe.id}`}
                  onPress={() => setDetailRecipeId(recipe.id)}
                  accessibilityRole="button"
                  accessibilityLabel={recipe.title}
                  style={{
                    width: "47.8%",
                    borderRadius: radius.card,
                    overflow: "hidden",
                    backgroundColor: colors.surfaceSecondary,
                    borderWidth: 2,
                    borderColor: checked ? GROC : "transparent",
                  }}
                >
                  <View style={{ height: 96, backgroundColor: `${visual.block}40`, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={(recipe.imageKey as any) ?? "restaurant-outline"} size={30} color={visual.block} />
                    {cuisine ? (
                      <View style={{ position: "absolute", top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.surfaceSecondary }}>
                        <Text style={{ fontSize: 11, fontWeight: "500", color: colors.onSurface }}>{CUISINE_LABEL[cuisine]}</Text>
                      </View>
                    ) : null}
                    {/* Its own target, separate from the card's (which
                        opens the detail) -- checking to bulk-add shouldn't
                        also open the recipe. */}
                    <Pressable
                      testID={`grocery-recipe-check-${recipe.id}`}
                      onPress={() => handleToggleRecipeSelection(recipe.id)}
                      hitSlop={12}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`Selectează ${recipe.title}`}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: checked ? GROC : colors.surfaceSecondary,
                        borderWidth: checked ? 0 : 2,
                        borderColor: colors.control,
                      }}
                    >
                      {checked ? <Ionicons name="checkmark" size={16} color={groc.ink} /> : null}
                    </Pressable>
                  </View>

                  <View style={{ padding: spacing.md, gap: 4 }}>
                    <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={2}>{recipe.title}</Text>
                    {meta ? <Text style={{ fontSize: 13, color: muted }}>{meta}</Text> : null}
                    <Text style={{ fontSize: 12, fontWeight: "500", color: complete ? colors.success : muted }}>
                      {complete ? "Ai tot ce trebuie" : `Ai ${match.matchedIngredients.length} din ${recipe.ingredients.length} ingrediente`}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        )
      }
    </ScrollView>
    </SwipeBackView>

    <GroceryNewListModal
      visible={creatingList}
      name={newListName}
      onChangeName={setNewListName}
      onClose={() => {
        onCreatingListClose();
        setNewListName("");
        // Backing out of "Listă nouă" opened from the pending-add prompt
        // abandons the add too, rather than stranding the ingredients.
        setPendingAdd(null);
      }}
      onCreate={handleCreateListInline}
      saving={savingList}
    />

    <GroceryRecipeDetailModal
      visible={!!detailRecipeId}
      recipe={detailRecipe}
      match={detailMatch}
      otherTags={detailOtherTags.map((tag) => CUISINE_LABEL[tag as Cuisine] ?? tag)}
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

    {/* Both add paths land here instead of adding straight to the target
        list: say which list, or start a fresh one for these. */}
    <Sheet
      visible={!!pendingAdd && !creatingList}
      onClose={() => setPendingAdd(null)}
      centered
      icon="cart-outline"
      tone={GROC}
      title="Pe ce listă?"
      subtitle={
        pendingAdd
          ? `${roCount(pendingAdd.items.length, "ingredient", "ingrediente")} pe „${targetList?.name ?? "lista ta"}” (are deja ${roCount(targetListId ? getItemsForList(allItems, targetListId).length : 0, "produs", "produse")}) sau pe o listă nouă?`
          : undefined
      }
      footer={
        <>
          <Button testID="grocery-pending-add-current" label={`Pe „${targetList?.name ?? "lista ta"}”`} tone={GROC} onPress={resolveAddToCurrentList} />
          <Button testID="grocery-pending-add-new-list" variant="secondary" label="Pe o listă nouă" onPress={resolveAddToNewList} />
          <Button testID="grocery-pending-add-cancel" variant="ghost" label="Renunță" onPress={() => setPendingAdd(null)} />
        </>
      }
    />
    </>
  );
}
