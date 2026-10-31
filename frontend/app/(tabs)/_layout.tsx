import { Tabs, useSegments } from "expo-router";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { TabSwipeEdges } from "@/components/navigation/TabSwipeEdges";
import { MainTabBar } from "@/components/navigation/MainTabBar";
import { ReturnTrailHint } from "@/components/navigation/ReturnTrailHint";
import { useAppMode } from "@/lib/appMode";
import { QuickAddHost } from "@/components/simple/QuickAddSheet";
import { EditRecordHost } from "@/components/simple/EditRecordSheet";

export { REFRESH_EVENT } from "@/lib/refresh";

/**
 * The tab navigator itself. Used to also host a shared "+" FAB (with a
 * per-space category fan, and a Quick Add sheet fallback) -- removed
 * once every Space grew its own always-visible entry points that made
 * the fan a second way to reach the same thing (Car's "QUICK ACTIONS"
 * row, Home's category grid + Tasks'/Supplies' own in-page "add" rows,
 * Grocery's Recipes button next to Invite, Expenses' always-on
 * ExpensesAddBar). See BACKLOG.md's "Done" section for the removal.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { isSimple } = useAppMode();
  // A Space screen ([id], hidden from the bar) still belongs to "Spații"
  // -- keep that tab lit there instead of no tab looking active.
  const segments = useSegments() as string[];
  const inSpace = segments[1] === "[id]";

  const icon = (outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap, forceOn = false) =>
    ({ color, size, focused }: { color: any; size: number; focused: boolean }) => (
      <Ionicons name={focused || forceOn ? filled : outline} size={size} color={forceOn ? colors.onSurface : color} />
    );
  const label = (text: string, forceOn = false) =>
    ({ focused, color }: { focused: boolean; color: any }) => (
      <Text style={{ fontSize: 11, fontWeight: focused || forceOn ? "600" : "500", color: forceOn ? colors.onSurface : color }}>{text}</Text>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Tabs
        // Revolut-style tab bar, per explicit user request -- a pill
        // slides behind the active icon and it bounces on arrival,
        // instead of the default bar's instant color swap. See
        // MainTabBar.tsx.
        tabBar={(props) => <MainTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.onSurface,
          tabBarInactiveTintColor: colors.onSurfaceTertiary,
          // One step off the page color (the redesign's layering), with
          // the hairline kept as the edge between content and chrome.
          tabBarStyle: {
            backgroundColor: colors.surfaceSecondary,
            borderTopColor: colors.border,
          },
          // "shift" (a built-in screen-content transition, separate from
          // MainTabBar's own pill animation) was tried here for a
          // smoother tab switch, but caused a real, repeatable blank/
          // black-screen bug on-device even after two targeted fixes
          // (deferring the swipe's navigate() call, then lazy:false to
          // remove the cold-mount race) -- the "shift" interpolator can
          // apparently land both the outgoing and incoming screen at
          // opacity:0 at once, showing the native surface behind them
          // through both. Reverted to the default (no animation) rather
          // than keep chasing it; the tab bar's own pill slide/bounce
          // (MainTabBar.tsx) is unrelated and unaffected -- that's a
          // separate Animated-driven overlay, not this transition.
          // A tab is lazy by default -- its screen doesn't mount at all
          // until the FIRST time you navigate to it. Kept false (mount
          // all 4 up front) even without "shift": still removes a
          // first-visit cold-mount delay, and costs little for 4 light
          // screens.
          lazy: false,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Acasă",
            tabBarLabel: label("Acasă"),
            tabBarIcon: icon("home-outline", "home"),
          }}
        />
        <Tabs.Screen
          name="spaces"
          options={{
            title: "Spații",
            tabBarLabel: label("Spații", inSpace),
            tabBarIcon: icon("grid-outline", "grid", inSpace),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Calendar",
            tabBarLabel: label("Calendar"),
            tabBarIcon: icon("calendar-outline", "calendar"),
          }}
        />
        <Tabs.Screen
          name="budget"
          options={{
            title: "Buget",
            tabBarLabel: label("Buget"),
            tabBarIcon: icon("wallet-outline", "wallet"),
          }}
        />
        {/* Search was removed (replaced by Budget above) -- deleting the
            route file is denied in this environment, so it's emptied to a
            stub (see search.tsx) and hidden from the tab bar here instead. */}
        <Tabs.Screen name="search" options={{ href: null }} />
        {/* The custom bar filters [id] itself. SDK 58 href:null would redirect this route to Home. */}
        <Tabs.Screen name="[id]" />
      </Tabs>
      <TabSwipeEdges />
      {/* Simplu mode (lib/appMode.tsx): no return trail (2 tabs, nothing
          deep), and the bar's "+" opens the quick-add sheet. */}
      {isSimple ? <QuickAddHost /> : <ReturnTrailHint />}
      {isSimple ? <EditRecordHost /> : null}
    </View>
  );
}
