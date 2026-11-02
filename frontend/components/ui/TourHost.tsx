import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";
import { useAuth } from "@/providers/auth";
import { api } from "@/lib/api";
import { CUSTOM_EVENT_COLOR, SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { heatColor, type HeatLevel } from "@/lib/statusColors";
import { MultiRingProgress } from "@/components/dashboard/RingProgress";
import { DEFAULT_SPLIT, JAR_ORDER, jarFill, type SplitKey } from "@/lib/budget/plan";
import {
  markSeenLocally,
  setTourHandler,
  tourEnded,
  type TourCtx,
  type TourDef,
  type TourGlyph,
  type TourIllustration,
  type TourPoint,
  type TourStep,
} from "@/lib/tours";
import { getTourScroll, measureTourTarget } from "./tourTargets";
import { Button, hexToRgba, readableOn } from "./primitives";

type Active = { def: TourDef; ctx: TourCtx; auto: boolean; id: number };
type Hole = { x: number; y: number; w: number; h: number; r: number };

const SCRIM = "rgba(5,7,10,0.62)";
const HOLE_PAD = 6;
const EDGE = 12;
// Below this much room for the card next to the hole, the step shows its
// illustration instead of a cut-out.
// Below this much room next to the hole the card can't show its text
// (seen on an iPhone: Buget step 1 left ~1 line), so the step drops the
// hole and shows its illustration instead.
const MIN_CARD_H = 320;

/**
 * The first-use tour overlay (lib/tours.ts). Mounted once at the root next
 * to HelpHost/ConfirmHost; renders nothing unless a tour is running.
 *
 * One transparent Modal: a dimmed scrim with a rounded hole + 2px white
 * ring around the real element (one Svg Path, evenodd) and a floating card
 * at the bottom (or top). The whole layer swallows touches, the hole too
 * -- the tour explains, it doesn't let you press through. When the target
 * isn't registered, can't be measured or leaves no room for the card, the
 * step has no hole and shows its illustration instead.
 */
export function TourHost() {
  const [active, setActive] = useState<Active | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    setTourHandler((def, ctx, auto) => {
      counter.current += 1;
      setActive({ def, ctx, auto, id: counter.current });
    });
    return () => setTourHandler(null);
  }, []);

  const onFinished = useCallback(() => {
    setActive(null);
    tourEnded();
  }, []);

  if (!active) return null;
  return <TourOverlay key={active.id} active={active} onFinished={onFinished} />;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function afterInteractions() {
  return new Promise<void>((resolve) => {
    requestIdleCallback(() => requestAnimationFrame(() => resolve()), { timeout: 500 });
  });
}

/** Rounded-rect sub-path (clockwise). */
function roundedRect({ x, y, w, h, r }: Hole) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + rr},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x + rr} A${rr},${rr} 0 0 1 ${x},${y + h - rr} V${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y} Z`;
}

function TourOverlay({ active, onFinished }: { active: Active; onFinished: () => void }) {
  const { def, ctx } = active;
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const reduced = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const { user, updateUser } = useAuth();

  const total = def.steps.length;
  const [index, setIndex] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);
  // Which step `hole` was measured for -- until then the step shows no
  // fallback illustration (no flash of it before the hole lands).
  const [measuredIndex, setMeasuredIndex] = useState(-1);
  const step: TourStep = def.steps[index];
  const last = index === total - 1;
  const cta = last && def.finalCta ? def.finalCta(ctx) : null;

  const scrim = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const card = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const content = useRef(new Animated.Value(1)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const headerRef = useRef<React.ComponentRef<typeof View>>(null);
  const closing = useRef(false);
  const busy = useRef(false);
  const openPath = useRef(pathname);

  // Open: scrim fades in, the card rises 24px and fades in.
  useEffect(() => {
    if (reduced) return;
    Animated.parallel([
      Animated.timing(scrim, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(card, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [reduced, scrim, card]);

  // Room for the card next to a hole.
  const roomFor = useCallback(
    (h: Hole, placement: TourStep["placement"]) =>
      placement === "bottom" ? winH - insets.bottom - EDGE - (h.y + h.h + EDGE) : h.y - EDGE - (insets.top + EDGE),
    [winH, insets.top, insets.bottom],
  );

  const inflate = useCallback(
    (r: { x: number; y: number; w: number; h: number }, targetRadius: number): Hole => ({
      x: r.x - HOLE_PAD,
      y: r.y - HOLE_PAD,
      w: r.w + HOLE_PAD * 2,
      h: r.h + HOLE_PAD * 2,
      r: targetRadius + HOLE_PAD,
    }),
    [],
  );

  // Per step: find the target, scroll it into view when needed, cut the hole.
  useEffect(() => {
    let cancelled = false;
    ring.setValue(0);
    // The scrim stays fully dim while the new target is found / scrolled to.
    setHole(null);
    (async () => {
      let found: Hole | null = null;
      if (step.target) {
        await afterInteractions();
        if (cancelled) return;
        let r = await measureTourTarget(step.target);
        const scroller = def.screen ? getTourScroll(def.screen) : null;
        if (r && scroller?.ref.current) {
          const h = inflate(r, step.targetRadius);
          const above = r.y < insets.top;
          const below = r.y + r.h > winH - insets.bottom;
          const noRoom = roomFor(h, step.placement) < MIN_CARD_H;
          if (above || noRoom || (step.scrollIntoView && below)) {
            // A card at the bottom wants the target at the top of the screen;
            // a card at the top wants it at the bottom.
            const y = Math.max(
              0,
              step.placement === "top"
                ? scroller.y.current + (r.y + r.h) - (winH - insets.bottom - EDGE - HOLE_PAD)
                : scroller.y.current + (r.y - (insets.top + EDGE)),
            );
            scroller.ref.current.scrollTo({ y, animated: !reduced });
            await wait(reduced ? 60 : 400);
            if (cancelled) return;
            r = await measureTourTarget(step.target);
          }
        }
        if (r && r.w > 0 && r.h > 0) {
          const h = inflate(r, step.targetRadius);
          const onScreen = h.y >= 0 && h.y + h.h <= winH && h.x + h.w > 0 && h.x < winW;
          if (onScreen && roomFor(h, step.placement) >= MIN_CARD_H) found = h;
        }
      }
      if (cancelled) return;
      setHole(found);
      setMeasuredIndex(index);
      if (found) {
        if (reduced) ring.setValue(1);
        else Animated.timing(ring, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Screen readers: land on the step's header each time.
  useEffect(() => {
    const t = setTimeout(() => {
      // findNodeHandle throws on react-native-web; screen-reader focus is native-only here.
      const node = Platform.OS !== "web" && headerRef.current ? findNodeHandle(headerRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, reduced ? 50 : 300);
    return () => clearTimeout(t);
  }, [index, reduced]);

  const scrollBack = useCallback(() => {
    const scroller = def.screen ? getTourScroll(def.screen) : null;
    scroller?.ref.current?.scrollTo({ y: 0, animated: !reduced });
  }, [def.screen, reduced]);

  const record = useCallback(
    (status: "done" | "skipped") => {
      markSeenLocally(def.key);
      const optimistic = { ...(user?.tours ?? {}), [def.key]: { status, v: def.version } };
      updateUser({ tours: optimistic });
      api
        .markTour(def.key, status, def.version)
        .then((r) => updateUser({ tours: r.tours }))
        .catch(() => {});
    },
    [def.key, def.version, user?.tours, updateUser],
  );

  /** status null = closed without marking (the route changed). */
  const close = useCallback(
    (status: "done" | "skipped" | null, href?: string) => {
      if (closing.current) return;
      closing.current = true;
      if (status) record(status);
      const finish = () => {
        onFinished();
        if (status) scrollBack();
        if (href) router.push(href as any);
      };
      if (reduced || status === null) {
        finish();
        return;
      }
      Animated.parallel([
        Animated.timing(scrim, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(card, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start(finish);
    },
    [record, onFinished, scrollBack, router, reduced, scrim, card],
  );

  // Leaving the screen some other way ends the tour, unmarked.
  useEffect(() => {
    if (pathname !== openPath.current) close(null);
  }, [pathname, close]);

  const goTo = (next: number) => {
    if (busy.current || closing.current) return;
    if (reduced) {
      setIndex(next);
      return;
    }
    busy.current = true;
    Animated.parallel([
      Animated.timing(content, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setIndex(next);
      content.setValue(0);
      Animated.timing(content, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
        busy.current = false;
      });
    });
  };

  const onPrimary = () => {
    if (!last) goTo(index + 1);
    else close("done", cta?.href);
  };

  const topAction: { label: string; a11y: string; onPress: () => void } | null = !last
    ? { label: "Sari peste", a11y: "Sari peste ghidul", onPress: () => close("skipped") }
    : cta
      ? { label: "Gata", a11y: "Gata, închide ghidul", onPress: () => close("done") }
      : null;

  const measured = measuredIndex === index;
  const illustration = typeof step.illustration === "function" ? step.illustration(ctx) : step.illustration;
  const showIllustration = !!illustration && ((typeof step.illustrationWhen === "function" ? step.illustrationWhen(ctx) : step.illustrationWhen) === "always" || (measured && !hole));
  const maxCardH = hole ? roomFor(hole, step.placement) : winH - insets.top - insets.bottom - EDGE * 2;
  const title = step.title(ctx);
  const body = step.body?.(ctx) ?? null;
  const points = step.points?.(ctx) ?? [];

  const scrimPath = `M0,0 H${winW} V${winH} H0 Z` + (hole ? ` ${roundedRect(hole)}` : "");

  return (
    // Both translucent flags: the app draws edge to edge (RN 0.86), so the
    // overlay must too, or window coordinates and the scrim would be offset.
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close("skipped")}>
      {/* The blocker swallows every touch (inside the hole too). It sits
          BEHIND the card as a sibling -- as the card's parent it claimed
          the touch first and the card's text could never scroll. */}
      <View style={{ flex: 1 }} testID="tour-overlay">
        <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} onStartShouldSetResponder={() => true} />
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ position: "absolute", left: 0, top: 0, width: winW, height: winH, opacity: scrim }}
        >
          <Svg width={winW} height={winH}>
            <Path d={scrimPath} fill={SCRIM} fillRule="evenodd" />
          </Svg>
        </Animated.View>
        {hole ? (
          <Animated.View
            pointerEvents="none"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={{ position: "absolute", left: 0, top: 0, width: winW, height: winH, opacity: Animated.multiply(ring, scrim) }}
          >
            <Svg width={winW} height={winH}>
              <Rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={hole.r} ry={hole.r} fill="none" stroke="#FFFFFF" strokeOpacity={0.92} strokeWidth={2} />
            </Svg>
          </Animated.View>
        ) : null}

        <Animated.View
          accessibilityViewIsModal
          testID="tour-card"
          style={{
            position: "absolute",
            left: EDGE,
            right: EDGE,
            ...(step.placement === "bottom" ? { bottom: insets.bottom + EDGE } : { top: insets.top + EDGE }),
            maxHeight: Math.max(MIN_CARD_H, maxCardH),
            backgroundColor: colors.surfaceSecondary,
            borderRadius: radius.lg,
            padding: spacing.gutter,
            gap: 14,
            opacity: card,
            transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [step.placement === "bottom" ? 24 : -24, 0] }) }],
            ...(Platform.OS === "ios"
              ? { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } }
              : Platform.OS === "android"
                ? { elevation: 12 }
                : { boxShadow: "0 12px 24px rgba(0,0,0,0.35)" }),
          }}
        >
          {/* Progress: done/current filled, ahead faint, then "N din 4". */}
          <View style={{ height: 24, paddingRight: 96, flexDirection: "row", alignItems: "center", gap: 10 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <View style={{ width: 88, flexDirection: "row", gap: 4 }}>
              {def.steps.map((s, i) => (
                <View key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? colors.onSurface : colors.borderStrong }} />
              ))}
            </View>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{`${index + 1} din ${total}`}</Text>
          </View>

          <Animated.View
            style={{
              flexShrink: 1,
              opacity: content,
              transform: [{ translateY: content.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}
          >
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator persistentScrollbar bounces={false}>
              {showIllustration ? <Illustration kind={illustration!} /> : null}
              <View ref={headerRef} accessible accessibilityRole="header" accessibilityLabel={`Pasul ${index + 1} din ${total}. ${title}`}>
                <Text style={{ ...typography.subtitle, color: colors.onSurface }}>{title}</Text>
              </View>
              {body ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.onSurfaceSecondary }}>{body}</Text> : null}
              {points.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {points.map((p, i) => (
                    <PointRow key={`${step.id}-${i}`} point={p} ctx={ctx} />
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
            {index > 0 ? (
              <View style={{ flex: 1 }}>
                <Button testID="tour-back" variant="secondary" label="Înapoi" a11yLabel={`Înapoi, pasul ${index} din ${total}`} onPress={() => goTo(index - 1)} />
              </View>
            ) : null}
            <View style={{ flex: 2 }}>
              <Button
                testID="tour-next"
                label={!last ? "Înainte" : cta ? cta.label : "Gata"}
                a11yLabel={!last ? `Înainte, pasul ${index + 2} din ${total}` : undefined}
                onPress={onPrimary}
              />
            </View>
          </View>

          {/* Last in the tree: read after the step, placed top-right. */}
          {topAction ? (
            <Pressable
              testID="tour-skip"
              onPress={topAction.onPress}
              accessibilityRole="button"
              accessibilityLabel={topAction.a11y}
              hitSlop={4}
              style={{ position: "absolute", top: 10, right: 10, minWidth: 44, minHeight: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 12 }}
            >
              <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurfaceTertiary }}>{topAction.label}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ---------------- points ---------------- */

function PointRow({ point, ctx }: { point: TourPoint; ctx: TourCtx }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <Glyph glyph={point.glyph} ctx={ctx} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary }}>
        {point.lead ? <Text style={{ fontWeight: "600", color: colors.onSurface }}>{`${point.lead} `}</Text> : null}
        {point.text}
      </Text>
    </View>
  );
}

const KINDS: SpaceKind[] = ["car", "home", "grocery", "expenses"];
const KIND_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  car: "car-outline",
  home: "home-outline",
  grocery: "cart-outline",
  expenses: "receipt-outline",
};

const CAR_GLYPH_ICONS: Record<"odometer" | "fuel" | "service" | "expense" | "document" | "archive" | "history", keyof typeof Ionicons.glyphMap> = {
  odometer: "speedometer-outline",
  fuel: "water-outline",
  service: "construct-outline",
  expense: "card-outline",
  document: "document-text-outline",
  archive: "archive-outline",
  history: "time-outline",
};

// Mașină's quick actions, same order/icons/labels as CarDashboard.
const CAR_ACTIONS: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Alimentare", icon: "water-outline" },
  { label: "Service", icon: "construct-outline" },
  { label: "Cheltuială", icon: "card-outline" },
  { label: "Document", icon: "document-text-outline" },
];

/** 28px decorative mark in front of a point -- hidden from screen readers. */
function Glyph({ glyph, ctx }: { glyph: TourGlyph; ctx: TourCtx }) {
  const { colors, isDark } = useTheme();
  const circle = (children: React.ReactNode) => (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}
    >
      {children}
    </View>
  );
  const slot = (children: React.ReactNode, style?: object) => (
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ width: 28, alignItems: "center" }, style]}>
      {children}
    </View>
  );
  switch (glyph) {
    case "info":
      return circle(<Ionicons name="information-circle-outline" size={17} color={colors.onSurface} />);
    case "pencil":
      return circle(<Ionicons name="create-outline" size={15} color={colors.onSurface} />);
    case "budget":
      return circle(<Ionicons name="wallet-outline" size={15} color={colors.onSurface} />);
    case "avatar": {
      const badge = ctx.emailState === "unverified" ? { bg: colors.warning, check: false } : ctx.emailState === "verified" ? { bg: colors.success, check: true } : null;
      return circle(
        <>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onSurface }}>{ctx.initial || "A"}</Text>
          {badge ? (
            <View style={{ position: "absolute", right: -3, bottom: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: badge.bg, borderWidth: 2, borderColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" }}>
              {badge.check ? (
                <Ionicons name="checkmark" size={8} color={readableOn(badge.bg)} />
              ) : (
                <Text style={{ fontSize: 8, fontWeight: "600", color: readableOn(badge.bg), lineHeight: 10 }}>!</Text>
              )}
            </View>
          ) : null}
        </>,
      );
    }
    case "spent":
      return slot(
        <View style={{ flexDirection: "row", gap: 2 }}>
          {KINDS.map((k) => (
            <View key={k} style={{ width: 5, height: 10, borderRadius: 2, backgroundColor: SPACE_IDENTITY_COLORS[k] }} />
          ))}
        </View>,
        { paddingTop: 5 },
      );
    case "faded": {
      const base = SPACE_IDENTITY_COLORS.home!;
      return slot(<View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: base, backgroundColor: hexToRgba(base, 0.45) }} />, { paddingTop: 4 });
    }
    case "remaining":
      return slot(<Text style={{ fontSize: 11, fontWeight: "600", color: colors.success }}>Mai</Text>, { paddingTop: 2 });
    case "tap":
      return slot(<Ionicons name="hand-left-outline" size={18} color={colors.onSurfaceTertiary} />, { paddingTop: 1 });
    case "month":
      return circle(<Ionicons name="chevron-forward" size={15} color={colors.onSurface} />);
    case "swipe":
      return circle(<Ionicons name="swap-horizontal" size={15} color={colors.onSurface} />);
    case "reminder":
      return circle(<Ionicons name="card-outline" size={15} color={colors.onSurface} />);
    case "heat":
      return slot(
        <View style={{ flexDirection: "row", gap: 2 }}>
          {([1, 4, 8] as HeatLevel[]).map((l) => (
            <View key={l} style={{ width: 7, height: 10, borderRadius: 2, backgroundColor: heatColor(l, isDark) }} />
          ))}
        </View>,
        { paddingTop: 5 },
      );
    case "eventDot":
      return slot(<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: spaceTextColor("custom", isDark) ?? CUSTOM_EVENT_COLOR }} />, { paddingTop: 6 });
    case "lateDot":
      return slot(<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error }} />, { paddingTop: 6 });
    // Buget: a jar's color chip (lib/budget/plan.ts jarFill).
    case "jarNeeds":
    case "jarGuiltFree":
    case "jarThird":
    case "jarSaving": {
      const key: SplitKey = glyph === "jarNeeds" ? "needs" : glyph === "jarGuiltFree" ? "guilt_free" : glyph === "jarThird" ? "third" : "short_term";
      return slot(<View style={{ width: 16, height: 8, borderRadius: 4, backgroundColor: jarFill(key, colors, isDark), opacity: key === "needs" ? 0.85 : 1 }} />, { paddingTop: 6 });
    }
    // Buget: a "Cheltuit pe spații" row's share bar (part of the month, not a limit).
    case "shareBar":
      return slot(
        <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
          <View style={{ width: "40%", height: "100%", borderRadius: 2, backgroundColor: SPACE_IDENTITY_COLORS.home! }} />
        </View>,
        { paddingTop: 8 },
      );
    case "repeat":
      return circle(<Ionicons name="repeat" size={15} color={colors.onSurface} />);
    case "savings":
      return circle(<Ionicons name="flag-outline" size={15} color={colors.success} />);
    // Mașină: the same icons the car screen uses, in the car's color.
    case "odometer":
    case "fuel":
    case "service":
    case "expense":
    case "document":
    case "archive":
    case "history":
      return circle(<Ionicons name={CAR_GLYPH_ICONS[glyph]} size={15} color={spaceTextColor("car", isDark) ?? SPACE_IDENTITY_COLORS.car} />);
    default:
      return slot(null);
  }
}

/* ---------------- illustrations ---------------- */

// Buget's default split, same words as its onboarding card.
const JAR_LEGEND: [string, string][] = [
  [`${DEFAULT_SPLIT.needs}%`, "necesități"],
  [`${DEFAULT_SPLIT.guilt_free}%`, "bani fără vină"],
  [`${DEFAULT_SPLIT.third}%`, "investiții sau credit"],
  [`${DEFAULT_SPLIT.short_term}%`, "termen scurt"],
  [`${DEFAULT_SPLIT.long_term}%`, "termen lung"],
];

function Illustration({ kind }: { kind: TourIllustration }) {
  const { colors, isDark } = useTheme();
  const hidden = { accessible: false, importantForAccessibility: "no-hide-descendants" as const, accessibilityElementsHidden: true };
  switch (kind) {
    case "ghostCards": {
      const rows: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
        { label: "De făcut", icon: "checkbox-outline" },
        { label: "Plăți recurente", icon: "repeat-outline" },
        { label: "Economii", icon: "trending-up-outline" },
      ];
      return (
        <View {...hidden} style={{ gap: 6 }}>
          {rows.map((r) => (
            <View
              key={r.label}
              style={{ height: 36, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}
            >
              <Ionicons name={r.icon} size={15} color={colors.onSurfaceTertiary} />
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{r.label}</Text>
            </View>
          ))}
        </View>
      );
    }
    case "spaceKinds":
      return (
        <View {...hidden} style={{ flexDirection: "row", gap: 8 }}>
          {KINDS.map((k) => (
            <View key={k} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: hexToRgba(SPACE_IDENTITY_COLORS[k]!, 0.16), alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={KIND_ICONS[k]} size={20} color={spaceTextColor(k, isDark) ?? SPACE_IDENTITY_COLORS[k]} />
            </View>
          ))}
        </View>
      );
    case "ring":
      return (
        <View {...hidden} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <MultiRingProgress
            size={64}
            strokeWidth={8}
            trackColor={colors.surfaceTertiary}
            segments={[
              { value: 0.22, color: SPACE_IDENTITY_COLORS.car! },
              { value: 0.14, color: SPACE_IDENTITY_COLORS.grocery! },
              { value: 0.18, color: hexToRgba(SPACE_IDENTITY_COLORS.home!, 0.45) },
            ]}
          />
          <Text style={{ flex: 1, fontSize: 13, color: colors.onSurfaceTertiary }}>Cardul „Cheltuit” de pe Acasă</Text>
        </View>
      );
    case "heatDays": {
      // A week of the Calendar grid: heat by load, a green event dot, a
      // past day with a red "restant" dot.
      const days: { n: number; level: HeatLevel; past?: boolean; event?: boolean; late?: boolean }[] = [
        { n: 6, level: 0, past: true, late: true },
        { n: 7, level: 0 },
        { n: 8, level: 1 },
        { n: 9, level: 3, event: true },
        { n: 10, level: 0 },
        { n: 11, level: 6 },
        { n: 12, level: 2 },
      ];
      const eventDot = spaceTextColor("custom", isDark) ?? CUSTOM_EVENT_COLOR;
      return (
        <View {...hidden} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {days.map((d) => (
            <View key={d.n} style={{ alignItems: "center", gap: 3 }}>
              <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: d.level ? heatColor(d.level, isDark) : colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 13, color: d.past ? colors.onSurfaceTertiary : colors.onSurface }}>{d.n}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 3, height: 5 }}>
                {d.event ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: eventDot }} /> : null}
                {d.late ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.error }} /> : null}
              </View>
            </View>
          ))}
        </View>
      );
    }
    case "swipeRow":
      // A "De rezolvat" row with the two swipe directions under it.
      return (
        <View {...hidden} style={{ gap: 6 }}>
          <View style={{ height: 44, borderRadius: 12, backgroundColor: colors.surfaceTertiary, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 }}>
            <Ionicons name="repeat" size={16} color={spaceTextColor("home", isDark) ?? SPACE_IDENTITY_COLORS.home} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.onSurface }} numberOfLines={1}>Factură curent</Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceSecondary }}>azi</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="arrow-forward" size={13} color={colors.success} />
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>rezolvă</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>șterge</Text>
              <Ionicons name="arrow-back" size={13} color={colors.error} />
            </View>
          </View>
        </View>
      );
    case "eventChip": {
      const tint = spaceTextColor("custom", isDark) ?? CUSTOM_EVENT_COLOR;
      return (
        <View {...hidden} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: CUSTOM_EVENT_COLOR, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="add" size={15} color={readableOn(CUSTOM_EVENT_COLOR)} />
            <Text style={{ fontSize: 13, fontWeight: "500", color: readableOn(CUSTOM_EVENT_COLOR) }}>Eveniment</Text>
          </View>
          <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: hexToRgba(CUSTOM_EVENT_COLOR, 0.16), flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="sparkles-outline" size={15} color={tint} />
            <Text style={{ fontSize: 13, fontWeight: "500", color: tint }}>Ziua Anei · 09:00</Text>
          </View>
        </View>
      );
    }
    case "jarBar":
      // The default 55 / 5 / 10 / 15 / 15 split, like the onboarding card.
      return (
        <View {...hidden} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 2, height: 10 }}>
            {JAR_ORDER.map((k) => (
              <View key={k} style={{ flex: DEFAULT_SPLIT[k], borderRadius: 5, backgroundColor: jarFill(k, colors, isDark), opacity: k === "needs" ? 0.85 : 1 }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 2 }}>
            {JAR_LEGEND.map(([p, t]) => (
              <Text key={t} style={{ width: "50%", fontSize: 12, color: colors.onSurfaceTertiary }}>
                <Text style={{ fontWeight: "600", color: colors.onSurface }}>{p}</Text> {t}
              </Text>
            ))}
          </View>
        </View>
      );
    case "spaceSpend": {
      // One "Cheltuit pe spații" row: spent this month + its share of the total.
      const home = SPACE_IDENTITY_COLORS.home!;
      return (
        <View {...hidden} style={{ borderRadius: 12, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: home }} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{SPACE_KIND_LABEL.home}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }}>1.240 lei</Text>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface, overflow: "hidden" }}>
            <View style={{ width: "40%", height: "100%", borderRadius: 2, backgroundColor: home }} />
          </View>
          <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>40% din ce ai cheltuit</Text>
        </View>
      );
    }
    case "carHero":
      // Mașină's top card, in small: the odometer, then two stats.
      return (
        <View {...hidden} style={{ borderRadius: 12, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          <View style={{ gap: 1 }}>
            <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>Kilometraj</Text>
            <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface }}>
              124.300 <Text style={{ fontSize: 13, fontWeight: "400", color: colors.onSurfaceTertiary }}>km</Text>
            </Text>
          </View>
          <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
            {[
              ["Luna asta", "620 lei"],
              ["Consum mediu", "6,4 l/100"],
            ].map(([k, v]) => (
              <View key={k} style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{k}</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    case "carActions": {
      const fill = SPACE_IDENTITY_COLORS.car!;
      const tint = spaceTextColor("car", isDark) ?? fill;
      return (
        <View {...hidden} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {CAR_ACTIONS.map((a) => (
            <View key={a.label} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: hexToRgba(fill, 0.16), alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={a.icon} size={18} color={tint} />
              </View>
              <Text style={{ fontSize: 11, color: colors.onSurfaceSecondary }} numberOfLines={1}>{a.label}</Text>
            </View>
          ))}
        </View>
      );
    }
    case "carNext": {
      // One "Urmează" row: a document expiring soon, its chip, the swipe.
      const fill = SPACE_IDENTITY_COLORS.car!;
      const tone = colors.warning;
      return (
        <View {...hidden} style={{ gap: 6 }}>
          <View style={{ height: 48, borderRadius: 12, backgroundColor: colors.surfaceTertiary, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: hexToRgba(fill, 0.16), alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="document-text-outline" size={14} color={spaceTextColor("car", isDark) ?? fill} />
            </View>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>RCA</Text>
            <View style={{ height: 24, paddingHorizontal: 8, borderRadius: 12, backgroundColor: hexToRgba(tone, 0.18), justifyContent: "center" }}>
              <Text style={{ fontSize: 12, fontWeight: "500", color: tone }}>în 20 de zile</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="arrow-forward" size={13} color={colors.success} />
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>reînnoiește</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>șterge</Text>
              <Ionicons name="arrow-back" size={13} color={colors.error} />
            </View>
          </View>
        </View>
      );
    }
    case "carPages":
      // The three pills under the car's name.
      return (
        <View {...hidden} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {([
            ["Documente", "document-text-outline"],
            ["Arhivă", "archive-outline"],
            ["Istoric", "time-outline"],
          ] as [string, keyof typeof Ionicons.glyphMap][]).map(([label, icon]) => (
            <View key={label} style={{ height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: colors.surfaceTertiary, flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Ionicons name={icon} size={13} color={colors.onSurfaceTertiary} />
              <Text style={{ fontSize: 12, fontWeight: "500", color: colors.onSurface }}>{label}</Text>
            </View>
          ))}
        </View>
      );
    case "spaceDots":
    default:
      return (
        <View {...hidden} style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8, columnGap: 16 }}>
          {KINDS.map((k) => (
            <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SPACE_IDENTITY_COLORS[k] }} />
              <Text style={{ fontSize: 13, color: colors.onSurfaceSecondary }}>{SPACE_KIND_LABEL[k]}</Text>
            </View>
          ))}
        </View>
      );
  }
}
