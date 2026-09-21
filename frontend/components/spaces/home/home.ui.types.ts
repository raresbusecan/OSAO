import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export type HomeIcon = ComponentProps<typeof Ionicons>["name"];

export type HomeNextItem = {
  id: string | number;
  icon: HomeIcon;
  title: string;
  subtitle: string;
  right?: string;
  /** Days until due (negative = already overdue) -- getUpcomingHomeItems
   * already computes this per item to sort/filter its own list; exposed
   * here too so a consumer (the category grid's badges) can tell overdue
   * apart from merely upcoming without re-deriving it from `subtitle`. */
  urgency: number;
};

