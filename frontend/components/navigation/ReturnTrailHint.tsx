import React, { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";
import {
  TAB_LABELS,
  TAB_ORDER,
  TRAIL_TTL_MS,
  type MainTab,
  type ReturnTrail,
  clearTrail,
  markTrailReturn,
  getTrail,
  isTrailValid,
  trailDirection,
  trailFor,
  useReturnTrail,
  useTabBarHeight,
} from "@/lib/navigation/returnTrail";

/**
 * The discoverable half of the return trail (lib/navigation/returnTrail.ts):
 * a small tappable pill just above the tab bar, on the side whose edge
 * swipe returns ("Înapoi la Buget"). Tapping it = that swipe. Shown only
 * on a tab root where TabSwipeEdges is active (not inside a Space -- the
 * left edge there is SwipeBackView's), fades out when the 60 s run out.
 * Plain RN Animated, not reanimated (broken in this Expo Go install).
 *
 * Also owns the "origin reached" rule: arriving back on the origin tab by
 * any route (tab tap, normal swipe) drops the trail.
 */
export function ReturnTrailHint() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const segments = useSegments() as string[];
  const seg = segments[1];
  const atTabRoot = (TAB_ORDER as readonly string[]).includes(seg);
  const areaTab: MainTab | null = seg === "[id]" ? "spaces" : atTabRoot ? (seg as MainTab) : null;

  const trail = useReturnTrail();
  const tabBarHeight = useTabBarHeight();
  // Validity is computed from reactive values only (the trail + this
  // clock state), never by reading the module store during render -- the
  // React Compiler would memoize such a read on `seg` alone. The clock is
  // refreshed on the expiry timer, on route/trail changes, and when the
  // app returns to the foreground (timers don't run in the background).
  const [now, setNow] = useState(() => Date.now());
  const tick = () => setNow(Date.now());
  useEffect(() => {
    setNow(Date.now());
  }, [seg, trail]);

  useEffect(() => {
    const t = getTrail();
    if (t && areaTab === t.originTab) clearTrail();
  }, [areaTab]);

  const active = atTabRoot && isTrailValid(trail, now) && trail.landingTab === seg ? trail : null;

  useEffect(() => {
    if (!active) return;
    const left = Math.max(0, active.leftAt + TRAIL_TTL_MS - Date.now()) + 50;
    const timer = setTimeout(tick, left);
    return () => clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => sub.remove();
  }, []);

  // Keep the last trail on screen while it fades out.
  const [shown, setShown] = useState<{ trail: ReturnTrail; tab: MainTab } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Re-checked against the real clock here: `now` can be a few frames
    // stale on the render that lands on a tab, and an expired trail must
    // never flash the pill.
    const live = active && isTrailValid(active) ? active : null;
    if (live) {
      setShown({ trail: live, tab: seg as MainTab });
      if (reduced) opacity.setValue(1);
      else Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    } else if (shown) {
      if (reduced) {
        opacity.setValue(0);
        setShown(null);
      } else {
        Animated.timing(opacity, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
          if (finished) setShown(null);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, seg]);

  if (!shown || !tabBarHeight) return null;

  const dir = trailDirection(shown.trail, shown.tab);
  const target = shown.trail.originTab === "spaces" ? "spațiu" : TAB_LABELS[shown.trail.originTab];
  const label = `Înapoi la ${target}`;
  const edge = dir === 1 ? "dreapta" : "stânga";

  const onPress = () => {
    const t = trailFor(seg as MainTab);
    if (!t) return;
    clearTrail();
    markTrailReturn(t.originHref);
    router.navigate(t.originHref as any);
  };

  return (
    <Animated.View
      pointerEvents={active ? "box-none" : "none"}
      style={{
        position: "absolute",
        bottom: tabBarHeight + spacing.sm,
        [dir === 1 ? "right" : "left"]: spacing.xl,
        opacity,
      }}
    >
      <Pressable
        testID="return-trail-hint"
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={`Te duce unde erai. Poți și glisa de la marginea din ${edge}.`}
        hitSlop={6}
        style={({ pressed }) => ({
          height: 34,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          backgroundColor: pressed ? colors.surfaceTertiary : colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: dir === 1 ? "row" : "row-reverse",
          alignItems: "center",
          gap: 6,
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>
          {label}
        </Text>
        <View>
          <Ionicons name={dir === 1 ? "chevron-forward" : "chevron-back"} size={14} color={colors.onSurfaceTertiary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
