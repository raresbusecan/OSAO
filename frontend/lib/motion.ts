import { useEffect, useState } from "react";
import { AccessibilityInfo, Easing } from "react-native";

/**
 * Shared motion vocabulary for the 2026-10 redesign. Everything here is
 * React Native's own `Animated` API -- NOT react-native-reanimated, whose
 * worklets silently do nothing in this project's Expo Go install (see
 * components/spaces/SwipeBackView.tsx's header for the full story).
 *
 * Motion answers an action (a press, a sheet opening, a value changing);
 * the only unprompted motion is Home's one-time total/bar reveal.
 */
export const motion = {
  /** Press feedback -- a quick, slightly springy squeeze. */
  pressScale: 0.97,
  press: { speed: 40, bounciness: 0 },
  release: { speed: 24, bounciness: 6 },
  /** Number count-up and bar fill. */
  reveal: { duration: 800, easing: Easing.out(Easing.cubic) },
  /** Small state changes (a checkbox, a chip). */
  quick: { duration: 180, easing: Easing.out(Easing.quad) },
};

/** True when the phone asks for reduced motion -- every animated
 * primitive jumps straight to its end state then. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
