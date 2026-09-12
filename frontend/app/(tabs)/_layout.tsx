import { Tabs } from "expo-router";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  DeviceEventEmitter,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme";
import { QuickAddSheet, QuickAddSheetRef } from "@/components/quick_add/quickAdd";
import { SpaceCategoryFabProvider, useSpaceCategoryFab } from "@/lib/spaceCategoryFab";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const REFRESH_EVENT = "lifeos.refresh";

const FAB_SIZE = 56;
const ITEM_SIZE = 56;
const ITEM_ICON_SIZE = 22;
const ITEM_GAP = 12; // minimum visible gap between two neighboring circles
const FAB_BOTTOM = Platform.OS === "ios" ? 100 : 80;

/**
 * Where each category circle lands once the fan is fully open, relative to
 * the FAB's own center -- a round arc, sweeping from just past straight-up
 * to exactly straight-left.
 *
 * No labels ride along with the circles any more, so the only thing that
 * has to clear its neighbor is the circle itself -- radius is computed
 * from the item size, just large enough that consecutive circles keep a
 * small gap, never more. That keeps the whole fan noticeably tighter than
 * the labeled version needed to be.
 *
 * The sweep is capped at exactly horizontal (never past straight-left), so
 * dy is never positive -- every item stays level with or above the FAB,
 * never below it, so the arc can never reach down into the tab bar no
 * matter how many categories a space has.
 */
function getFanOffsets(count: number): { dx: number; dy: number }[] {
  if (count <= 0) return [];
  if (count === 1) return [{ dx: 0, dy: -(ITEM_SIZE + 44) }];

  const startDeg = 94; // just past straight up
  const maxSpanDeg = 86; // stops just shy of straight left
  const stepDegTarget = 28;
  const spanDeg = Math.min(stepDegTarget * (count - 1), maxSpanDeg);
  const stepDeg = spanDeg / (count - 1);
  const minChord = ITEM_SIZE + ITEM_GAP;
  const radius = minChord / (2 * Math.sin((stepDeg / 2) * (Math.PI / 180)));

  return Array.from({ length: count }, (_, i) => {
    const thetaDeg = startDeg + stepDeg * i;
    const phiRad = ((thetaDeg - 90) * Math.PI) / 180;
    return {
      dx: -radius * Math.sin(phiRad),
      dy: -radius * Math.cos(phiRad),
    };
  });
}

/**
 * The one floating "+" FAB, present on every screen -- and the category
 * fan it pops out into while a space with categories to offer (Car, Home,
 * ...) is on screen. Which categories (if any) show is decided entirely by
 * useSpaceCategoryFab's `config`, registered by the space screen itself
 * (see lib/spaceCategoryFab.tsx) -- this component never knows which route
 * it's on, only whether something has claimed the FAB right now.
 */
function TabsLayoutInner() {
  const { colors, isDark, spacing } = useTheme();
  const { config } = useSpaceCategoryFab();

  const quickAddRef = useRef<QuickAddSheetRef>(null);
  const [fanOpen, setFanOpen] = useState(false);
  const fanAnim = useRef(new Animated.Value(0)).current;

  // Whichever space the FAB is pointed at changed (or it stopped being a
  // space at all) -- a fan left open from the previous screen is stale.
  useEffect(() => {
    setFanOpen(false);
  }, [config]);

  useEffect(() => {
    Animated.spring(fanAnim, {
      toValue: fanOpen ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 80,
    }).start();
  }, [fanOpen, fanAnim]);

  const openQuickAdd = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    quickAddRef.current?.present();
  }, []);

  const onSaved = useCallback(() => {
    DeviceEventEmitter.emit(REFRESH_EVENT);
  }, []);

  const onFabPress = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (config) {
      setFanOpen((v) => !v);
    } else {
      openQuickAdd();
    }
  }, [config, openQuickAdd]);

  const onPickCategory = useCallback(
    (key: string) => {
      setFanOpen(false);
      config?.onSelect(key);
    },
    [config],
  );

  const offsets = useMemo(
    () => getFanOffsets(config?.categories.length ?? 0),
    [config?.categories.length],
  );

  const fabRotation = fanAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });
  const backdropOpacity = fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.onSurface,
          tabBarInactiveTintColor: colors.onSurfaceTertiary,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="spaces"
          options={{
            title: "Spaces",
            tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Calendar",
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen name="[id]" options={{ href: null }} />
      </Tabs>

      {/* Backdrop -- only present (and only intercepts touches) while the
          category fan is open; tapping it closes the fan without picking
          anything, same as tapping outside the old bottom sheet did. */}
      {config ? (
        <Animated.View
          pointerEvents={fanOpen ? "auto" : "none"}
          style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.5)", opacity: backdropOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setFanOpen(false)} />
        </Animated.View>
      ) : null}

      {/* Category fan -- one circle per category of whichever space is
          currently registered, launching out of the FAB's own corner.
          Icon only, no label -- a fixed white-on-black badge regardless of
          theme, so it reads the same crisp way against the dimmed
          backdrop whether the app is in light or dark mode. */}
      {config
        ? config.categories.map((category, index) => {
            const { dx, dy } = offsets[index] ?? { dx: 0, dy: 0 };
            const translateX = fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
            const translateY = fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
            const scale = fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

            return (
              <Animated.View
                key={category.key}
                pointerEvents={fanOpen ? "auto" : "none"}
                style={{
                  position: "absolute",
                  right: spacing.xl,
                  bottom: FAB_BOTTOM,
                  opacity: fanAnim,
                  transform: [{ translateX }, { translateY }, { scale }],
                }}
              >
                <Pressable
                  testID={`fab-category-${category.key}`}
                  onPress={() => onPickCategory(category.key)}
                  style={{
                    width: ITEM_SIZE,
                    height: ITEM_SIZE,
                    borderRadius: ITEM_SIZE / 2,
                    backgroundColor: "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 6,
                  }}
                >
                  <Ionicons name={category.icon} size={ITEM_ICON_SIZE} color="#000000" />
                </Pressable>
              </Animated.View>
            );
          })
        : null}

      <View pointerEvents="box-none" style={{ position: "absolute", right: spacing.xl, bottom: FAB_BOTTOM }}>
        <Pressable
          testID="quick-add-fab"
          onPress={onFabPress}
          style={({ pressed }) => ({
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            backgroundColor: colors.brandPrimary,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scale: pressed ? 0.94 : 1 }],
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.6 : 0.15,
            shadowRadius: 12,
            elevation: 8,
          })}
        >
          <Animated.View style={{ transform: [{ rotate: fabRotation }] }}>
            <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
          </Animated.View>
        </Pressable>
      </View>

      <QuickAddSheet ref={quickAddRef} onSaved={onSaved} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <SpaceCategoryFabProvider>
      <TabsLayoutInner />
    </SpaceCategoryFabProvider>
  );
}
