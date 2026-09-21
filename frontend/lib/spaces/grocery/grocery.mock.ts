import type { GroceryItem, GroceryList } from "./grocery.types";

// spaceId is a placeholder here -- this mock only ever seeds initial
// state for a render or two before GroceryDashboard's load effect
// replaces it with the real, server-sourced lists (each carrying its
// actual space id).
export const MOCK_GROCERY_LISTS: GroceryList[] = [
  { id: "list-1", name: "Week 1", createdDate: "2026-09-05", spaceId: "mock" },
  { id: "list-2", name: "Week 2", createdDate: "2026-09-08", spaceId: "mock" },
];

export const MOCK_GROCERY_ITEMS: GroceryItem[] = [
  { id: "gr-1", listId: "list-1", name: "Onion", category: "Vegetables", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-2", listId: "list-1", name: "Broccoli", category: "Vegetables", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-3", listId: "list-1", name: "Spinach", category: "Vegetables", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-4", listId: "list-1", name: "Carrots", category: "Vegetables", quantity: "1 kg", inCart: true, addedDate: "2026-09-06" },
  { id: "gr-5", listId: "list-1", name: "Bell peppers", category: "Vegetables", inCart: true, addedDate: "2026-09-06" },
  { id: "gr-6", listId: "list-1", name: "Apples", category: "Fruits", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-7", listId: "list-1", name: "Blueberries", category: "Fruits", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-8", listId: "list-1", name: "Oranges", category: "Fruits", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-9", listId: "list-1", name: "Bananas", category: "Fruits", inCart: true, addedDate: "2026-09-06" },
  { id: "gr-10", listId: "list-1", name: "Eggs", category: "Protein", quantity: "10 pcs", inCart: false, addedDate: "2026-09-07" },
  { id: "gr-11", listId: "list-1", name: "Chicken", category: "Protein", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-12", listId: "list-1", name: "Salmon", category: "Protein", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-13", listId: "list-1", name: "Brown rice", category: "Grains / Starches", quantity: "500 g", inCart: false, addedDate: "2026-09-05" },
  { id: "gr-14", listId: "list-1", name: "Potatoes", category: "Grains / Starches", inCart: true, addedDate: "2026-09-06" },
  { id: "gr-15", listId: "list-1", name: "Avocado", category: "Healthy Fats", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-16", listId: "list-2", name: "Milk", category: "Dairy", inCart: false, addedDate: "2026-09-08" },
  { id: "gr-17", listId: "list-2", name: "Bread", category: "Grains / Starches", inCart: false, addedDate: "2026-09-08" },
];
