import { useSyncExternalStore } from "react";
import { onSessionReset } from "@/lib/sessionCache";

/**
 * Open/close state of the two app-wide Simplu sheets, so any screen (a
 * teaser row, the tab bar's "+") can open them without prop drilling:
 *  - the upgrade sheet ("orgOS Complet") -- host: components/simple/
 *    UpgradeSheet.tsx, mounted in app/_layout.tsx;
 *  - the quick-add sheet ("Adaugă") -- host: components/simple/
 *    QuickAddSheet.tsx, mounted in app/(tabs)/_layout.tsx.
 * After a quick-add save the sheet emits REFRESH_EVENT (app/(tabs)/
 * _layout.tsx) -- the same event every data screen already reloads on.
 */
type QuickAddRequest = { spaceId?: string | null } | null;

/** The Simplu space screen currently shown (set on focus, cleared on
 * blur): the tab bar tints its "+" with the space's fill and quick-add
 * preselects it. `fill`/`ink` = spaceColors(space).fill / .ink. */
export type SpaceAccent = { spaceId: string; fill: string; ink: string; name: string };

type State = {
  upgrade: boolean;
  quickAdd: QuickAddRequest;
  /** The record editor (components/simple/EditRecordSheet.tsx): an item id. */
  editRecord: { id: string } | null;
  spaceAccent: SpaceAccent | null;
};

let state: State = { upgrade: false, quickAdd: null, editRecord: null, spaceAccent: null };
const listeners = new Set<() => void>();
onSessionReset(() => set({ upgrade: false, quickAdd: null, editRecord: null, spaceAccent: null }));

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSimpleSheets(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export const openUpgradeSheet = () => set({ upgrade: true });
export const closeUpgradeSheet = () => set({ upgrade: false });

/** Opens "Adaugă". `spaceId` preselects "Pentru" (from inside a space). */
export const openQuickAdd = (spaceId?: string | null) => set({ quickAdd: { spaceId: spaceId ?? null } });
export const closeQuickAdd = () => set({ quickAdd: null });

/** Opens the Simplu record editor for one saved item. */
export const openEditRecord = (id: string | number) => set({ editRecord: { id: String(id) } });
export const closeEditRecord = () => set({ editRecord: null });

export const setSpaceAccent = (accent: SpaceAccent | null) => {
  if (state.spaceAccent?.spaceId === accent?.spaceId && state.spaceAccent?.fill === accent?.fill && state.spaceAccent?.name === accent?.name) return;
  set({ spaceAccent: accent });
};
/** Clears the accent only if it is still this space's (a focus of another
 * space may already have replaced it). */
export const clearSpaceAccent = (spaceId: string) => {
  if (state.spaceAccent?.spaceId === spaceId) set({ spaceAccent: null });
};
