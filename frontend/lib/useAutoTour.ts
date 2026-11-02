import { useEffect, useRef, useSyncExternalStore } from "react";
import { useIsFocused } from "expo-router";
import { useAuth } from "@/providers/auth";
import { useAppMode } from "@/lib/appMode";
import { isDialogOpen, subscribeDialog } from "@/lib/confirmHost";
import { isHelpOpen, subscribeHelp } from "@/lib/help";
import {
  ONE_AUTO_TOUR_PER_SESSION,
  TOURS,
  consumePendingTour,
  isSeenLocally,
  isTourActive,
  pendingTour,
  startTour,
  subscribeTours,
  wasAutoTourShownThisSession,
  type TourCtx,
  type TourKey,
} from "@/lib/tours";

const AUTO_DELAY = 600;
// A replay asked for from Settings / the "ⓘ" sheet: long enough for that
// sheet's Modal (or the Settings screen) to be gone first.
const REQUEST_DELAY = 450;

let gateVersion = 0;
const gateListeners = new Set<() => void>();
function bump() {
  gateVersion += 1;
  gateListeners.forEach((l) => l());
}
let wired = false;
function subscribeGate(listener: () => void) {
  if (!wired) {
    wired = true;
    subscribeDialog(bump);
    subscribeHelp(bump);
    subscribeTours(bump);
  }
  gateListeners.add(listener);
  return () => {
    gateListeners.delete(listener);
  };
}

/**
 * Starts a screen's first-use tour (lib/tours.ts) by itself the first
 * time the user lands there, or when Settings / "ⓘ" asked for it
 * (requestTour). Fires only when ALL hold: the user is loaded and hasn't
 * finished/skipped it (server or this session), the screen is focused,
 * `ready` (data loaded, nothing of the screen's own open), no dialog
 * (ConfirmHost), no help sheet, no other tour -- then waits 600ms,
 * re-checks, and starts. A requested replay ignores the seen state.
 */
export function useAutoTour(key: TourKey, { ready, ctx }: { ready: boolean; ctx: TourCtx }) {
  const { user } = useAuth();
  // orgOS Simplu (lib/appMode.tsx) never auto-starts a tour -- the tours
  // describe the full screens. An explicit replay (requestTour) still runs.
  const { isSimple } = useAppMode();
  const focused = useIsFocused();
  const gate = useSyncExternalStore(subscribeGate, () => gateVersion, () => 0);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  // Seen = this version or a newer one: bumping a tour's `version` shows
  // it once more to everyone who saw the old one (Buget v2, 2026-11-02).
  const seen = user?.tours?.[key];
  const seenOnServer = !!seen && (seen.v ?? 1) >= (TOURS[key]?.version ?? 1);

  useEffect(() => {
    if (!user || !focused || !ready) return;
    const requested = pendingTour() === key;
    const auto =
      !requested &&
      !isSimple &&
      !seenOnServer &&
      !isSeenLocally(key) &&
      !(ONE_AUTO_TOUR_PER_SESSION && wasAutoTourShownThisSession());
    if (!requested && !auto) return;
    const blocked = () => isDialogOpen() || isHelpOpen() || isTourActive();
    if (blocked()) return; // a gate change re-runs this effect
    const timer = setTimeout(() => {
      if (blocked()) return;
      if (requested) consumePendingTour(key);
      startTour(key, ctxRef.current, { auto: !requested });
    }, requested ? REQUEST_DELAY : AUTO_DELAY);
    return () => clearTimeout(timer);
    // `gate` re-runs it whenever a dialog / help sheet / tour opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user, seenOnServer, focused, ready, gate, key, isSimple]);
}
