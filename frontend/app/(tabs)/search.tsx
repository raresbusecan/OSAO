/**
 * @deprecated Search was removed from the app (replaced by the Budget tab
 * -- see app/(tabs)/budget.tsx). File deletion is denied in this
 * environment, so this is emptied down to a stub and kept out of the tab
 * bar via `<Tabs.Screen name="search" options={{ href: null }} />` in
 * app/(tabs)/_layout.tsx, the same mechanism already used to hide `[id]`
 * from the tab bar. Do not route here.
 */
export default function SearchScreen() {
  return null;
}
