import React, { useRef, useState } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import { useReducedMotion } from "@/lib/motion";

/** How far a drag must travel (px) to change the month on release. A
 * quicker flick (velocity) commits sooner. */
const COMMIT_DISTANCE = 50;
const COMMIT_VELOCITY = 500;
/** How much a drag toward a month that can't be reached still moves. */
const EDGE_RESISTANCE = 0.2;

export type MonthPager = {
  /** Slides the page out toward `dir` (+1 = next, -1 = previous), runs
   * `apply` (the state change) while it's off-screen, slides it back
   * in. Instant under reduced motion. Chevrons / "Azi" use this too, so
   * every way of changing the month looks the same. */
  slide: (dir: 1 | -1, apply: () => void) => void;
  /** Internal: read by MonthSwipeView. */
  drag: Animated.Value;
  width: React.MutableRefObject<number>;
  reduced: boolean;
};

/**
 * The one month-paging gesture every month grid uses (Calendar tab,
 * DatePickerSheet, the credit's month/year picker). Classic
 * PanGestureHandler + RN Animated only -- reanimated worklets don't run
 * in this Expo Go install.
 */
export function useMonthPager(): MonthPager {
  const reduced = useReducedMotion();
  const [drag] = useState(() => new Animated.Value(0));
  const width = useRef(320);
  // True while the page is sliding OUT (before `apply` runs). A second
  // chevron tap in that ~140ms used to interrupt this animation, whose
  // callback still applied, and then apply again -- DatePickerSheet
  // skipped a month, Calendar re-applied the same one. Ignore it instead.
  const leaving = useRef(false);

  const slide = (dir: 1 | -1, apply: () => void) => {
    if (reduced) {
      apply();
      drag.setValue(0);
      return;
    }
    if (leaving.current) return;
    leaving.current = true;
    const W = width.current;
    Animated.timing(drag, { toValue: -dir * W, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      leaving.current = false;
      apply();
      drag.setValue(dir * W);
      Animated.timing(drag, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  };

  return { slide, drag, width, reduced };
}

/**
 * Wraps a month grid: a horizontal swipe pages it (swipe left = next,
 * swipe right = previous), the page follows the finger. Activates only
 * after 20px sideways and fails on 12px vertical, so day taps, vertical
 * scrolling and a Sheet's drag-to-dismiss (its handle) keep working. Put
 * it INSIDE the screen's gutter -- TabSwipeEdges' 24px strips sit on top
 * of the screen edges and keep owning a drag that starts there.
 */
export function MonthSwipeView({
  pager,
  onSwipe,
  canPrev = true,
  canNext = true,
  style,
  after,
  children,
}: {
  pager: MonthPager;
  /** Called with +1 / -1 once a swipe commits (and the month can change). */
  onSwipe: (dir: 1 | -1) => void;
  canPrev?: boolean;
  canNext?: boolean;
  /** Style of the outer (clipping) view -- e.g. the card background. */
  style?: StyleProp<ViewStyle>;
  /** Rendered under the paged content, inside the same card, not moving
   * with it (e.g. a legend). */
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { drag, width, reduced } = pager;

  const onGesture = reduced ? undefined : Animated.event([{ nativeEvent: { translationX: drag } }], { useNativeDriver: true });
  const onState = (e: { nativeEvent: { state: number; translationX: number; translationY: number; velocityX: number } }) => {
    const { state, translationX, translationY, velocityX } = e.nativeEvent;
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
    const dir: 1 | -1 = (translationX || -velocityX) < 0 ? 1 : -1;
    const sameWay = translationX === 0 || Math.sign(velocityX) === Math.sign(translationX);
    const sideways = Math.abs(translationX) > Math.abs(translationY);
    const far = Math.abs(translationX) > COMMIT_DISTANCE || (Math.abs(velocityX) > COMMIT_VELOCITY && sameWay);
    const allowed = dir === 1 ? canNext : canPrev;
    if (state === State.END && sideways && far && allowed) {
      onSwipe(dir);
      return;
    }
    Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
  };

  // A drag toward an unreachable month only gives a little (rubber band).
  const translateX = drag.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [canNext ? -1 : -EDGE_RESISTANCE, 0, canPrev ? 1 : EDGE_RESISTANCE],
    extrapolate: "extend",
  });

  return (
    <PanGestureHandler activeOffsetX={[-20, 20]} failOffsetY={[-12, 12]} onGestureEvent={onGesture} onHandlerStateChange={onState}>
      <Animated.View onLayout={(e) => (width.current = e.nativeEvent.layout.width)} style={[{ overflow: "hidden" }, style]}>
        <Animated.View style={{ transform: [{ translateX }] }}>{children}</Animated.View>
        {after}
      </Animated.View>
    </PanGestureHandler>
  );
}
