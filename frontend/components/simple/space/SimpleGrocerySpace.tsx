import React, { useCallback, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { roCount } from "@/lib/format";
import { motion } from "@/lib/motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { GroceryItemRow } from "@/components/spaces/grocery/GroceryItemRow";
import { Sheet } from "@/components/ui/Sheet";
import { GroceryQuickAddBar } from "@/components/spaces/grocery/GroceryQuickAddBar";
import { GroceryFinishShoppingSheet } from "@/components/spaces/grocery/GroceryFinishShoppingSheet";
import {
  groceryItemToItemBody,
  groceryListToItemBody,
  groceryTripToItemBody,
  isSavedItemId,
  loadMyGroceryData,
} from "@/lib/spaces/grocery/groceryItems";
import { getItemsForList } from "@/lib/spaces/grocery/grocery.calculations";
import type { GroceryCategory, GroceryItem, GroceryList } from "@/lib/spaces/grocery/grocery.types";
import { itemToSupplyEntry, supplyEntryToItemBody } from "@/lib/spaces/home/homeItems";
import { TeaserCard } from "@/components/simple/Teaser";
import { openEditRecord } from "@/lib/simpleSheets";
import { REFRESH_EVENT } from "@/app/(tabs)/_layout";
import type { SimpleSpaceProps } from "./SimpleSpaceScreen";
import { CalmLine, ListProgressRing, SimpleCard, SimplePage, useSimpleSpaceColors, useSpaceAccent } from "./SimpleSpaceParts";

/** Same as GroceryDashboard's parseLeadingNumber: "2 kg" -> 2. */
function leadingNumber(quantity?: string): number | null {
  if (!quantity) return null;
  const match = quantity.match(/[\d.,]+/);
  if (!match) return null;
  const value = Number(match[0].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Cumpărături in orgOS Simplu: every list of this space (plus lists shared
 * with the user, like the full dashboard), each with its products --
 * still to buy first, in the cart after. Tap = into the cart / back out,
 * swipe left = delete, "Am terminat cumpărăturile" = the full app's finish
 * step (optional price -> grocery_trip spend, linked supplies restocked,
 * cart cleared). Same data and calls as GroceryDashboard. Recipes, smart
 * list, sharing and editing stay in Complet.
 */
export function SimpleGrocerySpace({ space, onBack }: SimpleSpaceProps) {
  const { colors, spacing, radius } = useTheme();
  const c = useSimpleSpaceColors(space, "grocery");
  useSpaceAccent(space, c);

  const [lists, setLists] = useState<GroceryList[]>([]);
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [finishListId, setFinishListId] = useState<string | null>(null);
  // The list a typed product lands on (default: the newest list of this space).
  const [targetId, setTargetId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // List ids seen so far: a list that appears on a reload (created from the
  // "+" sheet's "Listă nouă") becomes the selected one.
  const knownListIds = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    if (!space?.id) return;
    try {
      const data = await loadMyGroceryData(space.id);
      const known = knownListIds.current;
      const fresh = known ? data.lists.filter((l) => !known.has(l.id) && l.spaceId === String(space.id)) : [];
      if (fresh.length > 0) setTargetId(fresh[fresh.length - 1].id);
      knownListIds.current = new Set(data.lists.map((l) => l.id));
      setLists(data.lists);
      setItems(data.items);
    } catch (error) {
      console.error("[SIMPLE GROCERY] failed to load:", error);
    }
  }, [space?.id]);

  useEffect(() => {
    load();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, load);
    return () => sub.remove();
  }, [load]);

  const toBuy = items.filter((i) => !i.inCart && lists.some((l) => l.id === i.listId)).length;
  const subtitle = toBuy > 0 ? `${roCount(toBuy, "produs", "produse")} de cumpărat` : null;


  const target = lists.find((l) => l.id === targetId) ?? [...lists].reverse().find((l) => l.spaceId === String(space.id)) ?? lists[lists.length - 1] ?? null;

  /** Type a name, it's on the list -- creating a first list on the way when
   * there is none yet (nothing else to set up). Same calls as the full
   * dashboard's handleAdd; the field stays open for the next one. */
  const addProduct = async (draft: { name: string; category: GroceryCategory }) => {
    let list = target;
    if (!list) {
      const day = new Date().toISOString().slice(0, 10);
      try {
        const created = await api.createItem(
          groceryListToItemBody(space.id, { id: `list-${Date.now()}`, name: "Cumpărături", createdDate: day, spaceId: String(space.id) }),
        );
        list = { id: String(created.id), name: "Cumpărături", createdDate: day, spaceId: String(space.id) };
        knownListIds.current?.add(list.id);
        setLists((cur) => [...cur, list!]);
      } catch (error: any) {
        notifyAction("Nu am putut crea lista", error?.message || "A apărut o eroare.");
        return;
      }
    }
    const newItem: GroceryItem = {
      id: `gr-${Date.now()}`,
      listId: list.id,
      name: draft.name,
      category: draft.category,
      quantity: undefined,
      price: undefined,
      inCart: false,
      addedDate: new Date().toISOString().slice(0, 10),
      linkedSupplyId: undefined,
    };
    setItems((cur) => [...cur, newItem]);
    try {
      const saved = await api.createItem(groceryItemToItemBody(space.id, newItem));
      setItems((cur) => cur.map((i) => (i.id === newItem.id ? { ...newItem, id: String(saved.id) } : i)));
    } catch (error: any) {
      setItems((cur) => cur.filter((i) => i.id !== newItem.id));
      notifyAction("Nu am putut salva produsul", error?.message || "A apărut o eroare.");
    }
  };

  const toggle = async (id: string) => {
    const previous = items.find((i) => i.id === id);
    if (!previous) return;
    const updated: GroceryItem = { ...previous, inCart: !previous.inCart };
    setItems((cur) => cur.map((i) => (i.id === id ? updated : i)));
    if (!isSavedItemId(id)) return;
    try {
      await api.updateItem(id, groceryItemToItemBody(space.id, updated));
    } catch (error: any) {
      setItems((cur) => cur.map((i) => (i.id === id ? previous : i)));
      notifyAction("Nu am putut actualiza produsul", error?.message || "A apărut o eroare.");
    }
  };

  /** The ring's check mark (everything in the cart): put it all back to
   * "to buy" after a confirm -- no trip, no spend (that's "Am terminat
   * cumpărăturile"). Optimistic; a product that fails to save goes back. */
  const uncheckAll = async (listId: string, listName: string) => {
    const inCart = getItemsForList(items, listId).filter((i) => i.inCart);
    if (inCart.length === 0) return;
    const ok = await confirmAction(
      "Debifezi produsele?",
      `Toate cele ${roCount(inCart.length, "produs", "produse")} din „${listName}” revin la „de cumpărat”. Nu se înregistrează nicio cheltuială.`,
      { confirmLabel: "Debifează", cancelLabel: "Renunță" },
    );
    if (!ok) return;
    const ids = new Set(inCart.map((i) => i.id));
    setItems((cur) => cur.map((i) => (ids.has(i.id) ? { ...i, inCart: false } : i)));
    const failed: string[] = [];
    await Promise.all(
      inCart
        .filter((i) => isSavedItemId(i.id))
        .map((i) => api.updateItem(i.id, groceryItemToItemBody(space.id, { ...i, inCart: false })).catch(() => failed.push(i.id))),
    );
    if (failed.length > 0) {
      const back = new Set(failed);
      setItems((cur) => cur.map((i) => (back.has(i.id) ? { ...i, inCart: true } : i)));
      notifyAction("Nu am putut debifa tot", `${roCount(failed.length, "produs a rămas bifat", "produse au rămas bifate")}. Încearcă din nou.`);
    }
  };

  /** Deletes a whole list WITH its products (Complet's handleDeleteList:
   * the server deletes only the row it's asked for, so products left
   * behind would still count as "de cumpărat" on Acasă). Page-level
   * confirm (no sheet open). Optimistic; restored on failure. */
  const deleteList = async (list: GroceryList) => {
    const onList = getItemsForList(items, list.id);
    const ok = await confirmAction(
      `Ștergi lista „${list.name}”?`,
      onList.length > 0
        ? `Se șterg și cele ${roCount(onList.length, "produs", "produse")} de pe ea. Nu se poate anula.`
        : "Se șterge definitiv și nu se poate anula.",
      { confirmLabel: "Șterge", destructive: true },
    );
    if (!ok) return;
    const prevLists = lists;
    const prevItems = items;
    setLists((cur) => cur.filter((l) => l.id !== list.id));
    setItems((cur) => cur.filter((i) => i.listId !== list.id));
    setTargetId(null); // back to the default (the newest remaining list)
    try {
      // Products first: if the list delete fails, nothing points at a gone list.
      await Promise.all(onList.filter((i) => isSavedItemId(i.id)).map((i) => api.deleteItem(i.id)));
      if (isSavedItemId(list.id)) await api.deleteItem(list.id);
      DeviceEventEmitter.emit(REFRESH_EVENT);
    } catch (error: any) {
      setLists(prevLists);
      setItems(prevItems);
      notifyAction("Nu am putut șterge lista", error?.message || "A apărut o eroare.");
      load();
    }
  };

  const remove = async (id: string) => {
    const previous = items;
    setItems((cur) => cur.filter((i) => i.id !== id));
    if (!isSavedItemId(id)) return;
    try {
      await api.deleteItem(id);
    } catch (error: any) {
      setItems(previous);
      notifyAction("Nu am putut șterge produsul", error?.message || "A apărut o eroare.");
    }
  };

  /** GroceryDashboard.handleFinishShopping, same order: restocks first,
   * then the trip's spend, then the refresh event, then the cart clears. */
  const finish = async (listId: string, price: number | undefined, guiltFree: boolean) => {
    setFinishListId(null);
    const bought = getItemsForList(items, listId).filter((i) => i.inCart);
    const linked = bought.filter((i) => i.linkedSupplyId);
    if (linked.length > 0) {
      try {
        const supplies = (await api.listItems({ type: "home_supply" })).map(itemToSupplyEntry);
        const now = new Date().toISOString();
        await Promise.all(
          linked.map((i) => {
            const supply = supplies.find((s) => s.id === i.linkedSupplyId);
            const quantity = leadingNumber(i.quantity);
            if (!supply || quantity == null) return Promise.resolve();
            const updated = { ...supply, quantity, lastRestockedDate: now, restockHistory: [...(supply.restockHistory ?? []), { date: now, quantity }] };
            return api.updateItem(supply.id, supplyEntryToItemBody(undefined, updated)).catch((e: any) => console.error("[SIMPLE GROCERY] restock failed:", e));
          }),
        );
      } catch (error) {
        console.error("[SIMPLE GROCERY] failed to load supplies:", error);
      }
    }
    if (price != null) {
      const list = lists.find((l) => l.id === listId);
      try {
        await api.createItem(groceryTripToItemBody(space.id, { listId, listName: list?.name ?? "Cumpărături", price, guiltFree }));
      } catch (error: any) {
        notifyAction("Nu am putut salva cheltuiala", error?.message || "A apărut o eroare.");
      }
    }
    // Clear the cart (unchecked, stays on the list -- same as the full app).
    setItems((cur) => cur.map((i) => (i.listId === listId && i.inCart ? { ...i, inCart: false } : i)));
    await Promise.all(
      bought
        .filter((i) => isSavedItemId(i.id))
        .map((i) =>
          api.updateItem(i.id, groceryItemToItemBody(space.id, { ...i, inCart: false })).catch((error: any) => {
            notifyAction(`„${i.name}” nu s-a putut actualiza`, error?.message || "A rămas bifat -- încearcă din nou.");
          }),
        ),
    );
    DeviceEventEmitter.emit(REFRESH_EVENT);
  };

  const finishing = finishListId ? lists.find((l) => l.id === finishListId) : null;

  const targetItems = target ? getItemsForList(items, target.id) : [];
  const targetOpen = targetItems.filter((i) => !i.inCart);
  const targetInCart = targetItems.filter((i) => i.inCart);

  return (
    <SimplePage title={space.name} subtitle={subtitle} onBack={onBack} onRefresh={load} testID="simple-grocery-space">
      {/* The selected list's name IS the selector (several lists: tap to switch). */}
      {target ? (
        <PressableScale
          testID="simple-grocery-list-picker"
          onPress={() => lists.length > 1 && setPickerOpen(true)}
          disabled={lists.length < 2}
          scaleTo={motion.scale.control}
          accessibilityRole={lists.length > 1 ? "button" : "header"}
          accessibilityLabel={lists.length > 1 ? `Lista ${target.name}. Alege altă listă` : `Lista ${target.name}`}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.control, backgroundColor: colors.surfaceSecondary }}
        >
          <Ionicons name="list-outline" size={20} color={c.tint} />
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
            {target.name}
          </Text>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{targetOpen.length > 0 ? `${targetOpen.length} de cumpărat` : "nimic de cumpărat"}</Text>
          {lists.length > 1 ? <Ionicons name="chevron-down" size={18} color={colors.onSurfaceTertiary} /> : null}
        </PressableScale>
      ) : null}

      <GroceryQuickAddBar onAdd={addProduct} closeKeyboardOnAdd />

      {!target ? (
        <SimpleCard title="De cumpărat">
          <CalmLine text="Scrie primul produs mai sus, lista se face singură." />
        </SimpleCard>
      ) : (
        <SimpleCard
          title="Produse"
          badge={targetItems.length > 0 ? <ListProgressRing done={targetInCart.length} total={targetItems.length} color={c.color} onPressComplete={() => uncheckAll(target.id, target.name)} testID={`simple-grocery-progress-${target.id}`} /> : null}
          onEdit={() => openEditRecord(target.id)} editLabel={`Redenumește ${target.name}`} testID={`simple-grocery-list-${target.id}`}>
          {targetItems.length === 0 ? <CalmLine text="Nimic pe listă. Scrie un produs mai sus." /> : null}
          {[...targetOpen, ...targetInCart].map((item) => (
            <GroceryItemRow key={item.id} item={item} onToggle={toggle} onOpenMenu={(i) => openEditRecord(i.id)} onDelete={remove} />
          ))}
          {targetInCart.length > 0 ? (
            <PressableScale
              testID={`simple-grocery-finish-${target.id}`}
              onPress={() => setFinishListId(target.id)}
              scaleTo={motion.scale.control}
              accessibilityRole="button"
              style={{ margin: spacing.md, height: 44, borderRadius: radius.control, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>Am terminat cumpărăturile</Text>
            </PressableScale>
          ) : null}
        </SimpleCard>
      )}

      {/* Own lists only: a list shared with you belongs to someone else's
          space (the server refuses, after its products were already gone). */}
      {target && target.spaceId === String(space.id) ? (
        <PressableScale
          testID={`simple-grocery-delete-list-${target.id}`}
          onPress={() => deleteList(target)}
          scaleTo={motion.scale.control}
          accessibilityRole="button"
          accessibilityLabel={`Șterge lista ${target.name}`}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, alignSelf: "center", minHeight: 44, paddingHorizontal: spacing.lg }}
        >
          <Ionicons name="trash-outline" size={17} color={colors.error} />
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.error }}>Șterge lista</Text>
        </PressableScale>
      ) : null}

      <TeaserCard testID="simple-grocery-teaser" title="Rețete și listă inteligentă" subtitle="Lista se face singură din ce gătești, în Complet." />

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Alege lista" testID="simple-grocery-list-sheet">
        {lists.map((l) => {
          const on = target?.id === l.id;
          const left = getItemsForList(items, l.id).filter((i) => !i.inCart).length;
          return (
            <PressableScale
              key={l.id}
              testID={`simple-grocery-pick-${l.id}`}
              onPress={() => {
                setTargetId(l.id);
                setPickerOpen(false);
              }}
              scaleTo={1}
              pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${l.name}, ${left} de cumpărat`}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.sm, borderRadius: radius.control }}
            >
              <Text style={{ flex: 1, fontSize: 16, fontWeight: on ? "600" : "500", color: colors.onSurface }} numberOfLines={1}>
                {l.name}
              </Text>
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{left} de cumpărat</Text>
              {on ? <Ionicons name="checkmark" size={20} color={c.tint} /> : null}
            </PressableScale>
          );
        })}
      </Sheet>

      {finishing ? (
        <GroceryFinishShoppingSheet
          listName={finishing.name}
          linkedSupplyCount={getItemsForList(items, finishing.id).filter((i) => i.inCart && i.linkedSupplyId).length}
          onCancel={() => setFinishListId(null)}
          onConfirm={(price, guiltFree) => finish(finishing.id, price, guiltFree)}
        />
      ) : null}
    </SimplePage>
  );
}
