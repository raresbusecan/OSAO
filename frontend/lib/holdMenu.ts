import type React from "react";
import type { Animated } from "react-native";
import type { Ionicons } from "@expo/vector-icons";
import type { Rect } from "./holdGeometry";

/**
 * The one hold menu / drag ghost of the app, drawn by HoldMenuHost at the
 * root (like the confirm dialogs). A screen never opens it itself: a
 * <HoldItem> inside a <HoldGroup> (components/ui/Hold.tsx) does, with the
 * actions the screen gave it.
 *
 * Not a <Modal>: an action usually opens a Sheet (a Modal) right away,
 * and iOS drops one of two Modals presented / dismissed at the same time
 * (the stuck-Acasă bug of 2026-11-02). A plain view over the app has
 * nothing to dismiss.
 */

export type HoldAction = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  destructive?: boolean;
};

export type HoldMenuRequest = {
  /** The held item, in window coordinates. */
  anchor: Rect;
  /** A copy of the item, drawn lifted above the dimmed page. */
  preview: React.ReactNode;
  actions: HoldAction[];
  /** A grey line at the bottom of the menu (e.g. how to move the item). */
  hint?: string;
  onClose?: () => void;
};

export type HoldGhost = {
  rect: Rect;
  /** The finger's travel since the drag started (the ghost follows it). */
  offset: Animated.ValueXY;
  preview: React.ReactNode;
};

export type HoldState = { menu: HoldMenuRequest | null; ghost: HoldGhost | null };

let state: HoldState = { menu: null, ghost: null };
const listeners = new Set<(s: HoldState) => void>();

function set(next: Partial<HoldState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

export function getHoldState(): HoldState {
  return state;
}

export function subscribeHold(listener: (s: HoldState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openHoldMenu(request: HoldMenuRequest): void {
  state.menu?.onClose?.();
  set({ menu: request });
}

export function closeHoldMenu(): void {
  const menu = state.menu;
  if (!menu) return;
  set({ menu: null });
  menu.onClose?.();
}

export function showHoldGhost(ghost: HoldGhost): void {
  set({ ghost });
}

export function hideHoldGhost(): void {
  if (state.ghost) set({ ghost: null });
}
