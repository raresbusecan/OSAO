/** @deprecated Retired -- list navigation moved onto Home itself (see
 * GroceryDashboard.tsx's tab row, one pill per GroceryList plus a "+"),
 * so there's no more separate "folder of lists" page to open. This
 * environment can't delete files, so it's kept, unexported from
 * ./index.ts, and not imported anywhere -- safe to remove for real if
 * this environment ever can. */
import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { confirmAction } from "@/lib/confirm";
import type { GroceryItem, GroceryList } from "@/lib/spaces/grocery/grocery.types";
import { getGroceryListProgress } from "@/lib/spaces/grocery/grocery.calculations";
import { GroceryNewListModal } from "./GroceryNewListModal";

export type GroceryListsPageProps = {
  lists: GroceryList[];
  items: GroceryItem[];
  onBack: () => void;
  onOpenList: (listId: string) => void;
  /** Creates (or reuses a same-named) list -- the plain "+ New list"
   * popup just navigates into it and ignores the resolved id. */
  onCreateList: (name: string) => Promise<string>;
  onDeleteList: (listId: string) => void;
  /** Unchecks every bought item on one list in one go -- so finishing a
   * shopping trip doesn't mean unchecking each product one at a time.
   * Icon-only, next to Delete, only shown once something's bifat. */
  onClearCart: (listId: string) => void;
  /** Whether the inline "name your list" input is open -- controlled
   * from GroceryDashboard: the shared "+" FAB's "New List" action is
   * the only way to open it, no button on this page itself, so a
   * viewer never has two different-looking ways to start the same
   * thing depending on which page they're on. */
  creatingList: boolean;
  /** Closes the inline input -- fired on cancel and right after a
   * successful create. */
  onCreatingListClose: () => void;
};

/**
 * "Your Shopping List" on Home now lands here first -- a folder-like
 * view of the user's own named lists ("Week 1", "Party shopping"...)
 * instead of one flat list. Opening one of these cards is what shows
 * the familiar category-grouped GroceryShoppingListPage, now scoped to
 * just that list's items.
 *
 * Just the lists themselves -- no recipe/cuisine filters here anymore
 * (that "Quick Templates" generator moved to being purely a Recipes-page
 * thing; browsing/picking recipes to build a list from lives there and
 * on Smart List, not on this folder view).
 */
export function GroceryListsPage({
  lists,
  items,
  onBack,
  onOpenList,
  onCreateList,
  onDeleteList,
  onClearCart,
  creatingList,
  onCreatingListClose,
}: GroceryListsPageProps) {
  const { colors, spacing, radius } = useTheme();
  const [newListName, setNewListName] = useState("");

  const handleCreate = async () => {
    const trimmed = newListName.trim();
    if (!trimmed) {
      onCreatingListClose();
      return;
    }

    try {
      await onCreateList(trimmed);
    } catch {
      // onCreateList's underlying implementation already notified.
    }

    setNewListName("");
    onCreatingListClose();
  };

  const handleDelete = async (list: GroceryList) => {
    const confirmed = await confirmAction(
      "Delete list",
      `Delete "${list.name}" and everything on it?`,
      { confirmLabel: "Delete", destructive: true },
    );

    if (confirmed) onDeleteList(list.id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
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
            testID="grocery-lists-back"
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
            Your Lists
          </Text>
        </View>

        {/* LISTS */}
        {lists.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: spacing["3xl"] ?? 48, gap: spacing.sm }}>
            <Ionicons name="albums-outline" size={28} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface, textAlign: "center" }}>
              No lists yet.
            </Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, textAlign: "center" }}>
              Tap + to create one for this week, a trip, or anything else you shop for.
            </Text>
          </View>
        ) : (
          lists.map((list) => {
            const { bought, total } = getGroceryListProgress(items, list.id);
            const progress = total > 0 ? bought / total : 0;

            return (
              <Pressable
                key={list.id}
                testID={`grocery-list-card-${list.id}`}
                onPress={() => onOpenList(list.id)}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                  padding: spacing.lg,
                  marginBottom: spacing.md,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
                  <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface }}>{list.name}</Text>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    {bought > 0 ? (
                      <Pressable
                        testID={`grocery-list-clear-cart-${list.id}`}
                        onPress={() => onClearCart(list.id)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Clear cart for ${list.name}`}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: radius.pill,
                          backgroundColor: colors.surfaceSecondary,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="refresh-outline" size={16} color={colors.onSurfaceTertiary} />
                      </Pressable>
                    ) : null}

                    <Pressable
                      testID={`grocery-list-delete-${list.id}`}
                      onPress={() => handleDelete(list)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${list.name}`}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: radius.pill,
                        backgroundColor: colors.surfaceSecondary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.onSurfaceTertiary} />
                    </Pressable>

                    <Ionicons name="chevron-forward" size={17} color={colors.onSurfaceTertiary} />
                  </View>
                </View>

                <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
                  {total === 0 ? "No items yet" : `${bought} of ${total} bought`}
                </Text>

                {total > 0 ? (
                  <View
                    style={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: colors.surfaceTertiary,
                      overflow: "hidden",
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
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <GroceryNewListModal
        visible={creatingList}
        name={newListName}
        onChangeName={setNewListName}
        onClose={() => {
          setNewListName("");
          onCreatingListClose();
        }}
        onCreate={handleCreate}
      />
    </View>
  );
}
