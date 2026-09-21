import { Tabs, useSegments } from "expo-router";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  DeviceEventEmitter,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/theme";
import { QuickAddSheet, QuickAddSheetRef } from "@/components/quick_add/quickAdd";
import { SpaceCategoryFabProvider, useSpaceCategoryFab } from "@/lib/spaceCategoryFab";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const REFRESH_EVENT = "lifeos.refresh";

const FAB_SIZE = 56;
const ITEM_SIZE = 44;
const ITEM_ICON_SIZE = 18;
const ITEM_V_GAP = 12; // vertical gap between two stacked items
const FAB_CLEARANCE = 22; // gap between the FAB's own top edge and the first item
const FAB_BOTTOM = Platform.OS === "ios" ? 100 : 80;

/**
 * Where each category item lands once the fan is fully open, relative to
 * the FAB's own anchor point -- a straight vertical stack directly above
 * it, one item per row. Replaces an earlier radial arc that kept circles
 * icon-only (no room on the arc for a label without the circles
 * colliding) -- stacking removes that constraint entirely, since each
 * row can be as wide as its label needs without touching its neighbors,
 * and it's a more familiar "speed dial" shape than a fan (Gmail, most
 * Material apps). dx stays 0 for every item; only dy (how far up the
 * stack) changes.
 */
function getFanOffsets(count: number): { dx: number; dy: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    dx: 0,
    dy: -(FAB_SIZE + FAB_CLEARANCE + i * (ITEM_SIZE + ITEM_V_GAP)),
  }));
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
  const { colors, isDark, spacing, radius } = useTheme();
  const { config } = useSpaceCategoryFab();
  // Hidden on every tab except an actual space page ([id].tsx) -- Home,
  // Spaces and Budget have no single space to quick-add into (the FAB's
  // fallback there was just the generic Quick Add sheet, a second entry
  // point nobody asked for), and Calendar creates its custom event
  // inline on the page itself (see calendar.tsx) instead. Only [id]
  // still wants it, for its per-space category fan.
  const segments = useSegments();
  const currentTab = segments[segments.length - 1];
  const fabHiddenOn = new Set(["home", "spaces", "calendar", "budget"]);
  const hideFab = fabHiddenOn.has(currentTab);

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
          name="budget"
          options={{
            title: "Budget",
            tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
          }}
        />
        {/* Search was removed (replaced by Budget above) -- deleting the
            route file is denied in this environment, so it's emptied to a
            stub (see search.tsx) and hidden from the tab bar here instead. */}
        <Tabs.Screen name="search" options={{ href: null }} />
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
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setFanOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        </Animated.View>
      ) : null}

      {/* Category fan -- one circle per category of whichever space is
          currently registered, launching out of the FAB's own corner as a
          vertical stack. Each row pairs a text label (what the icon alone
          used to leave you guessing) with its icon circle -- colors below
          follow the theme (surface/onSurface, surfaceTertiary/
          onSurfaceTertiary for the dimmed "soon" state) instead of fixed
          hex, so the fan actually flips with the rest of the app in dark
          mode instead of staying a fixed white-on-black badge. */}
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
                  accessibilityRole="button"
                  accessibilityLabel={category.badge === "soon" ? `${category.label} (coming soon)` : category.label}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  {/* Label pill -- reads right-to-left toward the icon,
                      same direction a thumb sweeps up from the FAB. Width
                      follows the text, so it never collides with a
                      neighboring row the way trying to fit a label onto
                      the old radial arc would have. */}
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: radius.pill,
                      backgroundColor: colors.surface,
                      marginRight: 10,
                      shadowColor: "#000",
                      shadowOpacity: 0.25,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 3 },
                      elevation: 5,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 13, fontWeight: "700", color: category.badge === "soon" ? colors.onSurfaceTertiary : colors.onSurface }}
                    >
                      {category.label}
                    </Text>
                  </View>

                  <View
                    style={{
                      width: ITEM_SIZE,
                      height: ITEM_SIZE,
                      borderRadius: ITEM_SIZE / 2,
                      // Dimmed fill for a "soon" category -- reads as
                      // inactive at a glance, distinct from every other
                      // (live) circle in the same fan, without needing a
                      // label to say so.
                      backgroundColor: category.badge === "soon" ? colors.surfaceTertiary : colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: "#000",
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 6,
                    }}
                  >
                    {category.iconSet === "material-community" ? (
                      <MaterialCommunityIcons
                        name={category.icon as keyof typeof MaterialCommunityIcons.glyphMap}
                        size={ITEM_ICON_SIZE}
                        color={category.badge === "soon" ? colors.onSurfaceTertiary : colors.onSurface}
                      />
                    ) : (
                      <Ionicons
                        name={category.icon as keyof typeof Ionicons.glyphMap}
                        size={ITEM_ICON_SIZE}
                        color={category.badge === "soon" ? colors.onSurfaceTertiary : colors.onSurface}
                      />
                    )}

                    {/* Small "create a new one" badge in the corner -- the
                        base icon alone (e.g. a receipt) reads as the
                        thing being created, not that this makes a new
                        one; the plus is what says "new". Border matches
                        the circle's own background so it still cuts a
                        clean ring in either theme. */}
                    {category.badge === "plus" ? (
                      <View
                        style={{
                          position: "absolute",
                          right: -2,
                          bottom: -2,
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: colors.onSurface,
                          borderWidth: 2,
                          borderColor: colors.surface,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="add" size={10} color={colors.surface} />
                      </View>
                    ) : null}

                    {/* "Not live yet" badge -- paired with the dimmed
                        circle above; pressing still fires onPickCategory
                        (the space itself decides what that means -- for a
                        "soon" category, a "coming soon" notice instead of
                        actually navigating anywhere). */}
                    {category.badge === "soon" ? (
                      <View
                        style={{
                          position: "absolute",
                          right: -2,
                          bottom: -2,
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: colors.onSurfaceTertiary,
                          borderWidth: 2,
                          borderColor: colors.surface,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="time-outline" size={10} color={colors.surface} />
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })
        : null}

      {hideFab ? null : (
        <View pointerEvents="box-none" style={{ position: "absolute", right: spacing.xl, bottom: FAB_BOTTOM }}>
          <Pressable
            testID="quick-add-fab"
            onPress={onFabPress}
            accessibilityRole="button"
            accessibilityLabel={config ? (fanOpen ? "Close menu" : `Open ${config.spaceLabel} menu`) : "Quick add"}
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
            {/* Hamburger (3-line "menu") when closed -- matches the
                sheet/fan this opens being a MENU of choices, not a
                single "add" action. Swaps to a close "X" only while the
                category fan is actually open (config + fanOpen); rotating
                a hamburger the way the old "+" rotated into an "X"
                wouldn't read as a close affordance the same way, so this
                is a hard icon swap instead of a transform. */}
            <Ionicons
              name={config && fanOpen ? "close" : "menu-outline"}
              size={26}
              color={colors.onBrandPrimary}
            />
          </Pressable>
        </View>
      )}

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
