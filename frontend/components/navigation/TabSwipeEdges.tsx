import React, { useRef } from "react";
import { View, Dimensions } from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import { useRouter, useSegments } from "expo-router";
import { TAB_ORDER, clearTrail, markTrailReturn, trailDirection, trailFor } from "@/lib/navigation/returnTrail";
import { useAppMode } from "@/lib/appMode";

// Simplu mode (lib/appMode.tsx) has only these two tabs in its bar --
// the edges never swipe to the hidden Spații / Buget.
const SIMPLE_ORDER = ["home", "calendar"] as const;

/**
 * Swipe-from-either-edge to switch between the 4 main tabs (Acasă/
 * Spații/Calendar/Buget), per explicit user request -- narrow edge hot
 * zones (same EDGE_WIDTH/classic-PanGestureHandler+Animated recipe as
 * SwipeBackView, not react-native-reanimated's Gesture.Pan()/worklet
 * system, confirmed broken in this project's Expo Go install), not a
 * full-screen gesture: a full-screen horizontal pan would compete with
 * every SwipeRow-wrapped row's own resolve/delete swipe throughout Home,
 * and with Calendar's own existing full-width month-swipe
 * PanGestureHandler. Rendered on top (after <Tabs> in the tree) so it
 * only claims the outer ~32px strip on each side; everywhere else keeps
 * working exactly as before, including Calendar's month swipe, which
 * still owns the middle of its own screen.
 *
 * Hidden entirely inside a Space detail screen ([id].tsx) -- that's not
 * one of the 4 tabs being cycled, and it already has its own edge swipe
 * (SwipeBackView, "go back") that this must not compete with.
 *
 * Return trail (lib/navigation/returnTrail.ts): while a valid trail
 * applies on this tab, the swipe pointing toward the origin's position in
 * the tab bar (origin to the right -> drag left from the right edge;
 * origin to the left -> drag right from the left edge) goes back to the
 * origin route instead of the neighbour, and consumes the trail. The
 * other edge keeps its normal behaviour. Checked at gesture END by wall
 * clock, so an expired trail never hijacks a swipe.
 */
const SCREEN_WIDTH = Dimensions.get("window").width;
const EDGE_WIDTH = 24;
const TRIGGER_DISTANCE = SCREEN_WIDTH * 0.25;
const TRIGGER_VELOCITY = 700;

export function TabSwipeEdges() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const { isSimple } = useAppMode();
  const order: readonly string[] = isSimple ? SIMPLE_ORDER : TAB_ORDER;
  const current = segments[1] as (typeof TAB_ORDER)[number] | undefined;
  const index = current ? order.indexOf(current) : -1;

  // Guards against the blank-screen bug a real device hit: calling
  // router.navigate() synchronously from inside the native gesture
  // callback raced React Navigation's own tab-shift transition (it
  // started the new screen's animation before the gesture had fully
  // released), so the incoming screen got stuck at the transition's
  // opacity:0 starting point. Deferring one frame (requestAnimationFrame)
  // lets the gesture's own native-side teardown finish first; the lock
  // also blocks a stray duplicate state-change event from firing a
  // second navigate before the first one's even landed.
  const navigatingRef = useRef(false);

  if (index === -1) return null;

  const goTo = (direction: 1 | -1) => {
    if (navigatingRef.current) return;
    const trail = isSimple ? null : trailFor(current);
    let href: string;
    if (trail && current && trailDirection(trail, current) === direction) {
      href = trail.originHref;
      clearTrail();
      markTrailReturn(href);
    } else {
      const next = index + direction;
      if (next < 0 || next >= order.length) return;
      href = `/(tabs)/${order[next]}`;
    }
    navigatingRef.current = true;
    requestAnimationFrame(() => {
      router.navigate(href as any);
      // Released on the following frame, not immediately -- the goal is
      // only to block a second native event from the SAME gesture, not
      // to debounce a genuinely new swipe a moment later.
      requestAnimationFrame(() => {
        navigatingRef.current = false;
      });
    });
  };

  const onEdgeStateChange = (direction: 1 | -1) => (event: {
    nativeEvent: { state: number; translationX: number; velocityX: number };
  }) => {
    const { state, translationX, velocityX } = event.nativeEvent;
    if (state !== State.END) return;

    // Left edge drags RIGHT (positive translationX) -> previous tab.
    // Right edge drags LEFT (negative translationX) -> next tab.
    const distance = direction === -1 ? translationX : -translationX;
    const velocity = direction === -1 ? velocityX : -velocityX;
    if (distance > TRIGGER_DISTANCE || velocity > TRIGGER_VELOCITY) goTo(direction);
  };

  return (
    <>
      <PanGestureHandler
        activeOffsetX={12}
        failOffsetY={[-10, 10]}
        onHandlerStateChange={onEdgeStateChange(-1)}
      >
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: EDGE_WIDTH }} />
      </PanGestureHandler>
      <PanGestureHandler
        activeOffsetX={-12}
        failOffsetY={[-10, 10]}
        onHandlerStateChange={onEdgeStateChange(1)}
      >
        <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: EDGE_WIDTH }} />
      </PanGestureHandler>
    </>
  );
}
