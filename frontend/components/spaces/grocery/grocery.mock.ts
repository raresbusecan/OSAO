import type { GroceryData } from "./grocery.data.types";
import { MOCK_GROCERY_ITEMS, MOCK_GROCERY_LISTS } from "@/lib/spaces/grocery/grocery.mock";

export const initialGroceryData: GroceryData = {
  items: MOCK_GROCERY_ITEMS,
  lists: MOCK_GROCERY_LISTS,
};
