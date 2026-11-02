import React, { useEffect, useRef, useState } from "react";
import { Animated, BackHandler, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";
import { SHEET_BACKDROP } from "@/components/ui/Sheet";
import { closeHoldMenu, getHoldState, subscribeHold, type HoldAction, type HoldMenuRequest } from "@/lib/holdMenu";
import { menuPlacement } from "@/lib/holdGeometry";

const ROW_H = 48;
const HINT_H = 36;
const MENU_W = 248;
const LIFT = 1.03;
const LIFT_SHADOW = "0 16px 36px rgba(5,7,10,0.28)";

/**
 * Draws lib/holdMenu.ts's state over the whole app (mounted once in
 * app/_layout.tsx, after the screens): the menu of a held item -- the
 * page dimmed, a lifted copy of the item, the actions under it (variant A,
 * picked 2026-11-02) -- or the copy that follows the finger while an item
 * is dragged. Renders nothing otherwise.
 */
export function HoldMenuHost() {
  const [hold, setHold] = useState(getHoldState());
  useEffect(() => subscribeHold(setHold), []);

  if (!hold.menu && !hold.ghost) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 900 }}>
      {hold.ghost ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: hold.ghost.rect.x,
            top: hold.ghost.rect.y,
            width: hold.ghost.rect.width,
            height: hold.ghost.rect.height,
            opacity: 0.96,
            boxShadow: LIFT_SHADOW,
            transform: [{ translateX: hold.ghost.offset.x }, { translateY: hold.ghost.offset.y }, { scale: LIFT }],
          }}
        >
          {hold.ghost.preview}
        </Animated.View>
      ) : null}
      {hold.menu ? <Menu key={hold.menu.anchor.y + ":" + hold.menu.anchor.x} menu={hold.menu} /> : null}
    </View>
  );
}

function Menu({ menu }: { menu: HoldMenuRequest }) {
  const { colors, spacing, radius } = useTheme();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const appear = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (!reduced) Animated.timing(appear, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }, [appear, reduced]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeHoldMenu();
      return true;
    });
    return () => sub.remove();
  }, []);

  const menuW = Math.min(MENU_W, width - 32);
  const menuH = menu.actions.length * ROW_H + (menu.hint ? HINT_H : 0);
  const place = menuPlacement(menu.anchor, { width: menuW, height: menuH }, { width, height, top: insets.top, bottom: insets.bottom });

  // The action runs once the menu is gone, so whatever it opens (a Sheet,
  // a confirm) isn't drawn under it.
  const run = (a: HoldAction) => {
    closeHoldMenu();
    a.onPress();
  };

  return (
    <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
      <Animated.View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: SHEET_BACKDROP, opacity: appear }}>
        <Pressable testID="hold-menu-backdrop" style={{ flex: 1 }} onPress={closeHoldMenu} accessibilityRole="button" accessibilityLabel="Închide meniul" />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: menu.anchor.x,
          top: menu.anchor.y,
          width: menu.anchor.width,
          height: menu.anchor.height,
          boxShadow: LIFT_SHADOW,
          borderRadius: radius.card,
          transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [1, LIFT] }) }],
        }}
      >
        {menu.preview}
      </Animated.View>
      <Animated.View
        testID="hold-menu"
        accessibilityViewIsModal
        style={{
          position: "absolute",
          left: place.left,
          top: place.top,
          width: menuW,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSecondary,
          boxShadow: LIFT_SHADOW,
          overflow: "hidden",
          opacity: appear,
          transform: [
            { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [place.side === "above" ? 6 : -6, 0] }) },
            { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        }}
      >
        {menu.actions.map((a, i) => {
          const tone = a.destructive ? colors.error : colors.onSurface;
          return (
            <Pressable
              key={a.key}
              testID={`hold-menu-${a.key}`}
              onPress={() => run(a)}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ pressed }) => ({
                height: ROW_H,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
                backgroundColor: pressed ? colors.surfaceTertiary : "transparent",
              })}
            >
              <Text style={{ flex: 1, fontSize: 15, color: tone }} numberOfLines={1}>{a.label}</Text>
              <Ionicons name={a.icon} size={18} color={a.destructive ? colors.error : colors.onSurfaceTertiary} />
            </Pressable>
          );
        })}
        {menu.hint ? (
          <View style={{ height: HINT_H, justifyContent: "center", paddingHorizontal: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }} numberOfLines={1}>{menu.hint}</Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}
