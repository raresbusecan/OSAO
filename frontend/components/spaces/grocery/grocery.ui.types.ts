import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { GroceryCategory } from "@/lib/spaces/grocery/grocery.types";

export type GroceryIcon = ComponentProps<typeof Ionicons>["name"];

export const GROCERY_CATEGORY_ICON: Record<GroceryCategory, GroceryIcon> = {
  Produce: "leaf-outline",
  Dairy: "water-outline",
  Bakery: "cafe-outline",
  "Meat & Fish": "fish-outline",
  Pantry: "file-tray-stacked-outline",
  Frozen: "snow-outline",
  Household: "home-outline",
  Other: "ellipsis-horizontal-outline",
};
