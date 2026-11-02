/**
 * The pure math behind the hold menu (components/ui/Hold.tsx): which item
 * is under the finger, the new order while one is dragged, and where the
 * menu goes next to the held item. No React Native here, so it is tested
 * directly (tests/hold-geometry.test.cjs).
 */

export type Rect = { x: number; y: number; width: number; height: number };

/** The key whose rect contains (x, y), or null (a gap between items). */
export function hitTest(rects: Map<string, Rect>, x: number, y: number): string | null {
  for (const [key, r] of rects) {
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return key;
  }
  return null;
}

/** `order` with `key` moved to `toIndex` (the slot the hovered item had). */
export function moveKey(order: string[], key: string, toIndex: number): string[] {
  const from = order.indexOf(key);
  if (from < 0 || toIndex < 0 || toIndex >= order.length || from === toIndex) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(toIndex, 0, key);
  return next;
}

/**
 * Applies a new order of SOME items to the full list: the items in
 * `subsetOrder` take the slots they already held, in their new order;
 * everything else (Acasă's hidden or empty cards) stays exactly where it
 * was. Keys in `subsetOrder` that aren't in `all` are ignored.
 */
export function reorderSubset<T>(all: T[], keyOf: (item: T) => string, subsetOrder: string[]): T[] {
  const byKey = new Map(all.map((item) => [keyOf(item), item] as const));
  const moving = subsetOrder.filter((k) => byKey.has(k));
  const set = new Set(moving);
  let i = 0;
  return all.map((item) => (set.has(keyOf(item)) ? byKey.get(moving[i++])! : item));
}

export const MENU_GAP = 10;
const EDGE = 8;

/**
 * Where the menu sits for a held item at `anchor` (window coordinates):
 * under it when it fits, else above it, else pinned to the bottom of the
 * screen over the item (a card taller than the screen). Left-aligned with
 * the item, kept on screen.
 */
export function menuPlacement(
  anchor: Rect,
  menu: { width: number; height: number },
  screen: { width: number; height: number; top: number; bottom: number },
): { left: number; top: number; side: "below" | "above" | "over" } {
  const left = Math.max(16, Math.min(anchor.x, screen.width - 16 - menu.width));
  const below = anchor.y + anchor.height + MENU_GAP;
  if (below + menu.height <= screen.height - screen.bottom - EDGE) return { left, top: below, side: "below" };
  const above = anchor.y - MENU_GAP - menu.height;
  if (above >= screen.top + EDGE) return { left, top: above, side: "above" };
  return { left, top: screen.height - screen.bottom - EDGE - menu.height, side: "over" };
}
