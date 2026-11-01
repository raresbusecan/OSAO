import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { motion } from "@/lib/motion";
import { setTabBarHeight } from "@/lib/navigation/returnTrail";
import { openQuickAdd, useSimpleSheets } from "@/lib/simpleSheets";
import { PressableScale } from "@/components/ui/PressableScale";
import type { MainTabBarProps } from "./MainTabBar";

/**
 * orgOS Simplu's tab bar (lib/appMode.tsx): Acasă · (+) · Calendar. The
 * "+" opens the quick-add sheet (components/simple/QuickAddSheet.tsx);
 * inside a space it takes that space's fill and preselects it (the
 * accent the Simplu space screen publishes via lib/simpleSheets).
 * Spații / Buget routes still exist, they just have no button here. A
 * space screen ([id]) is reached from Acasă's chips, so Acasă stays lit
 * there. No return trail in this mode (two tabs, nothing deep).
 */
export function SimpleTabBar({ state, emitter, navigateToTab }: MainTabBarProps) {
  const { spacing, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const inSpace = segments[1] === "[id]";
  const { spaceAccent } = useSimpleSheets();

  const current = state.routes[state.index]?.name;
  const focusedName = inSpace ? "home" : current;
  const accent = inSpace ? spaceAccent : null;

  const go = (name: "home" | "calendar") => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    // From a space screen, "Acasă" still navigates (the lit cell is a hint, not the route).
    if ((current !== name || inSpace) && !event.defaultPrevented) navigateToTab(route.key);
  };

  const cell = (name: "home" | "calendar", label: string, outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) => {
    const focused = focusedName === name;
    const color = focused ? colors.onSurface : colors.onSurfaceTertiary;
    return (
      <Pressable
        testID={`main-tab-${name}`}
        onPress={() => go(name)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        style={{ flex: 1, alignItems: "center", gap: 3, minHeight: 44, paddingTop: 2 }}
      >
        <Ionicons name={focused ? filled : outline} size={23} color={color} />
        <Text style={{ fontSize: 11, fontWeight: focused ? "600" : "500", color }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      testID="simple-tab-bar"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: colors.surfaceSecondary,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        paddingTop: spacing.sm,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
      }}
      onLayout={(e) => setTabBarHeight(e.nativeEvent.layout.height)}
    >
      {cell("home", "Acasă", "home-outline", "home")}
      <View style={{ flex: 1, alignItems: "center" }}>
        <PressableScale
          testID="simple-tab-add"
          onPress={() => openQuickAdd(accent?.spaceId ?? null)}
          scaleTo={motion.scale.control}
          accessibilityRole="button"
          accessibilityLabel={accent ? `Adaugă la ${accent.name}` : "Adaugă"}
          style={{
            width: 52,
            height: 52,
            marginTop: -4,
            borderRadius: 26,
            backgroundColor: accent?.fill ?? colors.onSurface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={28} color={accent?.ink ?? colors.surface} />
        </PressableScale>
      </View>
      {cell("calendar", "Calendar", "calendar-outline", "calendar")}
    </View>
  );
}
