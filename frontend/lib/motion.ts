import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Easing } from "react-native";

/**
 * Shared motion vocabulary for the 2026-10 redesign. Everything here is
 * React Native's own `Animated` API -- NOT react-native-reanimated, whose
 * worklets silently do nothing in this project's Expo Go install (see
 * components/spaces/SwipeBackView.tsx's header for the full story).
 *
 * Motion answers an action (a press, a sheet opening, a value changing);
 * the only unprompted motions are Home's one-time total/bar reveal and
 * Buget's "Ritmul lunii" spend line (once per app session, BudgetPaceCard).
 */
export const motion = {
  /** Press squeeze per element size: small controls squeeze most, big
   * cards least (the same 3% on a full-width card reads as a lurch).
   * Rows inside a grouped card don't scale at all -- they highlight. */
  scale: { control: 0.94, tile: 0.97, card: 0.985 },
  press: { speed: 40, bounciness: 0 },
  release: { speed: 24, bounciness: 6 },
  /** Number count-up and bar fill. */
  reveal: { duration: 800, easing: Easing.out(Easing.cubic) },
  /** Small state changes (a checkbox, a chip). */
  quick: { duration: 180, easing: Easing.out(Easing.quad) },
};

/* One app-wide reduced-motion subscription instead of one per animated
 * component (a 30-row list used to open 30 listeners). The value is
 * cached at module level, so components mounted after the first answer
 * get it synchronously on their first frame. */
let reducedMotion = false;
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => {
      reducedMotion = v;
      listeners.forEach((l) => l());
    })
    .catch(() => {});
  AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
    reducedMotion = v;
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the phone asks for reduced motion -- every animated
 * primitive jumps straight to its end state then. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reducedMotion, () => false);
}
