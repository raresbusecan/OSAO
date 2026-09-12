import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export type HomeIcon = ComponentProps<typeof Ionicons>["name"];

export type HomeNextItem = {
  id: string | number;
  icon: HomeIcon;
  title: string;
  subtitle: string;
  right?: string;
};

