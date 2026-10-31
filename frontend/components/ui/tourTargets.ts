import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from "react-native";

/**
 * What a first-use tour (lib/tours.ts) points at. A screen spreads
 * `useTourTarget("home.edit")` on a View; TourHost looks the node up by id
 * and measures it in the window. Registered only while mounted, so a
 * hidden card simply has no target and the step falls back to its
 * illustration.
 */
type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

const targets = new Map<string, Measurable>();

export function useTourTarget(id: string): { ref: (node: any) => void; collapsable: false } {
  const current = useRef<any>(null);
  const ref = useCallback(
    (node: any) => {
      if (node) {
        current.current = node;
        targets.set(id, node);
      } else if (targets.get(id) === current.current) {
        targets.delete(id);
        current.current = null;
      }
    },
    [id],
  );
  // collapsable:false keeps the View in the native tree on Android, so it
  // can be measured.
  return { ref, collapsable: false };
}

export function getTourTarget(id: string): Measurable | null {
  return targets.get(id) ?? null;
}

/** The target's window rect, or null if it can't be measured. */
export function measureTourTarget(id: string): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const node = targets.get(id);
  if (!node?.measureInWindow) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, 500);
    try {
      node.measureInWindow((x, y, w, h) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(Number.isFinite(x) && Number.isFinite(y) ? { x, y, w: w || 0, h: h || 0 } : null);
      });
    } catch {
      done = true;
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/* ---------------- the screen's scroll view ---------------- */

type ScrollEntry = { ref: RefObject<ScrollViewInstance | null>; y: { current: number } };
const scrollers = new Map<string, ScrollEntry>();

/**
 * Registers a screen's ScrollView so a tour can scroll a target into view
 * (and back to the top when it ends). Spread the returned props on that
 * ScrollView -- they track the current offset.
 */
export function useTourScroll(screenKey: string, scrollRef: RefObject<ScrollViewInstance | null>) {
  const y = useRef(0);
  useEffect(() => {
    const entry = { ref: scrollRef, y };
    scrollers.set(screenKey, entry);
    return () => {
      if (scrollers.get(screenKey) === entry) scrollers.delete(screenKey);
    };
  }, [screenKey, scrollRef]);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    y.current = e.nativeEvent.contentOffset.y;
  }, []);
  return { onScroll, scrollEventThrottle: 16 };
}

export function getTourScroll(screenKey: string): ScrollEntry | null {
  return scrollers.get(screenKey) ?? null;
}
