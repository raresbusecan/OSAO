export type GroceryCategory =
  | "Produce"
  | "Dairy"
  | "Bakery"
  | "Meat & Fish"
  | "Pantry"
  | "Frozen"
  | "Household"
  | "Other";

export type GroceryItem = {
  id: string;
  name: string;
  category: GroceryCategory;
  quantity?: string;
  /** Checked off while actually shopping -- already in the cart. */
  inCart: boolean;
  addedDate: string;
};
