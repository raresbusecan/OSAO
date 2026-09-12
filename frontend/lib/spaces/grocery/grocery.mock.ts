import type { GroceryItem } from "./grocery.types";

export const MOCK_GROCERY_ITEMS: GroceryItem[] = [
  { id: "gr-1", name: "Milk", category: "Dairy", quantity: "2 L", inCart: false, addedDate: "2026-09-07" },
  { id: "gr-2", name: "Eggs", category: "Dairy", quantity: "1 dozen", inCart: false, addedDate: "2026-09-07" },
  { id: "gr-3", name: "Bananas", category: "Produce", quantity: "1 kg", inCart: true, addedDate: "2026-09-06" },
  { id: "gr-4", name: "Tomatoes", category: "Produce", quantity: "500 g", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-5", name: "Sourdough Bread", category: "Bakery", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-6", name: "Chicken Breast", category: "Meat & Fish", quantity: "1 kg", inCart: true, addedDate: "2026-09-06" },
  { id: "gr-7", name: "Rice", category: "Pantry", quantity: "1 kg", inCart: false, addedDate: "2026-09-05" },
  { id: "gr-8", name: "Dish Soap", category: "Household", inCart: false, addedDate: "2026-09-08" },
];
