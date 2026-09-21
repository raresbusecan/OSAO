import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { BuiltinGroceryCategory, GroceryCategory } from "@/lib/spaces/grocery/grocery.types";

export type GroceryIcon = ComponentProps<typeof Ionicons>["name"];

export const GROCERY_CATEGORY_ICON: Record<BuiltinGroceryCategory, GroceryIcon> = {
  Vegetables: "leaf-outline",
  Fruits: "nutrition-outline",
  Protein: "fish-outline",
  "Grains / Starches": "file-tray-stacked-outline",
  "Healthy Fats": "water-outline",
  Dairy: "cafe-outline",
  Bakery: "pizza-outline",
  Household: "home-outline",
  Other: "ellipsis-horizontal-outline",
};

/** A user-created category has no entry in GROCERY_CATEGORY_ICON --
 * falls back to a generic tag icon instead of throwing/undefined. */
const CUSTOM_CATEGORY_ICON: GroceryIcon = "pricetag-outline";

export function getGroceryCategoryIcon(category: GroceryCategory): GroceryIcon {
  return (GROCERY_CATEGORY_ICON as Record<string, GroceryIcon>)[category] ?? CUSTOM_CATEGORY_ICON;
}
