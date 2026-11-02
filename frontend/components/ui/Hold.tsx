import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";
import { longPressFeedback } from "@/lib/haptics";
import { hitTest, moveKey, type Rect } from "@/lib/holdGeometry";
import { hideHoldGhost, openHoldMenu, showHoldGhost, type HoldAction } from "@/lib/holdMenu";

/**
 * Hold an item to edit it in place -- the one gesture of the app for it
 * (user request 2026-11-02, variant A). Any screen wraps its items:
 *
 *   const hold = useHoldGroup({ order, onReorder, onEmptyHold, scrollRef });
 *   <ScrollView ref={scrollRef} {...hold.scrollProps}>
 *     <HoldGroup hold={hold}>
 *       {hold.sort(items, keyOf).map((it) => (
 *         <HoldItem key={...} id={...} actions={[...]}> <Card /> </HoldItem>
 *       ))}
 *
 * Hold an item ~0.4 s: it lifts. Let go = the menu with its actions
 * (HoldMenuHost). Drag instead = it moves; the others make room and the
 * new order goes to `onReorder` on release. Hold a gap = `onEmptyHold`.
 * Any layout works (a list, a 2-column grid, Acasă's paired compact
 * cards): positions are measured, never computed.
 *
 * ONE PanGestureHandler on the group, not one per item: the items are
 * re-ordered while the finger is down, and a view that moves in the
 * native hierarchy can lose its touch. The group's view never moves; it
 * finds the item under the finger itself. Classic handler + RN Animated
 * (JS driver), as in ReorderList -- reanimated worklets do nothing in
 * this project's Expo Go.
 */

const HOLD_MS = 420;
const DRAG_SLOP = 8; // px the held finger travels before it's a drag
const EDGE = 80; // px from the scroll view's edge where auto-scroll starts
const MAX_SCROLL_STEP = 14;
const SETTLE_MS = 180; // neighbours making room (LayoutAnimation)

type Reg = {
  ref: React.RefObject<React.ComponentRef<typeof View> | null>;
  reorderable: boolean;
  get: () => { actions: HoldAction[]; preview: React.ReactNode; hint?: string };
};

type Ctx = {
  register: (id: string, reg: Reg) => () => void;
  heldId: string | null;
  dragId: string | null;
  menuId: string | null;
  lift: Animated.Value;
};

const HoldContext = createContext<Ctx | null>(null);

type Scroller = { scrollTo: (o: { y: number; animated: boolean }) => void; measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;

export type HoldGroupHandle = ReturnType<typeof useHoldGroup>;

export function useHoldGroup({
  order,
  onReorder,
  onDragStart,
  onEmptyHold,
  scrollRef,
  enabled = true,
}: {
  /** Keys of the movable items, in their current order (omit = menu only). */
  order?: string[];
  /** The new order, once per drop, only when it changed. */
  onReorder?: (order: string[]) => void;
  /** A drag began (e.g. the header switches to Renunță / Gata). */
  onDragStart?: () => void;
  /** A hold that landed between items. */
  onEmptyHold?: () => void;
  /** The scroll view the group is in (auto-scroll while dragging). */
  scrollRef?: React.RefObject<any>;
  enabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const [heldId, setHeldId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [live, setLive] = useState<string[] | null>(null);
  const lift = useRef(new Animated.Value(0)).current;
  const ghost = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const regs = useRef(new Map<string, Reg>());
  const rects = useRef(new Map<string, Rect>());
  const measuring = useRef<Promise<void> | null>(null);

  const opts = useRef({ order, onReorder, onDragStart, onEmptyHold, scrollRef, reduced });
  opts.current = { order, onReorder, onDragStart, onEmptyHold, scrollRef, reduced };

  // One gesture's state (refs: the handlers run outside React's render).
  const g = useRef({
    /** A finger is down on the group (BEGAN until END / CANCELLED / FAILED). */
    down: false,
    held: null as string | null,
    dragging: false,
    rect: null as Rect | null,
    order: [] as string[],
    cooldown: false,
    // The item just swapped with: ignored until the finger leaves it, so
    // two items of different sizes can't swap back and forth.
    skip: null as string | null,
    fingerX: 0,
    fingerY: 0,
    scrollY: 0,
    viewTop: 0,
    viewH: 0,
    contentH: 0,
    raf: null as number | null,
  });

  const register = useCallback((id: string, reg: Reg) => {
    regs.current.set(id, reg);
    return () => {
      if (regs.current.get(id) === reg) regs.current.delete(id);
    };
  }, []);

  const measureAll = () => {
    const next = new Map<string, Rect>();
    const jobs = [...regs.current].map(
      ([id, reg]) =>
        new Promise<void>((resolve) => {
          const node = reg.ref.current;
          if (!node) return resolve();
          node.measureInWindow((x, y, width, height) => {
            if (width > 0 && height > 0) next.set(id, { x, y, width, height });
            resolve();
          });
        }),
    );
    const p = Promise.all(jobs).then(() => {
      rects.current = next;
    });
    measuring.current = p;
    return p;
  };

  const lifting = (on: boolean) => {
    lift.stopAnimation();
    if (opts.current.reduced) lift.setValue(on ? 1 : 0);
    else Animated.spring(lift, { toValue: on ? 1 : 0, useNativeDriver: false, damping: 18, stiffness: 320 }).start();
  };

  const stopAutoScroll = () => {
    const s = g.current;
    if (s.raf != null) cancelAnimationFrame(s.raf);
    s.raf = null;
  };

  const hover = () => {
    const s = g.current;
    if (!s.dragging || !s.held || s.cooldown) return;
    const over = hitTest(rects.current, s.fingerX, s.fingerY);
    if (over !== s.skip) s.skip = null;
    if (!over || over === s.held || over === s.skip || !regs.current.get(over)?.reorderable) return;
    const to = s.order.indexOf(over);
    if (to < 0) return;
    const next = moveKey(s.order, s.held, to);
    if (next === s.order) return;
    s.order = next;
    s.skip = over;
    s.cooldown = true;
    if (!opts.current.reduced) LayoutAnimation.configureNext({ duration: SETTLE_MS, update: { type: "easeInEaseOut" } });
    setLive(next);
    // New positions once the neighbours have settled.
    setTimeout(() => {
      measureAll().then(() => {
        s.cooldown = false;
        hover();
      });
    }, SETTLE_MS + 20);
  };

  const autoScroll = () => {
    const s = g.current;
    const scroller: Scroller = opts.current.scrollRef?.current ?? null;
    if (!s.dragging || !scroller) {
      s.raf = null;
      return;
    }
    let step = 0;
    if (s.viewH > 0) {
      const top = s.viewTop;
      const bottom = top + s.viewH;
      if (s.fingerY < top + EDGE) step = -MAX_SCROLL_STEP * Math.min(1, (top + EDGE - s.fingerY) / EDGE);
      else if (s.fingerY > bottom - EDGE) step = MAX_SCROLL_STEP * Math.min(1, (s.fingerY - (bottom - EDGE)) / EDGE);
    }
    if (step !== 0) {
      const max = Math.max(0, s.contentH - s.viewH);
      const next = Math.max(0, Math.min(max, s.scrollY + step));
      const moved = next - s.scrollY;
      if (moved !== 0) {
        s.scrollY = next;
        scroller.scrollTo({ y: next, animated: false });
        // The content moved under the finger by exactly that much.
        rects.current.forEach((r) => (r.y -= moved));
        hover();
      }
    }
    s.raf = requestAnimationFrame(autoScroll);
  };

  const startDrag = () => {
    const s = g.current;
    if (!s.held || !s.rect) return;
    const reg = regs.current.get(s.held);
    if (!reg) return;
    s.dragging = true;
    s.order = [...(opts.current.order ?? [])];
    ghost.setValue({ x: 0, y: 0 });
    // A copy: auto-scroll shifts the measured rects in place.
    showHoldGhost({ rect: { ...s.rect }, offset: ghost, preview: reg.get().preview });
    setDragId(s.held);
    setLive(s.order);
    const scroller: Scroller = opts.current.scrollRef?.current ?? null;
    scroller?.measureInWindow?.((_x, y, _w, h) => {
      s.viewTop = y;
      s.viewH = h;
    });
    stopAutoScroll();
    s.raf = requestAnimationFrame(autoScroll);
    opts.current.onDragStart?.();
  };

  const reset = () => {
    const s = g.current;
    stopAutoScroll();
    hideHoldGhost();
    s.held = null;
    s.dragging = false;
    s.rect = null;
    s.skip = null;
    s.cooldown = false;
    setHeldId(null);
    setDragId(null);
    lifting(false);
  };

  const onState = async (e: PanGestureHandlerStateChangeEvent) => {
    const { state, oldState, absoluteX, absoluteY } = e.nativeEvent;
    const s = g.current;
    if (state === State.BEGAN) {
      s.down = true;
      // Ready by the time the hold activates (HOLD_MS later).
      measureAll();
      return;
    }
    if (state === State.ACTIVE && oldState !== State.ACTIVE) {
      s.down = true;
      await (measuring.current ?? measureAll());
      // Lifted already (a release can land while the rects were read).
      if (!s.down) return;
      const id = hitTest(rects.current, absoluteX, absoluteY);
      const reg = id ? regs.current.get(id) : undefined;
      // An item with nothing to offer (no menu, can't move) ignores the
      // hold -- it isn't an empty spot either.
      if (reg && !reg.reorderable && reg.get().actions.length === 0) return;
      longPressFeedback();
      if (!id) {
        opts.current.onEmptyHold?.();
        return;
      }
      s.held = id;
      s.rect = rects.current.get(id) ?? null;
      s.fingerX = absoluteX;
      s.fingerY = absoluteY;
      setHeldId(id);
      lifting(true);
      return;
    }
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      s.down = false;
      const held = s.held;
      const rect = s.rect;
      if (s.dragging) {
        const final = s.order;
        const before = opts.current.order ?? [];
        // Batched with the parent's own update: no frame of the old order.
        setLive(null);
        if (state === State.END && final.join("\u0001") !== before.join("\u0001")) opts.current.onReorder?.(final);
        reset();
        return;
      }
      reset();
      if (state !== State.END || !held || !rect) return;
      const reg = regs.current.get(held);
      const content = reg?.get();
      if (!content || content.actions.length === 0) return;
      setMenuId(held);
      openHoldMenu({
        anchor: rect,
        preview: content.preview,
        actions: content.actions,
        hint: content.hint ?? (reg!.reorderable && opts.current.onReorder ? "Ține apăsat și trage ca să muți" : undefined),
        onClose: () => setMenuId(null),
      });
    }
  };

  const onGesture = (e: PanGestureHandlerGestureEvent) => {
    const s = g.current;
    if (!s.held) return;
    const { translationX, translationY, absoluteX, absoluteY } = e.nativeEvent;
    s.fingerX = absoluteX;
    s.fingerY = absoluteY;
    if (!s.dragging) {
      const movable = regs.current.get(s.held)?.reorderable && opts.current.onReorder;
      if (movable && Math.hypot(translationX, translationY) > DRAG_SLOP) startDrag();
      return;
    }
    ghost.setValue({ x: translationX, y: translationY });
    hover();
  };

  useEffect(() => () => stopAutoScroll(), []);

  const ctx = useMemo<Ctx>(() => ({ register, heldId, dragId, menuId, lift }), [register, heldId, dragId, menuId, lift]);

  const locked = heldId != null || dragId != null;
  const scrollProps = {
    scrollEventThrottle: 16,
    scrollEnabled: !locked,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // While dragging, auto-scroll owns the offset.
      if (!g.current.dragging) g.current.scrollY = e.nativeEvent.contentOffset.y;
    },
    onContentSizeChange: (_w: number, h: number) => {
      g.current.contentH = h;
    },
  };

  /** `items` in the order being dragged (else as given). */
  const sort = <T,>(items: T[], keyOf: (item: T) => string): T[] => {
    if (!live) return items;
    const at = new Map(live.map((k, i) => [k, i] as const));
    return [...items].sort((a, b) => (at.get(keyOf(a)) ?? Infinity) - (at.get(keyOf(b)) ?? Infinity));
  };

  return { ctx, onState, onGesture, scrollProps, sort, dragging: dragId != null, enabled };
}

/** The area whose items can be held (one gesture for all of them). */
export function HoldGroup({
  hold,
  style,
  testID,
  onLayout,
  children,
}: {
  hold: HoldGroupHandle;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <HoldContext.Provider value={hold.ctx}>
      <PanGestureHandler
        enabled={hold.enabled}
        activateAfterLongPress={HOLD_MS}
        shouldCancelWhenOutside={false}
        onGestureEvent={hold.onGesture}
        onHandlerStateChange={hold.onState}
      >
        <View testID={testID} collapsable={false} style={style} onLayout={onLayout}>
          {children}
        </View>
      </PanGestureHandler>
    </HoldContext.Provider>
  );
}

/**
 * One holdable item of a HoldGroup. `actions` = its menu; `preview` = what
 * the menu / drag shows lifted (default: `children` again -- pass a copy
 * without tour targets or refs when the children carry some).
 */
export function HoldItem({
  id,
  actions,
  preview,
  hint,
  reorderable = true,
  radius,
  style,
  children,
}: {
  id: string;
  actions: HoldAction[];
  preview?: React.ReactNode;
  hint?: string;
  reorderable?: boolean;
  /** Corner radius of the dashed slot left while the item is dragged. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const ctx = useContext(HoldContext);
  const { colors, radius: r } = useTheme();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const latest = useRef({ actions, preview: preview ?? children, hint });
  latest.current = { actions, preview: preview ?? children, hint };
  const register = ctx?.register;
  useEffect(() => register?.(id, { ref, reorderable, get: () => latest.current }), [register, id, reorderable]);

  if (!ctx) return <View style={style}>{children}</View>;
  const held = ctx.heldId === id && ctx.dragId !== id;
  const slot = ctx.dragId === id;
  const scale = ctx.lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  return (
    <Animated.View
      ref={ref as any}
      collapsable={false}
      style={[style, held ? { transform: [{ scale }] } : null, ctx.menuId === id ? { opacity: 0 } : null]}
    >
      <View style={{ opacity: slot ? 0 : 1 }}>{children}</View>
      {slot ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius ?? r.card,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: colors.borderStrong,
          }}
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * Something on a holdable page that is neither an item nor an empty spot
 * (a banner with its own buttons): a hold on it does nothing. Outside a
 * HoldGroup it's a plain View.
 */
export function HoldInert({ id, style, children }: { id: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <HoldItem id={id} actions={NO_ACTIONS} reorderable={false} style={style}>
      {children}
    </HoldItem>
  );
}

const NO_ACTIONS: HoldAction[] = [];
