import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, DeviceEventEmitter, Animated } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, SPACE_ON_FILL } from "@/lib/spaces/spaceProfile";
import { CircleButton, TopBar, Identity, Button } from "@/components/ui/primitives";
import { roCount } from "@/lib/format";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth";
import { Avatar } from "@/components/Avatar";
import { REFRESH_EVENT } from "@/app/(tabs)/_layout";

import { MAX_GROCERY_LISTS, type GroceryCategory, type GroceryItem, type GroceryList, type SpaceMember } from "@/lib/spaces/grocery/grocery.types";
import { getItemsForList, findGroceryListByName } from "@/lib/spaces/grocery/grocery.calculations";
import {
  groceryItemToItemBody,
  groceryListToItemBody,
  groceryTripToItemBody,
  isSavedItemId,
  loadMyGroceryData,
} from "@/lib/spaces/grocery/groceryItems";
import { GroceryProductModal } from "./GroceryProductModal";
import { GroceryItemRow } from "./GroceryItemRow";
import { GroceryRecipesPage } from "./GroceryRecipesPage";
import { SpaceMembersModal } from "./SpaceMembersModal";
import { GroceryQuickAddBar } from "./GroceryQuickAddBar";
import { GroceryNewListModal } from "./GroceryNewListModal";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { PressableScale } from "@/components/ui/PressableScale";
import { motion, useReducedMotion } from "@/lib/motion";
import { GrocerySuggestionModal, type SupplySuggestion } from "./GrocerySuggestionModal";
import { GroceryFinishShoppingSheet } from "./GroceryFinishShoppingSheet";
import { itemToSupplyEntry, supplyEntryToItemBody } from "@/lib/spaces/home/homeItems";
import { getSupplyRestockEstimate } from "@/lib/spaces/home/calculations/dashboard.calculations";
import type { HomeSupplyEntry } from "@/lib/spaces/home/home.types";

export type GroceryDashboardProps = {
  space: any;
  onEdit?: () => void;
  onItemsChange?: (items: GroceryItem[]) => void;
};

/**
 * Which screen inside the space is on top -- "home" is the dashboard
 * below (now the ONLY place a list's items are shown -- see the tab
 * row at its top, one tab per GroceryList, switching `activeListId`
 * in place rather than navigating anywhere) and "recipes" is the
 * browsing library (GroceryRecipesPage).
 *
 * There used to be a "lists" folder view (GroceryListsPage, deleted)
 * and a separate "list" view (GroceryShoppingListPage) you navigated
 * into from it -- replaced by Home's own tabs so switching between
 * lists never leaves the space's main page. GroceryShoppingListPage.tsx
 * itself is untouched and still there, just not wired into this switch
 * right now, same as GrocerySmartListPage below -- its collapsible
 * per-category grouping and "Made with recipes" section aren't
 * reachable from anywhere at the moment.
 *
 * No "smart" view anymore -- Smart List is paused, and currently has
 * no entry point anywhere in the UI (its old one was the now-removed
 * shared "+" FAB). GrocerySmartListPage.tsx itself is untouched and
 * still there, just not wired into this switch right now -- re-enabling
 * the feature later is picking the view back up, not rebuilding it.
 */
type GroceryView = "home" | "recipes";

function makeItemId(): string {
  return `gr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function makeListId(): string {
  return `list-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * The container for the whole Grocery space -- owns the item list and
 * the user's own named lists (the two things every sub-screen needs)
 * and switches between Home (below, itself showing whichever list's
 * tab is active) and Recipes, the same way CarDashboard.tsx owns
 * carData and switches in its own sub-pages.
 *
 * Lists and items now persist for real (see lib/spaces/grocery/
 * groceryItems.ts -- the same generic `items` table + type
 * discriminator Car already uses, user-scoped, nothing shared between
 * accounts): every mutation below applies to local state immediately,
 * then saves via the API, then swaps the optimistic entry for the
 * server-confirmed one (real numeric id) -- and rolls the optimistic
 * change back with a notice on failure, same pattern as
 * app/(tabs)/[id].tsx's handle*Save functions for Car.
 */
export default function GroceryDashboard({
  space,
  onEdit,
  onItemsChange,
}: GroceryDashboardProps) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  // Wider than the old 2-column wrap's 48% (~half the screen) -- a
  // longer list name like "Party shopping" was clipping down to its
  // first word at that width. ~1.7 cards fit in view instead of 2, so
  // there's more room for the name before it truncates (see
  // ListCard's numberOfLines={1}), and the next card still peeks in
  // as a scroll affordance.

  // No mock seed -- loadMyGroceryData below fills this from the API,
  // same as Home's taskEntries. Combined with `key={space.id}` on this
  // component in [id].tsx (a full remount on every space switch), this
  // guarantees a brand new instance never starts out holding another
  // space's -- or demo data's -- lists/items even for one frame.
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [view, setView] = useState<GroceryView>("home");
  // Which list's tab is selected on Home -- null only until the first
  // list loads (see the fallback in effectiveActiveListId below) or
  // when there are no lists at all yet.
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [creatingList, setCreatingList] = useState(false);
  // The inline "name your list" input's own field -- was local to the
  // now-deleted GroceryListsPage, moved up here since Home's tab row
  // is what opens it now (the shared `creatingList` visibility flag
  // still also drives GroceryRecipesPage/GrocerySmartListPage's own
  // instance of the same popup).
  const [newListName, setNewListName] = useState("");

  // Who can see/use the ACTIVE list -- the space owner (space.user, via
  // space.is_owner telling us whether *we* are them; they can see every
  // list in their own space) plus whoever's been added to just this one
  // list via SpaceMembersModal (see loadListMembers below, keyed on
  // effectiveActiveListId -- switching tabs reloads this). Only the
  // owner can add/remove someone, enforced both here (isOwner) and
  // server-side.
  const [owner, setOwner] = useState<SpaceMember | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const isOwner = space?.is_owner ?? true;

  // The pencil icon on a Home row opens the same edit sheet
  // GroceryShoppingListPage uses -- kept as its own bit of state here
  // since Home renders items outside any single list's page. Adding is
  // no longer this sheet at all (see GroceryQuickAddBar below); this is
  // edit-only now.
  const [homeEditingItem, setHomeEditingItem] = useState<GroceryItem | null>(null);

  // Cross-space: every Home supply the user tracks, regardless of which
  // Home space it lives in (see ItemController::index -- filtering by
  // type alone, no space_id, already scopes to "this user's own items").
  // Powers the "probably running low" suggestion popup below; loaded
  // once, independent of which Grocery list is active.
  const [homeSupplies, setHomeSupplies] = useState<HomeSupplyEntry[]>([]);
  // Which list a suggestion popup has already been shown for this
  // session -- a ref, not state, since it should never itself trigger a
  // re-render; it just gates handleToggle below from popping the same
  // list's suggestions again on every single item checked.
  const suggestedListIdsRef = useRef<Set<string>>(new Set());
  const [suggestionListId, setSuggestionListId] = useState<string | null>(null);
  // Which list's "Finalizează cumpărăturile" sheet is open -- see
  // handleFinishShopping.
  const [finishShoppingListId, setFinishShoppingListId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listItems({ type: "home_supply" })
      .then((raw) => setHomeSupplies(raw.map(itemToSupplyEntry)))
      .catch((error) => console.error("[GROCERY] failed to load home supplies:", error));
  }, []);

  // Pulls whatever's actually saved -- mirrors app/(tabs)/[id].tsx's
  // loadCarItems() call for Car. Scoped to THIS space (see
  // loadMyGroceryData): this space's own lists, plus anything shared
  // with the user from anywhere else -- a second Grocery space no
  // longer pulls in the first one's lists.
  useEffect(() => {
    if (!space?.id) return;
    let mounted = true;

    loadMyGroceryData(space.id)
      .then(({ lists: loadedLists, items: loadedItems }) => {
        if (!mounted) return;
        setLists(loadedLists);
        setItems(loadedItems);
      })
      .catch((error) => {
        console.error("[GROCERY] failed to load:", error);
      });

    return () => {
      mounted = false;
    };
  }, [space?.id]);

  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  // Falls back to the first list whenever activeListId hasn't been set
  // yet, or no longer resolves (its list was just deleted) -- a plain
  // derived value rather than a synced-in-an-effect one, so there's
  // never a render where a deleted list is still "selected". Tapping a
  // tab (setActiveListId) always wins over this fallback while it
  // still resolves.
  const effectiveActiveListId =
    activeListId && lists.some((list) => list.id === activeListId) ? activeListId : (lists[0]?.id ?? null);

  // Membership is per-LIST, not per-space (see api.ts's getListMembers)
  // -- reloaded every time the active tab changes, so the header's
  // avatar stack and "Shared with N other" line always describe
  // whichever list is actually showing, never the space as a whole.
  //
  // Race-guarded: switching tabs fires a new request before the
  // previous one necessarily resolves, and network timing gives no
  // guarantee they come back in order -- without membersRequestIdRef, a
  // slow response for a list you've since tabbed away from could land
  // AFTER the fast response for the list you're actually looking at
  // now, overwriting its (correct) members with the old list's. Each
  // call claims the next id; a response only applies if it's still the
  // most recent one requested by the time it comes back.
  const membersRequestIdRef = useRef(0);

  const loadListMembers = () => {
    const requestId = ++membersRequestIdRef.current;

    if (!effectiveActiveListId) {
      setOwner(null);
      setMembers([]);
      return;
    }

    api
      .getListMembers(effectiveActiveListId)
      .then(({ owner: loadedOwner, members: loadedMembers }) => {
        if (requestId !== membersRequestIdRef.current) return;
        setOwner(loadedOwner ? { id: String(loadedOwner.id), name: loadedOwner.name, email: loadedOwner.email } : null);
        setMembers(loadedMembers.map((m) => ({ id: String(m.id), name: m.name, email: m.email })));
      })
      .catch((error) => {
        if (requestId !== membersRequestIdRef.current) return;
        console.error("[GROCERY] failed to load list members:", error);
      });
  };

  useEffect(loadListMembers, [effectiveActiveListId]);

  const handleAddMember = async (email: string) => {
    if (!effectiveActiveListId) return;
    try {
      await api.addListMember(effectiveActiveListId, email);
      loadListMembers();
    } catch (error: any) {
      // Re-thrown -- SpaceMembersModal shows this inline next to the
      // input rather than as a floating notice, since it's almost
      // always "no account under that email" and the field is right
      // there to fix.
      throw error;
    }
  };

  // removeItems is SpaceMembersModal's own confirmation choice -- keep
  // their products untagged (default) or delete them along with the
  // person (see ItemController::removeMember). Either way, the server
  // reply's affected_item_ids says exactly which products changed, so
  // local state updates to match instead of needing a full reload.
  const handleRemoveMember = async (userId: string, removeItems: boolean) => {
    if (!effectiveActiveListId) return;
    const previousMembers = members;
    setMembers((current) => current.filter((m) => m.id !== userId));
    try {
      const { affected_item_ids, items_deleted } = await api.removeListMember(effectiveActiveListId, userId, removeItems);
      const affectedIds = new Set(affected_item_ids.map(String));

      setItems((current) =>
        items_deleted
          ? current.filter((item) => !affectedIds.has(item.id))
          : current.map((item) => (affectedIds.has(item.id) ? { ...item, addedBy: undefined } : item)),
      );
    } catch (error: any) {
      setMembers(previousMembers);
      notifyAction("Nu am putut elimina membrul", error?.message || "A apărut o eroare.");
    }
  };


  const handleAdd = async (
    listId: string,
    draft: { name: string; quantity?: string; category: GroceryCategory; price?: number; linkedSupplyId?: string },
  ) => {
    const newItem: GroceryItem = {
      id: makeItemId(),
      listId,
      name: draft.name,
      category: draft.category,
      quantity: draft.quantity,
      price: draft.price,
      inCart: false,
      addedDate: new Date().toISOString().slice(0, 10),
      linkedSupplyId: draft.linkedSupplyId,
    };

    setItems((current) => [newItem, ...current]);

    try {
      const saved = await api.createItem(groceryItemToItemBody(space.id, newItem));
      const savedItem: GroceryItem = { ...newItem, id: String(saved.id) };
      setItems((current) => current.map((item) => (item.id === newItem.id ? savedItem : item)));
    } catch (error: any) {
      setItems((current) => current.filter((item) => item.id !== newItem.id));
      notifyAction("Nu am putut salva produsul", error?.message || "A apărut o eroare.");
    }
  };

  const handleEdit = async (id: string, draft: { name: string; quantity?: string; category: GroceryCategory; price?: number }) => {
    if (!isSavedItemId(id)) return;

    const previous = items.find((item) => item.id === id);
    if (!previous) return;

    const updated: GroceryItem = { ...previous, name: draft.name, quantity: draft.quantity, category: draft.category, price: draft.price };
    setItems((current) => current.map((item) => (item.id === id ? updated : item)));

    // No Home-supply sync here anymore -- an edit is still just intent,
    // not a purchase. Syncing (as a real restock event) happens once,
    // on "Finalizează cumpărăturile" -- see handleFinishShopping.

    try {
      await api.updateItem(id, groceryItemToItemBody(space.id, updated));
    } catch (error: any) {
      setItems((current) => current.map((item) => (item.id === id ? previous : item)));
      notifyAction("Nu am putut salva produsul", error?.message || "A apărut o eroare.");
    }
  };

  // Grocery's `quantity` is a free-form "1 kg" display string; this
  // pulls just the leading number back out for the linked Home supply's
  // numeric quantity/restockHistory fields.
  const parseLeadingNumber = (quantity?: string): number | null => {
    if (!quantity) return null;
    const match = quantity.match(/[\d.,]+/);
    if (!match) return null;
    const value = Number(match[0].replace(",", "."));
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  const handleDelete = async (id: string) => {
    const removed = items.find((item) => item.id === id);
    setItems((current) => current.filter((item) => item.id !== id));

    if (!removed || !isSavedItemId(id)) return;

    try {
      await api.deleteItem(id);
    } catch (error: any) {
      setItems((current) => [removed, ...current]);
      notifyAction("Nu am putut șterge produsul", error?.message || "A apărut o eroare.");
    }
  };

  // Every Home supply that's probably running low (getSupplyRestockEstimate,
  // needs 2+ logged restocks) and isn't already sitting on this list
  // under the same name -- what the suggestion popup offers for listId.
  const computeSupplySuggestions = (listId: string): SupplySuggestion[] => {
    const namesOnList = new Set(
      items.filter((item) => item.listId === listId).map((item) => item.name.trim().toLowerCase()),
    );

    const suggestions: SupplySuggestion[] = [];
    homeSupplies.forEach((supply) => {
      if (namesOnList.has(supply.name.trim().toLowerCase())) return;
      const estimate = getSupplyRestockEstimate(supply);
      if (!estimate?.isLow) return;
      suggestions.push({
        id: supply.id,
        name: supply.name,
        unit: supply.unit,
        defaultQuantity: supply.quantity,
        overdueByDays: Math.round(estimate.daysSinceLastRestock - estimate.predictedDaysUntilEmpty),
      });
    });

    return suggestions;
  };

  // Auto-closes the suggestion popup once every suggestion on it has
  // been added to the list (or otherwise stopped qualifying) -- adding
  // one via handleAddSuggestion puts it on the list, so it drops out of
  // computeSupplySuggestions on the next render; once none are left,
  // there's nothing left to show.
  useEffect(() => {
    if (suggestionListId && computeSupplySuggestions(suggestionListId).length === 0) {
      setSuggestionListId(null);
    }
  }, [items, homeSupplies, suggestionListId]);

  const handleToggle = async (id: string) => {
    const previous = items.find((item) => item.id === id);
    if (!previous) return;

    // Popup fires once THIS list crosses 80% checked into cart, not on
    // the first item -- too early in the trip, the user doesn't know
    // yet what they're missing. Near the end is when a reminder about
    // low supplies is actually useful, so it can still be added before
    // checkout. Only checking an item IN can cross the threshold
    // upward, and it's gated to once per list per session either way.
    if (!previous.inCart && !suggestedListIdsRef.current.has(previous.listId)) {
      const listItems = items.filter((item) => item.listId === previous.listId);
      const checkedAfterThis = listItems.filter((item) => item.inCart).length + 1;
      const percentChecked = checkedAfterThis / listItems.length;

      if (percentChecked >= 0.8) {
        suggestedListIdsRef.current.add(previous.listId);
        if (computeSupplySuggestions(previous.listId).length > 0) {
          setSuggestionListId(previous.listId);
        }
      }
    }

    const updated: GroceryItem = { ...previous, inCart: !previous.inCart };
    setItems((current) => current.map((item) => (item.id === id ? updated : item)));

    if (!isSavedItemId(id)) return;

    try {
      await api.updateItem(id, groceryItemToItemBody(space.id, updated));
    } catch (error: any) {
      setItems((current) => current.map((item) => (item.id === id ? previous : item)));
      notifyAction("Nu am putut actualiza produsul", error?.message || "A apărut o eroare.");
    }
  };

  const handleAddSuggestion = (supplyId: string, name: string, quantity: number) => {
    if (!suggestionListId) return;
    const supply = homeSupplies.find((s) => s.id === supplyId);
    handleAdd(suggestionListId, {
      name,
      category: "Household",
      quantity: [String(quantity), supply?.unit].filter(Boolean).join(" "),
      linkedSupplyId: supplyId,
    });
  };

  // Unchecks every bought item on one list in one go -- "Clear cart" on
  // GroceryShoppingListPage, so finishing a shopping trip doesn't mean
  // unchecking each product one at a time. Bulk, best-effort: a failure
  // on one item just gets its own notice rather than rolling everything
  // back.
  const handleClearCart = (listId: string) => {
    const boughtItems = getItemsForList(items, listId).filter((item) => item.inCart);
    if (boughtItems.length === 0) return;

    setItems((current) =>
      current.map((item) => (item.listId === listId && item.inCart ? { ...item, inCart: false } : item)),
    );

    boughtItems
      .filter((item) => isSavedItemId(item.id))
      .forEach((item) => {
        const updated: GroceryItem = { ...item, inCart: false };
        api.updateItem(item.id, groceryItemToItemBody(space.id, updated)).catch((error: any) => {
          notifyAction(
            `"${item.name}" nu s-a putut actualiza`,
            error?.message || "A rămas bifat -- încearcă din nou.",
          );
        });
      });
  };

  // Fire-and-forget cross-space write: logs a REAL restock event (date +
  // quantity, appended to restockHistory) on a Home supply -- reuses the
  // same mapping Home's own "Restocked" button saves with
  // (supplyEntryToItemBody), so nothing else on the supply (notes, unit,
  // earlier history) gets clobbered. Space is omitted on purpose --
  // Grocery doesn't know or need the supply's own space id, and
  // ItemController::update leaves it untouched either way.
  const logSupplyRestock = async (supplyId: string, quantity: number) => {
    const supply = homeSupplies.find((s) => s.id === supplyId);
    if (!supply) return;

    const now = new Date().toISOString();
    const updatedSupply: HomeSupplyEntry = {
      ...supply,
      quantity,
      lastRestockedDate: now,
      restockHistory: [...(supply.restockHistory ?? []), { date: now, quantity }],
    };
    setHomeSupplies((current) => current.map((s) => (s.id === supplyId ? updatedSupply : s)));

    try {
      await api.updateItem(supplyId, supplyEntryToItemBody(undefined, updatedSupply));
    } catch (error: any) {
      console.error("[GROCERY] failed to log supply restock:", error);
    }
  };

  // "Finalizează cumpărăturile" on the active list -- the actual moment
  // of purchase, unlike an in-progress edit: every checked item linked
  // to a Home supply (see handleAddSuggestion) logs a real restock there,
  // an optional total price becomes a grocery_trip expense for the
  // monthly budget, and the cart clears the same way handleClearCart
  // already does.
  const handleFinishShopping = async (listId: string, price: number | undefined) => {
    const boughtItems = getItemsForList(items, listId).filter((item) => item.inCart);

    // Awaited (not fire-and-forget) so the restock writes are actually
    // committed before REFRESH_EVENT below tells every other open screen
    // (Home included, if it's sitting in the background) to reload --
    // otherwise a screen refetching immediately could still read the
    // pre-restock data and look like nothing changed.
    await Promise.all(
      boughtItems
        .filter((item) => item.linkedSupplyId)
        .map((item) => {
          const quantity = parseLeadingNumber(item.quantity);
          return quantity != null ? logSupplyRestock(item.linkedSupplyId as string, quantity) : Promise.resolve();
        }),
    );

    if (price != null) {
      const list = lists.find((l) => l.id === listId);
      try {
        await api.createItem(
          groceryTripToItemBody(space.id, { listId, listName: list?.name ?? "Cumpărături", price }),
        );
      } catch (error: any) {
        notifyAction("Nu am putut salva cheltuiala", error?.message || "A apărut o eroare.");
      }
    }

    // Same app-wide "something changed, reload your own data" event the
    // global Quick Add FAB fires on every save (see app/(tabs)/_layout.tsx's
    // onSaved) -- Home's own supply page only refetches on focus, so a
    // still-mounted Home screen in the background wouldn't otherwise see
    // this restock (written from Grocery, cross-space) until refocused.
    DeviceEventEmitter.emit(REFRESH_EVENT);

    handleClearCart(listId);
    setFinishShoppingListId(null);
  };

  const handleAddSmartListDraft = async (
    draft: { name: string; category: GroceryCategory }[],
    listId: string,
    recipeIds?: string[],
  ) => {
    const newItems: GroceryItem[] = draft.map((d) => ({
      id: makeItemId(),
      listId,
      name: d.name,
      category: d.category,
      inCart: false,
      addedDate: new Date().toISOString().slice(0, 10),
    }));

    setItems((current) => [...newItems, ...current]);

    try {
      const saved = await Promise.all(
        newItems.map((item) => api.createItem(groceryItemToItemBody(space.id, item))),
      );
      setItems((current) =>
        current.map((item) => {
          const index = newItems.findIndex((n) => n.id === item.id);
          return index >= 0 ? { ...item, id: String(saved[index].id) } : item;
        }),
      );
    } catch (error: any) {
      setItems((current) => current.filter((item) => !newItems.some((n) => n.id === item.id)));
      notifyAction("Nu am putut salva lista generată", error?.message || "A apărut o eroare.");
      return;
    }

    if (recipeIds && recipeIds.length > 0) {
      await mergeRecipeIdsIntoList(listId, recipeIds);
    }
  };

  // Records which recipes contributed to a list -- accumulated
  // (union, not replaced) so generating from more recipes later just
  // grows this instead of forgetting earlier ones. Read back by
  // GroceryShoppingListPage as "Made with recipes", right under that
  // list's own items. Best-effort: a failure here doesn't touch the
  // items that were already added, just leaves the list's recipe
  // attribution stale (silently, since re-throwing would incorrectly
  // read as "the items didn't save either").
  const mergeRecipeIdsIntoList = async (listId: string, recipeIds: string[]) => {
    const previous = lists.find((list) => list.id === listId);
    if (!previous) return;

    const merged = Array.from(new Set([...(previous.recipeIds ?? []), ...recipeIds]));
    const updated: GroceryList = { ...previous, recipeIds: merged };
    setLists((current) => current.map((list) => (list.id === listId ? updated : list)));

    if (!isSavedItemId(listId)) return;

    try {
      await api.updateItem(listId, groceryListToItemBody(space.id, updated));
    } catch (error: any) {
      setLists((current) => current.map((list) => (list.id === listId ? previous : list)));
      notifyAction(
        "Rețetele nu au putut fi asociate listei",
        error?.message || "Produsele au fost adăugate, dar lista nu va arăta din ce rețete provin.",
      );
    }
  };

  // Reuses a same-named list (case-insensitive) instead of creating a
  // near-duplicate.
  //
  // AWAITS the real server id before resolving -- this used to return
  // the optimistic client-side id synchronously (like every other
  // create in this file does), but a caller holding onto *that* id
  // (Smart List's own "ADD TO" target, in particular) had no way to
  // learn the real id once the create-list request resolved in the
  // background: only this file's own `lists`/`activeListId` state got
  // reconciled, so items added against the stale id ended up
  // permanently orphaned -- saved to the DB with a listId that never
  // matched their list's real id once reloaded. Shows up in the shown
  // list as "items just went missing". Awaiting first means every
  // caller only ever sees the real id, at the cost of a brief wait
  // (typically well under a second) before "New list" is usable.
  const createOrReuseList = async (name: string): Promise<GroceryList> => {
    const existing = findGroceryListByName(lists, name);
    if (existing) return existing;

    if (lists.length >= MAX_GROCERY_LISTS) {
      const message = `Poți avea cel mult ${MAX_GROCERY_LISTS} liste. Șterge una ca să creezi alta.`;
      notifyAction("Ai atins limita de liste", message);
      throw new Error(message);
    }

    const optimisticList: GroceryList = {
      id: makeListId(),
      name: name.trim(),
      createdDate: new Date().toISOString().slice(0, 10),
      // Always this space -- creating a list is owner-only (see
      // GroceryDashboard's canCreateList / ItemController::store), so
      // it can only ever be the space the viewer already owns.
      spaceId: String(space.id),
    };

    setLists((prev) => [...prev, optimisticList]);

    try {
      const saved = await api.createItem(groceryListToItemBody(space.id, optimisticList));
      const savedList: GroceryList = { ...optimisticList, id: String(saved.id) };
      setLists((prev) => prev.map((list) => (list.id === optimisticList.id ? savedList : list)));
      return savedList;
    } catch (error: any) {
      setLists((prev) => prev.filter((list) => list.id !== optimisticList.id));
      notifyAction("Nu am putut crea lista", error?.message || "A apărut o eroare.");
      throw error;
    }
  };

  // Home's quick-add bar (see GroceryQuickAddBar) always adds to
  // whichever tab is active -- only rendered once effectiveActiveListId
  // resolves to a real list (see the empty-lists state below), so there
  // is always a target by the time this fires.
  const handleHomeQuickAdd = (draft: { name: string; category: GroceryCategory }) => {
    if (effectiveActiveListId) handleAdd(effectiveActiveListId, draft);
  };

  // Home's tab row "+" -- creates (or reuses a same-named) list and
  // switches straight to its tab, since adding items is the obvious
  // next step right after naming one.
  const handleCreateListInline = async () => {
    const trimmed = newListName.trim();
    if (!trimmed) {
      setCreatingList(false);
      return;
    }

    try {
      const list = await createOrReuseList(trimmed);
      setActiveListId(list.id);
    } catch {
      // createOrReuseList already notified.
    }

    setNewListName("");
    setCreatingList(false);
  };

  // A list's items reference it only through metadata.listId, not a
  // real DB foreign key (see groceryItems.ts), so deleting the list's
  // own row doesn't cascade -- each saved item underneath it has to be
  // deleted individually too.
  const handleDeleteList = async (listId: string) => {
    const removedItems = getItemsForList(items, listId);

    setLists((prev) => prev.filter((list) => list.id !== listId));
    setItems((prev) => prev.filter((item) => item.listId !== listId));

    // No explicit reset needed beyond this -- effectiveActiveListId
    // above falls back to whatever list is left the moment this one
    // drops out of `lists`.
    if (activeListId === listId) setActiveListId(null);

    try {
      const deletions: Promise<any>[] = [];
      if (isSavedItemId(listId)) deletions.push(api.deleteItem(listId));
      removedItems.filter((item) => isSavedItemId(item.id)).forEach((item) => deletions.push(api.deleteItem(item.id)));
      await Promise.all(deletions);
    } catch (error: any) {
      notifyAction(
        "Ștergerea nu s-a finalizat complet",
        error?.message || "Unele produse din listă ar putea fi rămas salvate -- reintră în spațiu pentru a verifica.",
      );
    }
  };

  // Whether the current user may delete THIS list -- the space owner,
  // or whoever created it (see ItemController::canManageList on the
  // backend). Shared with GroceryRecipesPage's own ADD TO pills (see
  // the onDeleteList/canManageList props below) so the same rule
  // applies wherever a list can be deleted from, not just Home's grid.
  const canManageList = (list: GroceryList): boolean =>
    list.createdBy?.id === String(user?.id) || (isOwner && list.spaceId === String(space?.id));

  // The active tab's own "x" -- confirms first, same as every other
  // delete in this space (GroceryItemRow's trash, GroceryProductModal's
  // Delete Product...).
  const confirmDeleteList = async (list: GroceryList) => {
    const confirmed = await confirmAction(
      `Ștergi lista ${list.name}?`,
      "Tot ce e pe ea se șterge și nu se poate anula.",
      { confirmLabel: "Șterge", destructive: true },
    );

    if (confirmed) handleDeleteList(list.id);
  };

  // Creating a list is strictly owner-only (see
  // ItemController::canCreateInSpace) -- a space is someone's "house";
  // being a guest on one list inside it never means you can add a
  // sibling list to THEIR space. Wanting a list of your own means
  // creating it in a space you actually own -- cross-account visibility
  // only ever happens through an explicit invite on one specific list
  // (see effectiveActiveListId/index() filtering), never by merely
  // sharing a space with someone.
  const canCreateList = isOwner && lists.length < MAX_GROCERY_LISTS;

  if (view === "recipes") {
    return (
      <GroceryRecipesPage
        allItems={items}
        lists={lists}
        onBack={() => {
          setCreatingList(false);
          setView("home");
        }}
        onCreateList={async (name) => (await createOrReuseList(name)).id}
        onAddToList={handleAddSmartListDraft}
        creatingList={creatingList}
        onCreatingListClose={() => setCreatingList(false)}
        onCreatingListOpen={() => setCreatingList(true)}
        onDeleteList={confirmDeleteList}
        canManageList={canManageList}
      />
    );
  }

  // Home shows the active tab's list only (see effectiveActiveListId
  // above) -- switching tabs, not navigating anywhere, is how another
  // list's items show up here. The stat cards and the single ITEMS
  // section below are both scoped to just this one list.
  const activeList = lists.find((list) => list.id === effectiveActiveListId);
  const activeListItems = effectiveActiveListId ? getItemsForList(items, effectiveActiveListId) : [];

  const toBuyTotal = activeListItems.filter((item) => !item.inCart).length;
  const inCartTotal = activeListItems.filter((item) => item.inCart).length;

  // Everyone else on this list -- deliberately excludes the viewer's
  // own avatar (seeing your own face reflected back is just clutter,
  // not information). A solo list -- just you, nobody else on it --
  // means this is empty, which is what collapses the header's stack
  // down to a plain "+" with no faces (see below).
  const allPeople: SpaceMember[] = owner ? [owner, ...members] : members;
  const otherPeople = allPeople.filter((person) => person.id !== String(user?.id));
  const otherPeopleCount = otherPeople.length;

  const handleHomeEditSave = (draft: { name: string; quantity?: string; category: GroceryCategory; price?: number }) => {
    if (!homeEditingItem) return;
    handleEdit(homeEditingItem.id, draft);
    setHomeEditingItem(null);
  };

  const groceryFill = SPACE_IDENTITY_COLORS.grocery!;
  const muted = colors.onSurfaceTertiary;
  const activeTotal = toBuyTotal + inCartTotal;
  const activePriced = activeListItems.filter((item) => item.price != null);
  const activePriceTotal = activePriced.length > 0 ? activePriced.reduce((sum, item) => sum + (item.price ?? 0), 0) : null;

  return (
    <SwipeBackView onBack={() => router.push("/spaces")} style={{ backgroundColor: colors.surface }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
      >
        {/* TOP BAR -- back; recipes, who's on this list, edit space. */}
        <TopBar onBack={() => router.push("/spaces")}>
          <CircleButton testID="grocery-recipes-button" icon="restaurant-outline" label="Rețete" onPress={() => setView("recipes")} />
          <CircleButton testID="space-edit" icon="create-outline" label="Editează spațiul" onPress={onEdit} />
        </TopBar>

        {/* IDENTITY + SHARING -- who can see the active list. The avatar
            stack (or "Invită pe cineva") opens SpaceMembersModal. */}
        <View style={{ gap: spacing.md }}>
          <Identity color={groceryFill} kicker="Cumpărături" title={space?.name || "Cumpărături"} />

          <PressableScale
            testID="grocery-members-stack"
            onPress={() => setMembersModalVisible(true)}
            disabled={!effectiveActiveListId}
            accessibilityRole="button"
            accessibilityLabel="Cine are acces la această listă"
            style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minHeight: 44, gap: spacing.sm, opacity: effectiveActiveListId ? 1 : 0.4 }}
          >
            {otherPeople.length > 0 ? (
              <View style={{ flexDirection: "row" }}>
                {otherPeople.slice(0, 3).map((person, index) => (
                  <View key={person.id} style={{ marginLeft: index === 0 ? 0 : -10, zIndex: 10 - index }}>
                    <Avatar id={person.id} name={person.name} size={30} ringed />
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person-add-outline" size={15} color={muted} />
              </View>
            )}
            <Text style={{ fontSize: 14, color: muted }}>
              {otherPeopleCount === 0
                ? "Doar tu. Invită pe cineva"
                : `Împărțită cu ${roCount(otherPeopleCount, "persoană", "persoane")}`}
            </Text>
          </PressableScale>
        </View>

        {/* LIST PILLS -- tapping one switches which list shows below,
            never navigates. "Listă nouă" leads (owner-only) so a long row
            of lists never scrolls it out of sight; the active list's own
            "x" deletes it (owner/creator only). */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {lists.map((list) => (
            <ListPill
              key={list.id}
              list={list}
              active={list.id === effectiveActiveListId}
              onPress={() => setActiveListId(list.id)}
              onDelete={() => confirmDeleteList(list)}
              canManage={canManageList(list)}
              isShared={list.spaceId !== String(space?.id)}
            />
          ))}
          {canCreateList ? (
            <PressableScale
              testID="grocery-list-card-new"
              onPress={() => setCreatingList(true)}
              hitSlop={{ top: 2, bottom: 2 }}
              accessibilityRole="button"
              accessibilityLabel="Listă nouă"
              style={{
                height: 40,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: colors.borderStrong,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Ionicons name="add" size={16} color={muted} />
              <Text style={{ fontSize: 14, color: muted }}>Listă nouă</Text>
            </PressableScale>
          ) : null}
        </ScrollView>

        {lists.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: spacing["3xl"], gap: spacing.sm }}>
            <Ionicons name="albums-outline" size={28} color={muted} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface, textAlign: "center" }}>
              {isOwner ? "Nicio listă încă" : "Nimic împărțit cu tine încă"}
            </Text>
            <Text style={{ fontSize: 14, color: muted, textAlign: "center" }}>
              {isOwner
                ? "Creează una pentru săptămâna asta, o ieșire sau orice cumperi des."
                : "Roagă-l pe proprietarul spațiului să te adauge pe o listă."}
            </Text>
          </View>
        ) : (
          <>
            {/* THE LIST -- progress header, bar, then the items on the
                same card. Checking an item keeps it in place (crossed
                off, like paper) rather than moving it to another section. */}
            <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden" }}>
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>
                      {activeTotal === 0 ? "Lista e goală" : `${inCartTotal} din ${activeTotal} în coș`}
                    </Text>
                    {activePriceTotal != null ? (
                      <Text style={{ fontSize: 13, color: muted }}>Estimat {new Intl.NumberFormat("ro-RO").format(activePriceTotal)} lei</Text>
                    ) : null}
                  </View>
                  {inCartTotal > 0 && effectiveActiveListId ? (
                    <PressableScale
                      testID="grocery-clear-cart"
                      onPress={() => handleClearCart(effectiveActiveListId)}
                      accessibilityRole="button"
                      accessibilityLabel="Debifează tot"
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingLeft: spacing.md }}
                    >
                      <Ionicons name="arrow-undo-outline" size={15} color={muted} />
                      <Text style={{ fontSize: 13, color: muted }}>Debifează tot</Text>
                    </PressableScale>
                  ) : null}
                </View>
                {activeTotal > 0 ? <CartProgress ratio={inCartTotal / activeTotal} color={groceryFill} track={colors.surfaceTertiary} /> : null}
              </View>

              {activeListItems.length === 0 ? (
                <View style={{ alignItems: "center", paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, gap: 4 }}>
                  <Ionicons name="cart-outline" size={26} color={groceryFill} />
                  <Text style={{ fontSize: 14, color: muted, textAlign: "center" }}>Adaugă primul produs mai jos.</Text>
                </View>
              ) : (
                activeListItems.map((item) => (
                  <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                    <GroceryItemRow
                      item={item}
                      onToggle={handleToggle}
                      onOpenMenu={setHomeEditingItem}
                      onDelete={handleDelete}
                      trailing={item.addedBy ? <Avatar id={item.addedBy.id} name={item.addedBy.name} size={20} /> : null}
                    />
                  </View>
                ))
              )}
            </View>

            <GroceryQuickAddBar onAdd={handleHomeQuickAdd} />

            {activeListItems.length > 0 ? (
              <Text style={{ fontSize: 13, color: muted, textAlign: "center" }}>
                Ține apăsat un produs ca să-l editezi, glisează spre stânga ca să-l ștergi.
              </Text>
            ) : null}

            {/* Only once something's actually in the cart -- finishing an
                empty cart has nothing to log. */}
            {inCartTotal > 0 && effectiveActiveListId ? (
              <Button
                label="Termină cumpărăturile"
                icon="checkmark-done"
                tone={groceryFill}
                onPress={() => setFinishShoppingListId(effectiveActiveListId)}
              />
            ) : null}
          </>
        )}
      </ScrollView>

      <GroceryProductModal
        visible={!!homeEditingItem}
        item={homeEditingItem}
        onClose={() => setHomeEditingItem(null)}
        onSave={handleHomeEditSave}
        onDelete={() => {
          if (homeEditingItem) handleDelete(homeEditingItem.id);
          setHomeEditingItem(null);
        }}
      />

      <SpaceMembersModal
        visible={membersModalVisible}
        onClose={() => setMembersModalVisible(false)}
        isOwner={isOwner}
        owner={owner}
        members={members}
        onAdd={handleAddMember}
        onRemove={handleRemoveMember}
      />

      <GroceryNewListModal
        visible={creatingList}
        name={newListName}
        onChangeName={setNewListName}
        onClose={() => {
          setNewListName("");
          setCreatingList(false);
        }}
        onCreate={handleCreateListInline}
      />

      <GrocerySuggestionModal
        visible={!!suggestionListId}
        suggestions={suggestionListId ? computeSupplySuggestions(suggestionListId) : []}
        onAdd={handleAddSuggestion}
        onClose={() => setSuggestionListId(null)}
      />

      {finishShoppingListId ? (
        <GroceryFinishShoppingSheet
          listName={lists.find((l) => l.id === finishShoppingListId)?.name ?? "Cumpărături"}
          linkedSupplyCount={
            getItemsForList(items, finishShoppingListId).filter((item) => item.inCart && item.linkedSupplyId).length
          }
          onCancel={() => setFinishShoppingListId(null)}
          onConfirm={(price) => handleFinishShopping(finishShoppingListId, price)}
        />
      ) : null}
    </SwipeBackView>
  );
}

/** One pill in the list row -- the active one is filled in Grocery's
 * color and grows a small "x" (delete) when the viewer may manage it. */
function ListPill({
  list,
  active,
  onPress,
  onDelete,
  canManage,
  isShared,
}: {
  list: GroceryList;
  active: boolean;
  onPress: () => void;
  onDelete: () => void;
  /** The space owner or the list's creator (ItemController::canManageList). */
  canManage: boolean;
  /** Lives in someone else's space, reached through a list_members share. */
  isShared: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  const fg = active ? SPACE_ON_FILL.grocery! : colors.onSurface;

  return (
    // Pill body and its "x" are siblings, not nested -- a button inside
    // a button is invalid on web and ambiguous for screen readers.
    <View
      style={{
        height: 40,
        borderRadius: radius.pill,
        backgroundColor: active ? SPACE_IDENTITY_COLORS.grocery : colors.surfaceSecondary,
        flexDirection: "row",
        alignItems: "center",
        paddingRight: active && canManage ? spacing.sm : 0,
      }}
    >
      <PressableScale
        testID={`grocery-list-card-${list.id}`}
        onPress={onPress}
        hitSlop={{ top: 2, bottom: 2 }}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={list.name}
        style={{
          height: 40,
          paddingLeft: spacing.lg,
          paddingRight: active && canManage ? spacing.xs : spacing.lg,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        {isShared ? <Ionicons name="people" size={14} color={active ? fg : colors.onSurfaceTertiary} /> : null}
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: active ? "600" : "400", color: fg, maxWidth: 160 }}>
          {list.name}
        </Text>
      </PressableScale>
      {active && canManage ? (
        <Pressable
          testID={`grocery-list-card-delete-${list.id}`}
          onPress={onDelete}
          hitSlop={{ top: 10, bottom: 10, right: 10, left: 4 }}
          accessibilityRole="button"
          accessibilityLabel={`Șterge lista ${list.name}`}
          style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(26,18,6,0.12)" }}
        >
          <Ionicons name="close" size={14} color={fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The active list's "in cart" bar -- glides to its new length whenever
 * an item is ticked (skipped under reduced motion). */
function CartProgress({ ratio, color, track }: { ratio: number; color: string; track: string }) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(ratio)).current;

  useEffect(() => {
    if (reduced) {
      anim.setValue(ratio);
      return;
    }
    const a = Animated.timing(anim, { toValue: ratio, duration: 420, easing: motion.reveal.easing, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [ratio, reduced, anim]);

  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: track, overflow: "hidden" }}>
      <Animated.View
        style={{
          height: "100%",
          borderRadius: 3,
          backgroundColor: color,
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      />
    </View>
  );
}
