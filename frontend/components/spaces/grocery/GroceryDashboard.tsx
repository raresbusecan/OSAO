import React, { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { useTheme } from "@/lib/theme";

import type { GroceryData } from "./grocery.data.types";
import type { GroceryItem } from "@/lib/spaces/grocery/grocery.types";
import { GroceryHeader } from "./GroceryHeader";
import { GroceryStats } from "./GroceryStats";
import { GroceryAddBar } from "./GroceryAddBar";
import { GroceryListSection } from "./GroceryListSection";

export type GroceryDashboardProps = {
  space: any;
  groceryData: GroceryData;
  onEdit?: () => void;
  onItemsChange?: (items: GroceryItem[]) => void;
};

function makeItemId(): string {
  return `gr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export default function GroceryDashboard({
  space,
  groceryData,
  onEdit,
  onItemsChange,
}: GroceryDashboardProps) {
  const { spacing } = useTheme();

  // Owns its own list state -- adding/checking off items is real,
  // immediate interaction, not a form submitted elsewhere. `onItemsChange`
  // is called after every change so a parent (e.g. persistence, later)
  // can observe the up-to-date list without dictating how this screen
  // manages it moment-to-moment.
  const [items, setItems] = useState<GroceryItem[]>(groceryData.items);

  const updateItems = (next: GroceryItem[]) => {
    setItems(next);
    onItemsChange?.(next);
  };

  const handleAdd = (name: string) => {
    const newItem: GroceryItem = {
      id: makeItemId(),
      name,
      category: "Other",
      inCart: false,
      addedDate: new Date().toISOString().slice(0, 10),
    };

    updateItems([newItem, ...items]);
  };

  const handleToggle = (id: string) => {
    updateItems(
      items.map((item) =>
        item.id === id ? { ...item, inCart: !item.inCart } : item,
      ),
    );
  };

  const { toBuy, inCart } = useMemo(() => {
    return {
      toBuy: items.filter((item) => !item.inCart),
      inCart: items.filter((item) => item.inCart),
    };
  }, [items]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        // Clears the floating Quick Add FAB in the bottom-right corner.
        // Grocery has just the one list -- this screen already IS that
        // category, so the FAB stays as Quick Add here (nothing to fan
        // out into).
        paddingBottom: 100,
      }}
    >
      <GroceryHeader space={space} onEdit={onEdit} />

      <GroceryStats toBuyCount={toBuy.length} inCartCount={inCart.length} />

      <GroceryAddBar onAdd={handleAdd} />

      <GroceryListSection
        title="TO BUY"
        items={toBuy}
        emptyLabel="Nothing left to buy."
        onToggle={handleToggle}
      />

      <GroceryListSection
        title="IN CART"
        items={inCart}
        emptyLabel="Nothing in the cart yet."
        onToggle={handleToggle}
      />
    </ScrollView>
  );
}
