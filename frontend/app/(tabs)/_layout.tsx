import { Tabs } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export const REFRESH_EVENT = "lifeos.refresh";

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
    </View>
  );
}
