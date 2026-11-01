import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, StyleSheet, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useSegments } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useTheme } from "@/lib/theme";
import { TAB_ORDER, type MainTab, isTabDeep, recordTabLeave, setTabBarHeight } from "@/lib/navigation/returnTrail";
import { useTourTarget } from "@/components/ui/tourTargets";
import { useAppMode } from "@/lib/appMode";
import { SimpleTabBar } from "./SimpleTabBar";

// A Revolut-style bottom bar, per explicit user request: a soft pill
// slides smoothly to sit behind whichever icon is active. Per a later
// request, the pill now encapsulates the WHOLE tab cell (icon + label)
// as a rounded square instead of a small circle behind just the icon,
// and the move between tabs is "acvatic" -- it stretches/squashes like
// a water drop being dragged, then relaxes back into a square once it
// settles, instead of a plain straight-line slide. Built on the
// classic React Native `Animated` API (Animated.spring/.timing), not
// react-native-reanimated's Gesture/worklet system -- confirmed broken
// in this project's Expo Go install (see SwipeBackView.tsx), so every
// animation in this app that must actually run on-device uses this one
// instead.
const PILL_MARGIN_H = 6;
// Tall enough to reach past the label's own bottom edge -- per explicit
// user request/screenshot, the pill was stopping short of the icon+
// label content zone, leaving a visible gap underneath it.
const PILL_HEIGHT = 62;
// How far the pill elongates/squashes mid-travel -- tuned by eye, not
// a measured physical constant.
const STRETCH_SCALE_X = 1.3;
const SQUASH_SCALE_Y = 0.84;

export type MainTabBarProps = BottomTabBarProps;

// Only these 4 ever show a button -- "search" and "[id]" are hidden
// from the bar (href: null in _layout.tsx) but still exist as routes.
const VISIBLE_NAMES = ["home", "spaces", "calendar", "budget"];

/** Simplu mode (lib/appMode.tsx) gets its own 3-cell bar; the full app's
 * bar below is untouched. */
export function MainTabBar(props: MainTabBarProps) {
  const { isSimple } = useAppMode();
  return isSimple ? <SimpleTabBar {...props} /> : <FullTabBar {...props} />;
}

function FullTabBar({ state, descriptors, emitter, navigateToTab }: MainTabBarProps) {
  const { radius, colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Same "Spații stays lit while inside a Space" rule as _layout.tsx's
  // own icon()/label() closures (forceOn) -- state.index actually points
  // at the hidden "[id]" route while in a Space, not at "spaces", so the
  // pill needs this same override to land in the right place.
  const segments = useSegments() as string[];
  const inSpace = segments[1] === "[id]";
  const pathname = usePathname();

  const routes = state.routes.filter((r) => VISIBLE_NAMES.includes(r.name));
  const focusedName = inSpace ? "spaces" : state.routes[state.index]?.name;
  const activeIndex = Math.max(0, routes.findIndex((r) => r.name === focusedName));

  const [cellWidth, setCellWidth] = useState(0);
  const pillX = useRef(new Animated.Value(0)).current;
  // 0 = resting square, 1 = fully stretched/squashed mid-travel.
  const stretch = useRef(new Animated.Value(0)).current;
  const scales = useRef(routes.map(() => new Animated.Value(1))).current;
  const lastAnimatedIndex = useRef(activeIndex);

  useEffect(() => {
    if (!cellWidth) return;
    const target = activeIndex * cellWidth + PILL_MARGIN_H;

    Animated.spring(pillX, {
      toValue: target,
      useNativeDriver: true,
      damping: 14,
      stiffness: 160,
      mass: 0.7,
    }).start();

    if (lastAnimatedIndex.current !== activeIndex) {
      lastAnimatedIndex.current = activeIndex;

      // Quick stretch out, then a springy settle back to 1 -- the
      // "water drop" feel, independent of the position spring above
      // (they run in parallel, not chained).
      stretch.setValue(0);
      Animated.sequence([
        Animated.timing(stretch, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(stretch, {
          toValue: 0,
          useNativeDriver: true,
          damping: 10,
          stiffness: 120,
          mass: 0.6,
        }),
      ]).start();

      const scale = scales[activeIndex];
      if (scale) {
        scale.setValue(1);
        Animated.sequence([
          Animated.spring(scale, { toValue: 1.15, useNativeDriver: true, speed: 30, bounciness: 10 }),
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
        ]).start();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, cellWidth]);

  const pillWidth = cellWidth > 0 ? cellWidth - PILL_MARGIN_H * 2 : 0;
  const pillScaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, STRETCH_SCALE_X] });
  const pillScaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, SQUASH_SCALE_Y] });

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surfaceSecondary,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        paddingTop: 10,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
      }}
      onLayout={(e) => {
        setCellWidth(e.nativeEvent.layout.width / routes.length);
        setTabBarHeight(e.nativeEvent.layout.height);
      }}
    >
      {cellWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 2,
            width: pillWidth,
            height: PILL_HEIGHT,
            borderRadius: radius.card,
            backgroundColor: colors.surfaceTertiary,
            // translateX first, then scale -- the stretch/squash applies
            // around the pill's OWN (already-moved) center, not its
            // starting position.
            transform: [{ translateX: pillX }, { scaleX: pillScaleX }, { scaleY: pillScaleY }],
          }}
        />
      ) : null}

      {routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        const focused = index === activeIndex;
        const color = focused ? colors.onSurface : colors.onSurfaceTertiary;

        const onPress = () => {
          const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          // Inside a Space the Spații cell counts as focused (pill rule
          // above), but the real route is "[id]" -- a tap there must still
          // take the user to the Spații list (tab bar actions win).
          const leaveSpace = inSpace && route.name === "spaces";
          if ((!focused || leaveSpace) && !event.defaultPrevented) {
            if (!focused && focusedName && (TAB_ORDER as readonly string[]).includes(focusedName)) {
              // Return trail (lib/navigation/returnTrail.ts): remember a
              // deep origin -- a Buget sub-page, or being inside a Space.
              const origin = focusedName as MainTab;
              recordTabLeave(origin, pathname, route.name as MainTab, origin === "spaces" ? inSpace : isTabDeep(origin));
            }
            navigateToTab(route.key);
          }
        };

        return (
          <TabCell
            key={route.key}
            name={route.name}
            onPress={onPress}
            focused={focused}
          >
            <Animated.View
              style={{
                width: 44,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
                transform: [{ scale: scales[index] }],
              }}
            >
              {descriptor.options.tabBarIcon?.({ focused, color, size: 22 })}
            </Animated.View>
            {typeof descriptor.options.tabBarLabel === "function"
              ? descriptor.options.tabBarLabel({ focused, color, position: "below-icon", children: descriptor.options.title ?? route.name })
              : <Text style={{ fontSize: 11, fontWeight: focused ? "600" : "500", color }}>{descriptor.options.tabBarLabel ?? descriptor.options.title ?? route.name}</Text>}
          </TabCell>
        );
      })}
    </View>
  );
}

/** One tab button; registered as the tour target `tab.<route>` (lib/tours.ts). */
function TabCell({ name, onPress, focused, children }: { name: string; onPress: () => void; focused: boolean; children: React.ReactNode }) {
  const target = useTourTarget(`tab.${name}`);
  return (
    <Pressable
      {...target}
      testID={`main-tab-${name}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      style={{ flex: 1, alignItems: "center", gap: 4 }}
    >
      {children}
    </Pressable>
  );
}
