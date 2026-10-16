import { api } from "@/lib/api";
import { loadMyGroceryData } from "@/lib/spaces/grocery/groceryItems";
import { detectSpaceType, profileFromSpace, type SpaceKind } from "@/lib/spaces/spaceProfile";
import type { GroceryList } from "@/lib/spaces/grocery/grocery.types";

/**
 * What Simplu's "Adaugă" sheet needs to render its first frame complete:
 * the spaces and each grocery space's lists. Prefetched in the background
 * (QuickAddHost: on mount, on REFRESH_EVENT, after each close) so a "+"
 * tap opens the sheet instantly, already full, in one smooth slide -- the
 * sheet still revalidates on open. Module-level, like lib/simpleSheets.
 */
export type QuickSpace = { id: string; name: string; kind: Exclude<SpaceKind, "other">; raw: any };

let spaces: QuickSpace[] | null = null;
const groceryLists = new Map<string, GroceryList[]>();
let inflight: Promise<void> | null = null;

export function toQuickSpaces(raw: any[]): QuickSpace[] {
  const list: QuickSpace[] = [];
  for (const s of raw ?? []) {
    const k = detectSpaceType(s, profileFromSpace(s));
    if (k === "other") continue;
    list.push({ id: String(s.id), name: s.name ?? "", kind: k, raw: s });
  }
  return list;
}

export const cachedQuickSpaces = () => spaces;
export const cachedGroceryLists = (spaceId: string) => groceryLists.get(spaceId) ?? null;
export const rememberQuickSpaces = (list: QuickSpace[]) => {
  spaces = list;
};
export const rememberGroceryLists = (spaceId: string, lists: GroceryList[]) => {
  groceryLists.set(spaceId, lists);
};

/** Refreshes the cache; concurrent calls share one request. Never throws. */
export function prefetchQuickAdd(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await api.listSpaces();
      const list = toQuickSpaces(r?.spaces ?? []);
      await Promise.all(
        list
          .filter((s) => s.kind === "grocery")
          .map((s) =>
            loadMyGroceryData(s.id)
              .then(({ lists }) => rememberGroceryLists(s.id, lists))
              .catch(() => {}),
          ),
      );
      spaces = list;
    } catch {
      // keep whatever was cached; the sheet loads on its own as a fallback
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
