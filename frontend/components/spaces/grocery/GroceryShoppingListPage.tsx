import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import type { GroceryItem, GroceryCategory } from "@/lib/spaces/grocery/grocery.types";
import { getGroceryProgress, groupGroceryItemsByCategory } from "@/lib/spaces/grocery/grocery.calculations";
import { useRecipes } from "@/lib/spaces/grocery/recipeMatching";
import { GroceryItemRow } from "./GroceryItemRow";
import { GroceryProductModal } from "./GroceryProductModal";
import { GroceryQuickAddBar } from "./GroceryQuickAddBar";

export type GroceryShoppingListPageProps = {
  /** Already scoped to one GroceryList -- see GroceryDashboard's
   * getItemsForList(items, activeListId). */
  items: GroceryItem[];
  /** The owning list's name, shown as the page title (e.g. "Week 1")
   * instead of the generic "Shopping List". */
  listName: string;
  onBack: () => void;
  onToggle: (id: string) => void;
  onEdit: (id: string, draft: { name: string; quantity?: string; category: GroceryCategory; price?: number }) => void;
  onDelete: (id: string) => void;
  /** Adds a product straight to this list -- see GroceryQuickAddBar,
   * which replaced the FAB's old "Add Product" -> full-sheet flow as
   * the everyday way to add here. */
  onQuickAdd: (draft: { name: string; category: GroceryCategory }) => void;
  /** Ids of the recipes this list was generated from (a Quick Template,
   * "Add ingredients from N recipes", "Generate list from recipes"...)
   * -- see GroceryList.recipeIds. Rendered as "Made with recipes" right
   * under the items above, resolved against the recipe library and
   * filtered to only the ones the user actually picked, never the
   * whole library. */
  recipeIds?: string[];
};

/**
 * One list's items, grouped by category -- everything Home's teaser
 * card only summarizes. No Add button of its own: the shared "+" FAB
 * (see GroceryDashboard.tsx) is the one and only way to add a product,
 * anywhere in this space -- a second, page-local Add button next to it
 * was confusing (two "+"s doing the same thing) and its pinned position
 * fought with the scrolling content underneath it. The pencil icon on a
 * row still opens this same sheet, just already in edit mode.
 */
export function GroceryShoppingListPage({
  items,
  listName,
  onBack,
  onToggle,
  onEdit,
  onDelete,
  onQuickAdd,
  recipeIds,
}: GroceryShoppingListPageProps) {
  const { colors, spacing, radius } = useTheme();
  const { bought, total } = getGroceryProgress(items);
  const groups = groupGroceryItemsByCategory(items);
  const progress = total > 0 ? bought / total : 0;

  const recipes = useRecipes();
  // Only the recipes actually recorded on this list, in the order
  // recipeIds has them -- never the whole library, and silently drops
  // an id that no longer resolves (a recipe removed from the library
  // after the list was generated from it).
  const madeWithRecipes = (recipeIds ?? [])
    .map((id) => recipes.find((recipe) => recipe.id === id))
    .filter((recipe): recipe is NonNullable<typeof recipe> => !!recipe);
  const [expandedMadeWithId, setExpandedMadeWithId] = useState<string | null>(null);

  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null);
  // Collapsed by default -- a list opens showing just its category
  // titles, and each one expands on tap to reveal its items. Keyed by
  // category name rather than index so a category keeps its
  // expanded/collapsed state even as items move in and out of it.
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleSave = (draft: { name: string; quantity?: string; category: GroceryCategory; price?: number }) => {
    if (!editingItem) return;
    onEdit(editingItem.id, draft);
    setEditingItem(null);
  };

  const handleDelete = () => {
    if (!editingItem) return;
    onDelete(editingItem.id);
    setEditingItem(null);
  };

  return (
    <SwipeBackView onBack={onBack} style={{ backgroundColor: colors.surface }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          // Clears the app's own bottom tab bar, same value every other
          // sub-page in the app uses -- nothing of this page's own is
          // pinned down there anymore.
          paddingBottom: 150,
        }}
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
            testID="grocery-list-back"
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
            {listName}
          </Text>
        </View>

        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
          {bought} of {total} bought
        </Text>

        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.surfaceTertiary,
            overflow: "hidden",
            marginBottom: spacing.xl,
          }}
        >
          <View
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: "100%",
              borderRadius: 3,
              backgroundColor: colors.onSurface,
            }}
          />
        </View>

        <GroceryQuickAddBar onAdd={onQuickAdd} />

        {/* LIST */}
        {total === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: spacing["3xl"] ?? 48, gap: spacing.sm }}>
            <Ionicons name="cart-outline" size={28} color={SPACE_IDENTITY_COLORS.grocery} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface, textAlign: "center" }}>
              Your shopping list is empty.
            </Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, textAlign: "center" }}>
              Add your first product above.
            </Text>
          </View>
        ) : (
          groups.map((group) => {
            const expanded = expandedCategories.has(group.category);
            const categoryBought = group.items.filter((item) => item.inCart).length;

            return (
              <View key={group.category} style={{ marginBottom: spacing.md }}>
                <Pressable
                  testID={`grocery-category-toggle-${group.category}`}
                  onPress={() => toggleCategory(group.category)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minHeight: 48,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surfaceSecondary,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "800",
                        letterSpacing: 0.5,
                        color: colors.onSurface,
                        textTransform: "uppercase",
                      }}
                    >
                      {group.category}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
                      {categoryBought}/{group.items.length}
                    </Text>
                  </View>

                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.onSurfaceTertiary}
                  />
                </Pressable>

                {expanded ? (
                  <View
                    style={{
                      marginTop: spacing.sm,
                      backgroundColor: colors.surfaceSecondary,
                      borderRadius: radius.lg,
                      overflow: "hidden",
                    }}
                  >
                    {group.items.map((item, index) => (
                      <View
                        key={item.id}
                        style={{
                          borderBottomWidth: index === group.items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                        }}
                      >
                        <GroceryItemRow item={item} onToggle={onToggle} onOpenMenu={setEditingItem} onDelete={onDelete} />
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}

        {/* MADE WITH RECIPES -- right under the list's own items, on
            purpose: this is what those items are *for*, not a separate
            destination. Only the recipes this exact list was generated
            from (see recipeIds above), never the whole library. */}
        {madeWithRecipes.length > 0 ? (
          <View style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "800",
                letterSpacing: 1,
                color: colors.onSurfaceTertiary,
                marginBottom: spacing.sm,
              }}
            >
              MADE WITH RECIPES
            </Text>

            {madeWithRecipes.map((recipe) => {
              const expanded = expandedMadeWithId === recipe.id;
              return (
                <Pressable
                  key={recipe.id}
                  testID={`grocery-list-made-with-${recipe.id}`}
                  onPress={() => setExpandedMadeWithId(expanded ? null : recipe.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.lg,
                    padding: spacing.lg,
                    marginBottom: spacing.sm,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Ionicons name={(recipe.imageKey as any) ?? "restaurant-outline"} size={16} color={colors.onSurfaceTertiary} />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "800", color: colors.onSurface }}>
                      {recipe.title}
                    </Text>
                    {recipe.timeMinutes ? (
                      <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{recipe.timeMinutes} min</Text>
                    ) : null}
                    <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.onSurfaceTertiary} />
                  </View>

                  <Text style={{ marginTop: 6, fontSize: 12, color: colors.onSurfaceTertiary }}>
                    {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? "" : "s"}
                  </Text>

                  {expanded ? (
                    <View style={{ marginTop: spacing.md }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.5, color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
                        INGREDIENTS
                      </Text>
                      {recipe.ingredients.map((ingredient) => (
                        <Text key={ingredient.name} style={{ fontSize: 13, color: colors.onSurface, marginBottom: 4 }}>
                          {ingredient.name}
                        </Text>
                      ))}

                      {recipe.steps.length > 0 ? (
                        <>
                          <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.5, color: colors.onSurfaceTertiary, marginTop: spacing.sm, marginBottom: spacing.sm }}>
                            STEPS
                          </Text>
                          {recipe.steps.map((step, index) => (
                            <Text key={index} style={{ fontSize: 13, color: colors.onSurface, lineHeight: 19, marginBottom: 4 }}>
                              {index + 1}. {step}
                            </Text>
                          ))}
                        </>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <GroceryProductModal
        visible={!!editingItem}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </SwipeBackView>
  );
}
