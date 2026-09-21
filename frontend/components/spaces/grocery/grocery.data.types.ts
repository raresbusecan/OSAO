import type { GroceryItem, GroceryList } from "@/lib/spaces/grocery/grocery.types";

export type GroceryData = {
  items: GroceryItem[];
  lists: GroceryList[];
};
