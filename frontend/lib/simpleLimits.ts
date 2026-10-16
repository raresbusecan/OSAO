import { notifyAction } from "@/lib/confirm";
import { SPACE_KIND_LABEL, type SpaceKind } from "@/lib/spaces/spaceProfile";

/**
 * orgOS Simplu's limits (the future free tier). One space per kind
 * (user decision 2026-10-15): one Mașină, one Casă, one Cumpărături, one
 * Cheltuieli. Spaces a user already has (e.g. two cars made in Complet)
 * stay visible and usable -- only CREATING another of a kind is blocked.
 *
 * Client-side only for now: the mode is a local test switch the server
 * doesn't know (lib/appMode.tsx). Once a server plan drives the mode,
 * SpaceController::store must enforce the same rule (see BACKLOG).
 */

/** Whether Simplu still lets the user create a space of `kind`, given the
 * kinds of the spaces they already have. */
export function canCreateSpaceInSimple(kind: SpaceKind | string, existingKinds: (SpaceKind | string | null | undefined)[]): boolean {
  return !existingKinds.includes(kind);
}

/** The create entry points call this first: false = blocked, and the user
 * has been told why (call it with no sheet open -- it's a ConfirmHost
 * dialog). */
export function guardSimpleSpaceCreate(kind: SpaceKind | string, existingKinds: (SpaceKind | string | null | undefined)[]): boolean {
  if (canCreateSpaceInSimple(kind, existingKinds)) return true;
  const label = SPACE_KIND_LABEL[kind as SpaceKind] ?? "acest tip";
  notifyAction(
    `Ai deja un spațiu ${label}`,
    "În modul Simplu poți avea câte un singur spațiu din fiecare tip. Pentru mai multe, folosește orgOS Complet.",
  );
  return false;
}
