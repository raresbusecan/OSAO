import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  View,
  type AccessibilityActionEvent,
  type Insets,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  PanGestureHandler,
  LegacyScrollView as ScrollView,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { useReducedMotion } from "@/lib/motion";

/**
 * The one drag-to-reorder list (Acasă "Aranjează", Spații edit mode).
 * Replaces react-native-draggable-flatlist there, which broke on rapid
 * repeated drags (overlapping cards / gaps): it positions cells from
 * onLayout measurements that arrive asynchronously on the new
 * architecture, holds each cell's last translate until its NEXT onLayout
 * (a cell whose layout doesn't change keeps a stale offset), and resets
 * its drag state in a deferred InteractionManager callback that can land
 * in the middle of the next drag -- all reanimated worklets on top.
 *
 * This one is a plain ScrollView (no virtualization, every row mounted)
 * + classic PanGestureHandler on each row's handle + RN Animated (JS
 * driver), the combination proven on this Expo Go (SwipeBackView,
 * MonthSwipe). Positions are never read from the layout: a row's slot is
 * the sum of the HEIGHTS of the rows before it in the current order, and
 * heights don't change when the order does. On release the order is
 * committed and every row gets a FRESH Animated.Value holding only what
 * it still has to travel to its new slot (0 for most), read by the same
 * React render that moves the rows -- so there's no frame where a row's
 * old offset applies to its new position, and no state left to reset
 * later. A new drag can start right after.
 */

const EDGE = 80; // px from the viewport edge where auto-scroll kicks in
const MAX_SCROLL_STEP = 16; // px per frame at the very edge
const SHIFT_MS = 150; // a neighbor making room
const SETTLE_MS = 160; // the dropped row easing into its slot

type Drag = {
  key: string;
  from: number;
  keys: string[];
  heights: number[];
  tops: number[];
  base: number; // the row's visual offset when grabbed (a drop still settling)
  dy: number;
  fingerY: number;
  scrollStart: number;
  to: number;
};

type HandleCtx = {
  activeKey: string | null;
  onGesture: (key: string, e: PanGestureHandlerGestureEvent) => void;
  onState: (key: string, e: PanGestureHandlerStateChangeEvent) => void;
  moveBy: (key: string, dir: -1 | 1) => void;
  canMove: (key: string, dir: -1 | 1) => boolean;
};

const ReorderContext = createContext<HandleCtx | null>(null);

export type ReorderRenderParams<T> = {
  item: T;
  index: number;
  /** This row is the one being dragged. */
  isActive: boolean;
  /** Some row is being dragged (e.g. to disable taps on every row). */
  isDragging: boolean;
};

export function ReorderList<T>({
  data,
  keyExtractor,
  renderItem,
  onReorder,
  header,
  footer,
  contentContainerStyle,
  activeScale = 1.02,
  liftedStyle,
  testID,
}: {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (p: ReorderRenderParams<T>) => React.ReactNode;
  /** The new full order, once per drop (only when it changed). */
  onReorder: (data: T[]) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  activeScale?: number;
  /** Extra style on the row while it's lifted (e.g. an opaque background). */
  liftedStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [liftKey, setLiftKey] = useState<string | null>(null);

  const keys = useMemo(() => data.map(keyExtractor), [data, keyExtractor]);
  const joined = keys.join("\u0001");

  const dataRef = useRef(data);
  dataRef.current = data;
  // Read by the handles' a11y actions during render and by a new drag;
  // a drag never starts while a committed order hasn't rendered (pending).
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const heights = useRef(new Map<string, number>());
  const anims = useRef(new Map<string, Animated.Value>());
  const targets = useRef(new Map<string, number>());
  const drag = useRef<Drag | null>(null);
  /** The order handed to onReorder, until the parent renders it. */
  const pending = useRef<string | null>(null);
  const lift = useRef(new Animated.Value(0)).current;

  const scrollRef = useRef<any>(null);
  const viewportRef = useRef<React.ComponentRef<typeof View>>(null);
  const scrollY = useRef(0);
  const viewTop = useRef(0);
  const viewH = useRef(0);
  const contentH = useRef(0);
  const raf = useRef<number | null>(null);

  const anim = (key: string) => {
    let a = anims.current.get(key);
    if (!a) {
      a = new Animated.Value(0);
      anims.current.set(key, a);
    }
    return a;
  };
  /** Stops whatever the value is doing and returns where it is now (sync on the JS driver). */
  const current = (a: Animated.Value) => {
    let v = 0;
    a.stopAnimation((x) => (v = x));
    return v;
  };
  const glide = (a: Animated.Value, to: number, ms: number) => {
    if (reducedRef.current) {
      a.stopAnimation();
      a.setValue(to);
      return;
    }
    Animated.timing(a, { toValue: to, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  };

  // A row's shift while `d.key` hovers at `to`: the rows between the
  // original and the hovered slot step one active-row height toward it.
  const shiftFor = (d: Drag, j: number, to: number) => {
    const h = d.heights[d.from];
    if (j > d.from && j <= to) return -h;
    if (j < d.from && j >= to) return h;
    return 0;
  };

  // Where the dragged row belongs: its LEADING edge past a neighbor's
  // middle swaps with it (draggable-flatlist's rule, but on fixed
  // snapshot positions, so it can't drift).
  const targetIndex = (d: Drag, T: number) => {
    const top = d.tops[d.from] + T;
    const bottom = top + d.heights[d.from];
    let to = d.from;
    for (let j = d.from + 1; j < d.keys.length; j++) {
      if (bottom >= d.tops[j] + d.heights[j] / 2) to = j;
      else break;
    }
    if (to === d.from) {
      for (let j = d.from - 1; j >= 0; j--) {
        if (top <= d.tops[j] + d.heights[j] / 2) to = j;
        else break;
      }
    }
    return to;
  };

  const offsetNow = (d: Drag) => d.base + d.dy + (scrollY.current - d.scrollStart);

  const update = () => {
    const d = drag.current;
    if (!d) return;
    const T = offsetNow(d);
    anim(d.key).setValue(T);
    const to = targetIndex(d, T);
    if (to === d.to) return;
    d.to = to;
    d.keys.forEach((k, j) => {
      if (j === d.from) return;
      const t = shiftFor(d, j, to);
      if ((targets.current.get(k) ?? 0) === t) return;
      targets.current.set(k, t);
      glide(anim(k), t, SHIFT_MS);
    });
  };

  const stopAutoScroll = () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };
  const autoScroll = () => {
    const d = drag.current;
    if (!d) {
      raf.current = null;
      return;
    }
    const top = viewTop.current;
    const bottom = top + viewH.current;
    let step = 0;
    if (viewH.current > 0) {
      if (d.fingerY < top + EDGE) step = -MAX_SCROLL_STEP * Math.min(1, (top + EDGE - d.fingerY) / EDGE);
      else if (d.fingerY > bottom - EDGE) step = MAX_SCROLL_STEP * Math.min(1, (d.fingerY - (bottom - EDGE)) / EDGE);
    }
    if (step !== 0) {
      const max = Math.max(0, contentH.current - viewH.current);
      const next = Math.max(0, Math.min(max, scrollY.current + step));
      if (next !== scrollY.current) {
        scrollY.current = next;
        scrollRef.current?.scrollTo({ y: next, animated: false });
        update();
      }
    }
    raf.current = requestAnimationFrame(autoScroll);
  };

  const begin = (key: string, fingerY: number) => {
    if (drag.current || pending.current) return false;
    const ks = keysRef.current;
    const from = ks.indexOf(key);
    if (from < 0) return false;
    const hs = ks.map((k) => heights.current.get(k) ?? 0);
    const tops: number[] = [];
    hs.reduce((y, h, i) => ((tops[i] = y), y + h), 0);
    targets.current = new Map();
    drag.current = { key, from, keys: ks, heights: hs, tops, base: current(anim(key)), dy: 0, fingerY, scrollStart: scrollY.current, to: from };
    viewportRef.current?.measureInWindow((_x, y, _w, h) => {
      viewTop.current = y;
      if (h > 0) viewH.current = h;
    });
    setActiveKey(key);
    setLiftKey(key);
    lift.stopAnimation();
    if (reducedRef.current) lift.setValue(1);
    else Animated.timing(lift, { toValue: 1, duration: 120, useNativeDriver: false }).start();
    stopAutoScroll();
    raf.current = requestAnimationFrame(autoScroll);
    return true;
  };

  const dropLift = () => {
    if (reducedRef.current) {
      lift.setValue(0);
      setLiftKey(null);
      return;
    }
    Animated.timing(lift, { toValue: 0, duration: SETTLE_MS, useNativeDriver: false }).start(({ finished }) => {
      if (finished) setLiftKey(null);
    });
  };

  // Commits `d` hovering at `to`: the new order goes to the parent, and
  // every row starts over on a fresh value = what it still has to travel.
  const commit = (d: Drag, to: number) => {
    const moved = [...dataRef.current];
    const [item] = moved.splice(d.from, 1);
    moved.splice(to, 0, item);
    const T = current(anim(d.key));
    const finalOffset = to > d.from
      ? d.heights.slice(d.from + 1, to + 1).reduce((s, h) => s + h, 0)
      : -d.heights.slice(to, d.from).reduce((s, h) => s + h, 0);
    const next = new Map<string, Animated.Value>();
    d.keys.forEach((k, j) => {
      const now = k === d.key ? T : current(anim(k));
      const rest = now - (k === d.key ? finalOffset : shiftFor(d, j, to));
      const v = new Animated.Value(Math.abs(rest) < 0.5 ? 0 : rest);
      next.set(k, v);
      if (Math.abs(rest) >= 0.5) glide(v, 0, SETTLE_MS);
    });
    anims.current = next;
    targets.current = new Map();
    pending.current = moved.map(keyExtractor).join("\u0001");
    onReorderRef.current(moved);
  };

  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    stopAutoScroll();
    const to = d.to;
    if (to === d.from) {
      // Back where it started: nothing to commit, the neighbors are
      // already heading back to 0.
      glide(anim(d.key), 0, SETTLE_MS);
    } else {
      commit(d, to);
    }
    setActiveKey(null);
    dropLift();
  };

  // The parent rendered an order: either the one just committed, or a
  // change of its own (a card added / removed, a template) -- then any
  // drag in flight and every leftover offset is dropped.
  useLayoutEffect(() => {
    if (pending.current === joined) {
      pending.current = null;
      return;
    }
    if (pending.current == null && !drag.current) return;
    pending.current = null;
    drag.current = null;
    stopAutoScroll();
    anims.current = new Map();
    targets.current = new Map();
    setActiveKey(null);
    lift.stopAnimation();
    lift.setValue(0);
    setLiftKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);

  useEffect(() => () => stopAutoScroll(), []);

  const ctx = useMemo<HandleCtx>(
    () => ({
      activeKey,
      onGesture: (key, e) => {
        const d = drag.current;
        if (!d || d.key !== key) return;
        d.dy = e.nativeEvent.translationY;
        d.fingerY = e.nativeEvent.absoluteY;
        update();
      },
      onState: (key, e) => {
        const { state, oldState, absoluteY } = e.nativeEvent;
        if (state === State.ACTIVE && oldState !== State.ACTIVE) {
          begin(key, absoluteY);
          return;
        }
        if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
          if (drag.current?.key === key) end();
        }
      },
      moveBy: (key, dir) => {
        if (drag.current || pending.current) return;
        const i = keysRef.current.indexOf(key);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= keysRef.current.length) return;
        const moved = [...dataRef.current];
        const [item] = moved.splice(i, 1);
        moved.splice(j, 0, item);
        pending.current = moved.map(keyExtractor).join("\u0001");
        onReorderRef.current(moved);
      },
      canMove: (key, dir) => {
        const i = keysRef.current.indexOf(key);
        return i >= 0 && i + dir >= 0 && i + dir < keysRef.current.length;
      },
    }),
    // The callbacks only read refs; activeKey is here for the handles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeKey, keyExtractor],
  );

  const liftScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, activeScale] });

  return (
    <ReorderContext.Provider value={ctx}>
      <View
        ref={viewportRef}
        style={{ flex: 1 }}
        onLayout={(e: LayoutChangeEvent) => (viewH.current = e.nativeEvent.layout.height)}
      >
        <ScrollView
          ref={scrollRef}
          testID={testID}
          scrollEnabled={activeKey == null}
          scrollEventThrottle={16}
          onScroll={(e) => {
            // While dragging, auto-scroll owns the offset (late scroll
            // events would pull it back).
            if (!drag.current) scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          onContentSizeChange={(_w: number, h: number) => (contentH.current = h)}
          contentContainerStyle={contentContainerStyle}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {data.map((item, index) => {
            const key = keys[index];
            const lifted = liftKey === key;
            return (
              <Animated.View
                key={key}
                onLayout={(e: LayoutChangeEvent) => heights.current.set(key, e.nativeEvent.layout.height)}
                style={[
                  {
                    zIndex: lifted ? 10 : 0,
                    transform: lifted ? [{ translateY: anim(key) }, { scale: liftScale }] : [{ translateY: anim(key) }],
                  },
                  lifted ? liftedStyle : null,
                ]}
              >
                {renderItem({ item, index, isActive: activeKey === key, isDragging: activeKey != null })}
              </Animated.View>
            );
          })}
          {footer}
        </ScrollView>
      </View>
    </ReorderContext.Provider>
  );
}

/**
 * The ☰ grip of one ReorderList row: dragging it moves the row (starts
 * after a few px, no hold). Screen readers get "Mută mai sus / mai jos"
 * actions on it instead of the drag.
 */
export function ReorderHandle({
  id,
  label,
  testID,
  hitSlop = 6,
  style,
  children,
}: {
  /** The row's key (the list's keyExtractor). */
  id: string;
  label: string;
  testID?: string;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const ctx = useContext(ReorderContext);
  if (!ctx) throw new Error("ReorderHandle must be rendered inside a ReorderList row");
  const slop: Insets = { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop };
  const actions = [
    ...(ctx.canMove(id, -1) ? [{ name: "moveUp", label: "Mută mai sus" }] : []),
    ...(ctx.canMove(id, 1) ? [{ name: "moveDown", label: "Mută mai jos" }] : []),
  ];
  return (
    <PanGestureHandler
      activeOffsetY={[-4, 4]}
      hitSlop={slop}
      onGestureEvent={(e) => ctx.onGesture(id, e)}
      onHandlerStateChange={(e) => ctx.onState(id, e)}
    >
      <View
        testID={testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Trage ca să muți, sau folosește acțiunile mai sus / mai jos."
        accessibilityActions={actions}
        onAccessibilityAction={(e: AccessibilityActionEvent) => {
          if (e.nativeEvent.actionName === "moveUp") ctx.moveBy(id, -1);
          if (e.nativeEvent.actionName === "moveDown") ctx.moveBy(id, 1);
        }}
        style={style}
      >
        {children}
      </View>
    </PanGestureHandler>
  );
}
