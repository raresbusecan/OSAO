import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { notifyAction } from "@/lib/confirm";
import type { GroceryItem, GroceryList } from "@/lib/spaces/grocery/grocery.types";
import { findGroceryItemByName, getItemsForList, groupByCategory } from "@/lib/spaces/grocery/grocery.calculations";
import {
  SMART_LIST_FORMULA,
  SMART_LIST_TOTAL,
  buildSmartListPools,
  generateSmartList,
  getSmartListReplacement,
  type SmartListDraftItem,
} from "@/lib/spaces/grocery/grocery.smartList";
import { matchIngredientCategory, useIngredientReferences } from "@/lib/spaces/grocery/ingredientLookup";
import { matchRecipesToItems, useRecipes, type RecipeMatch } from "@/lib/spaces/grocery/recipeMatching";
import { getGroceryCategoryIcon } from "./grocery.ui.types";
import { GroceryNewListModal } from "./GroceryNewListModal";

export type GrocerySmartListPageProps = {
  /** Every grocery item this user has ever added, across every list --
   * used both to build the suggestion pools (see buildSmartListPools)
   * and, filtered down to whichever list is currently the "ADD TO"
   * target, for duplicate prevention (see handleAddToList). Not a
   * pre-scoped "current list" prop on purpose: the target can be
   * switched to a *different* list right here via the ADD TO picker,
   * and duplicate-checking has to follow that switch, not stay pinned
   * to whichever list the page happened to open from. */
  allItems: GroceryItem[];
  /** Every list the generated products can be added to -- possibly
   * empty; generating (and previewing) a draft never depends on having
   * one, only "Add to my list" does (see the inline creator below). */
  lists: GroceryList[];
  /** Pre-selects the "Add to" target -- set when Smart List is opened
   * from inside a specific list (its FAB), so there's nothing to pick;
   * left unset when opened from Home, where the picker below decides. */
  initialListId?: string | null;
  onBack: () => void;
  /** Creates (or reuses a same-named) list and resolves to its real,
   * server-confirmed id, without navigating anywhere -- used by the
   * inline "+ New list" here when there's nothing to target yet.
   * Awaited (see handleCreateListInline) rather than trusted
   * synchronously: an id grabbed before the create request resolves
   * would silently orphan every item added against it later. */
  onCreateList: (name: string) => Promise<string>;
  onAddToList: (draft: SmartListDraftItem[], listId: string, recipeIds?: string[]) => void;
  /** Whether the inline "name your list" input (in ADD TO below) is
   * open -- controlled from GroceryDashboard: the shared "+" FAB's "New
   * List" action is the only way to open it, no button here either. */
  creatingList: boolean;
  onCreatingListClose: () => void;
};

/**
 * The 5-4-3-2-1 formula, explained, then generated into an editable
 * draft. Nothing here touches the real shopping list until "Add to my
 * list" -- the draft is its own local state the whole time, exactly so
 * "the generated list isn't final" (every item can be replaced or
 * removed before it becomes real). Generating and editing the draft
 * never requires a list to already exist -- only committing it does,
 * and the "ADD TO" section below can create one on the spot for that.
 */
export function GrocerySmartListPage({
  allItems,
  lists,
  initialListId,
  onBack,
  onCreateList,
  onAddToList,
  creatingList,
  onCreatingListClose,
}: GrocerySmartListPageProps) {
  const { colors, spacing, radius } = useTheme();
  const [draft, setDraft] = useState<SmartListDraftItem[] | null>(null);
  const [targetListId, setTargetListId] = useState<string | null>(initialListId ?? lists[0]?.id ?? null);
  const [newListName, setNewListName] = useState("");
  const [savingList, setSavingList] = useState(false);
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());
  // Which recipes the *current* draft was built from -- set by
  // handleGenerateFromRecipes, cleared by the random formula generator
  // and "Start over", so "Add to my list" below only ever attributes a
  // draft to recipes when it actually came from picking some.
  const [draftRecipeIds, setDraftRecipeIds] = useState<string[]>([]);
  const ingredientReferences = useIngredientReferences();
  const recipes = useRecipes();

  // Global dictionary + this user's own history, merged per category --
  // see buildSmartListPools for why (recomputed only when either source
  // actually changes, not on every render/draft edit).
  const pools = useMemo(
    () => buildSmartListPools(ingredientReferences, allItems),
    [ingredientReferences, allItems],
  );

  // "Recipes you can make" matches against every product this user has
  // ever recorded, across every list -- not just whichever list is
  // currently the ADD TO target. "Add missing to list" below still adds
  // only to that target; it's just what counts as "already have" that
  // looks at the user's whole history in DB, not one list's slice of it.
  const recipeMatches = useMemo(
    () => matchRecipesToItems(recipes, allItems, ingredientReferences),
    [recipes, allItems, ingredientReferences],
  );

  const handleGenerate = () => {
    setDraftRecipeIds([]);
    setDraft(generateSmartList(pools));
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

  // Builds the draft from the ingredients the checked recipes actually
  // need -- every ingredient, not just what's missing (unlike "Add
  // missing to list" on a single recipe): the draft is still just a
  // preview at this point, Replace/Remove below let the user trim it
  // down before anything real gets added, same as the random formula's
  // own draft. Deduped by name across recipes so picking two recipes
  // that both call for "Garlic" doesn't add it twice.
  const handleGenerateFromRecipes = () => {
    const selected = recipeMatches.filter((match) => selectedRecipeIds.has(match.recipe.id));
    if (selected.length === 0) return;

    const seen = new Map<string, string>();
    selected.forEach((match) => {
      match.recipe.ingredients.forEach((ingredient) => {
        const key = ingredient.name.trim().toLowerCase();
        if (key && !seen.has(key)) seen.set(key, ingredient.name.trim());
      });
    });

    const draftItems: SmartListDraftItem[] = Array.from(seen.values()).map((name) => ({
      id: `recipe-draft-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      category: matchIngredientCategory(ingredientReferences, name) ?? "Other",
    }));

    setDraftRecipeIds(selected.map((match) => match.recipe.id));
    setDraft(draftItems);
  };

  const handleReplace = (item: SmartListDraftItem) => {
    if (!draft) return;

    const sameCategoryNames = draft.filter((d) => d.category === item.category).map((d) => d.name);
    const replacement = getSmartListReplacement(pools, item.category, sameCategoryNames);

    if (!replacement) {
      notifyAction("No more options", `No other ${item.category.toLowerCase()} suggestions left to try.`);
      return;
    }

    setDraft(draft.map((d) => (d.id === item.id ? { ...d, name: replacement } : d)));
  };

  const handleRemove = (id: string) => {
    setDraft((current) => (current ? current.filter((d) => d.id !== id) : current));
  };

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
    } catch {
      // onCreateList's own implementation already shows the error --
      // leave the input open so the user can just try again.
    } finally {
      setSavingList(false);
    }
  };

  // Adds only what a recipe is missing -- what it already found on the
  // list stays put, never duplicated. No dedupe check needed here (the
  // way missingIngredients was computed already guarantees none of them
  // are on the target list); category is guessed the same way Add
  // Product guesses one while typing, falling back to "Other".
  const handleAddMissingIngredients = (match: RecipeMatch) => {
    if (!targetListId || match.missingIngredients.length === 0) return;

    const draftItems: SmartListDraftItem[] = match.missingIngredients.map((name) => ({
      id: `recipe-${match.recipe.id}-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      category: matchIngredientCategory(ingredientReferences, name) ?? "Other",
    }));

    onAddToList(draftItems, targetListId, [match.recipe.id]);
    notifyAction(
      "Added",
      `${draftItems.length} missing ingredient${draftItems.length === 1 ? "" : "s"} added to your list.`,
    );
  };

  const handleAddToList = () => {
    if (!draft || draft.length === 0 || !targetListId) return;

    // Duplicate prevention: skip anything already on the *target* list
    // specifically -- re-derived here from allItems + the currently
    // selected targetListId, since the target can be switched via the
    // ADD TO picker right up until this button is pressed. The same
    // product existing on a *different* list is completely fine (see
    // getItemsForList) -- duplicates only matter within one list.
    const itemsOnTargetList = getItemsForList(allItems, targetListId);
    const toAdd = draft.filter((d) => !findGroceryItemByName(itemsOnTargetList, d.name));
    const skipped = draft.length - toAdd.length;

    if (toAdd.length === 0) {
      notifyAction("Nothing new", "All ingredients are already on that list.");
      return;
    }

    onAddToList(toAdd, targetListId, draftRecipeIds.length > 0 ? draftRecipeIds : undefined);
    notifyAction(
      "Added",
      skipped > 0
        ? `${toAdd.length} products added -- ${skipped} were already on that list.`
        : `${toAdd.length} products added to your list.`,
    );
    onBack();
  };

  return (
    <>
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
          paddingBottom: spacing.sm,
        }}
      >
        <Pressable
          testID="smart-list-back"
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSecondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>
          Smart List
        </Text>
      </View>

      <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, marginBottom: spacing.xl }}>
        The balanced 5-4-3-2-1 formula.
      </Text>

      {/* FORMULA -- stays visible even after generating, so the draft
          below always reads against the rule it's supposed to follow. */}
      <View style={{ marginBottom: spacing.xl }}>
        {SMART_LIST_FORMULA.map(({ category, count }) => (
          <View
            key={category}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.lg,
              paddingVertical: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, width: 34 }}>
              {count}
            </Text>
            <Text style={{ fontSize: 16, color: colors.onSurface }}>{category}</Text>
          </View>
        ))}

        <Text style={{ marginTop: spacing.sm, fontSize: 13, color: colors.onSurfaceTertiary }}>
          Total {SMART_LIST_TOTAL} products
        </Text>
      </View>

      {/* ADD TO -- which list the draft ends up on; defaults to the
          list Smart List was opened from, or the first list when opened
          from Home. With no lists at all yet, "+ New list" creates one
          on the spot instead of blocking generation on having one
          already. */}
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

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {lists.map((list) => {
            const selected = targetListId === list.id;
            return (
              <Pressable
                key={list.id}
                testID={`smart-list-target-${list.id}`}
                onPress={() => setTargetListId(list.id)}
                style={{
                  paddingHorizontal: spacing.md,
                  minHeight: 38,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.onSurface : colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: selected ? colors.onSurface : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: selected ? colors.surface : colors.onSurface }}>
                  {list.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* RECIPES YOU CAN MAKE -- matched against every product this user
          has ever recorded across all their lists (see recipeMatches
          above), not the generated draft below or any single list.
          Only recipes with at least one overlapping ingredient show up
          at all, closest match first. Hidden once a draft exists (from
          here or the formula below) so attention stays on reviewing it. */}
      {!draft && recipeMatches.length > 0 ? (
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
            RECIPES YOU CAN MAKE
          </Text>

          {recipeMatches.slice(0, 6).map((match) => {
            const expanded = expandedRecipeId === match.recipe.id;
            const complete = match.missingIngredients.length === 0;
            const checked = selectedRecipeIds.has(match.recipe.id);

            return (
              <Pressable
                key={match.recipe.id}
                testID={`smart-list-recipe-${match.recipe.id}`}
                onPress={() => setExpandedRecipeId(expanded ? null : match.recipe.id)}
                style={{
                  borderWidth: 1,
                  borderColor: checked ? colors.onSurface : colors.border,
                  borderRadius: radius.lg,
                  padding: spacing.lg,
                  marginBottom: spacing.sm,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  {/* Its own tap target, separate from the row's own
                      (which only expands/collapses) -- picking a recipe
                      for "Generate list from recipes" shouldn't also
                      toggle its steps open. */}
                  <Pressable
                    testID={`smart-list-recipe-check-${match.recipe.id}`}
                    onPress={() => handleToggleRecipeSelection(match.recipe.id)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: checked ? colors.onSurface : "transparent",
                      borderWidth: checked ? 0 : 1.5,
                      borderColor: colors.border,
                    }}
                  >
                    {checked ? <Ionicons name="checkmark" size={14} color={colors.surface} /> : null}
                  </Pressable>

                  <Ionicons name={(match.recipe.imageKey as any) ?? "restaurant-outline"} size={16} color={colors.onSurfaceTertiary} />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: colors.onSurface }}>
                    {match.recipe.title}
                  </Text>
                  {match.recipe.timeMinutes ? (
                    <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{match.recipe.timeMinutes} min</Text>
                  ) : null}
                  <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.onSurfaceTertiary} />
                </View>

                <Text
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    fontWeight: "700",
                    color: complete ? colors.success : colors.onSurfaceTertiary,
                  }}
                >
                  {complete
                    ? "You have everything"
                    : `${match.matchedIngredients.length}/${match.recipe.ingredients.length} ingredients you have`}
                </Text>

                {expanded ? (
                  <View style={{ marginTop: spacing.md }}>
                    {!complete ? (
                      <>
                        <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, marginBottom: spacing.sm, lineHeight: 18 }}>
                          Missing: {match.missingIngredients.join(", ")}
                        </Text>

                        <Pressable
                          testID={`smart-list-recipe-add-missing-${match.recipe.id}`}
                          onPress={() => handleAddMissingIngredients(match)}
                          style={{
                            alignSelf: "flex-start",
                            paddingHorizontal: spacing.md,
                            minHeight: 32,
                            borderRadius: radius.pill,
                            backgroundColor: colors.surfaceSecondary,
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: spacing.md,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurface }}>
                            Add missing to list
                          </Text>
                        </Pressable>
                      </>
                    ) : null}

                    {match.recipe.steps.map((step, index) => (
                      <Text key={index} style={{ fontSize: 13, color: colors.onSurface, lineHeight: 19, marginBottom: 4 }}>
                        {index + 1}. {step}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })}

          {selectedRecipeIds.size > 0 ? (
            <Pressable
              testID="smart-list-generate-from-recipes"
              onPress={handleGenerateFromRecipes}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.sm,
                minHeight: 52,
                borderRadius: radius.pill,
                backgroundColor: colors.onSurface,
                marginTop: spacing.sm,
              }}
            >
              <Ionicons name="flash" size={16} color={colors.surface} />
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>
                Generate list from {selectedRecipeIds.size} recipe{selectedRecipeIds.size === 1 ? "" : "s"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!draft ? (
        <>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 19, marginBottom: spacing.xl }}>
            A simple recipe for a balanced basket: five vegetables, four fruits, three proteins, two
            grains and one healthy fat.
          </Text>

          <Pressable
            testID="smart-list-generate"
            onPress={handleGenerate}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
              minHeight: 56,
              borderRadius: radius.pill,
              backgroundColor: colors.onSurface,
            }}
          >
            <Ionicons name="flash" size={18} color={colors.surface} />
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.surface }}>Generate my list</Text>
          </Pressable>
        </>
      ) : (
        <>
          {/* Grouped by whatever categories are actually in the draft --
              not just the formula's own 5, since a recipe-derived draft
              (see handleGenerateFromRecipes) can include ingredients in
              any category (Dairy, Bakery, Other...). */}
          {groupByCategory(draft).map(({ category, items: categoryItems }) => {
            // "Replace" pulls from buildSmartListPools, which only ever
            // builds pools for the formula's 5 categories -- offering it
            // for anything else would just always say "no more options".
            const canReplace = SMART_LIST_FORMULA.some((f) => f.category === category);

            return (
              <View key={category} style={{ marginBottom: spacing.lg }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    letterSpacing: 1,
                    color: colors.onSurfaceTertiary,
                    marginBottom: spacing.sm,
                    textTransform: "uppercase",
                  }}
                >
                  {category}
                </Text>

                <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden" }}>
                  {categoryItems.map((item, index) => (
                    <View
                      key={item.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                        borderBottomWidth: index === categoryItems.length - 1 ? 0 : 1,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <Ionicons name={getGroceryCategoryIcon(item.category)} size={16} color={colors.onSurfaceTertiary} />
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface }}>
                        {item.name}
                      </Text>

                      {canReplace ? (
                        <Pressable
                          testID={`smart-list-replace-${item.id}`}
                          onPress={() => handleReplace(item)}
                          hitSlop={8}
                          style={{ paddingHorizontal: spacing.sm, paddingVertical: 4 }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurface }}>Replace</Text>
                        </Pressable>
                      ) : null}

                      <Pressable
                        testID={`smart-list-remove-${item.id}`}
                        onPress={() => handleRemove(item.id)}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={16} color={colors.onSurfaceTertiary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          <Pressable
            testID="smart-list-regenerate"
            onPress={() => {
              setDraft(null);
              setDraftRecipeIds([]);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            <Ionicons name="refresh" size={14} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>Start over</Text>
          </Pressable>

          <Pressable
            testID="smart-list-add-to-list"
            onPress={handleAddToList}
            disabled={draft.length === 0 || !targetListId}
            style={{
              minHeight: 56,
              borderRadius: radius.pill,
              backgroundColor: colors.onSurface,
              alignItems: "center",
              justifyContent: "center",
              opacity: draft.length === 0 || !targetListId ? 0.4 : 1,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.surface }}>
              Add {draft.length} to my list
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>

    <GroceryNewListModal
      visible={creatingList}
      name={newListName}
      onChangeName={setNewListName}
      onClose={() => {
        onCreatingListClose();
        setNewListName("");
      }}
      onCreate={handleCreateListInline}
      saving={savingList}
    />
    </>
  );
}
