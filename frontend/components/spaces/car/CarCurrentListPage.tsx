import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { buildCarRecentItems } from "./utils/carEntries";
import type { CarRecentItem } from "./utils/carEntries.types";
import type { CarData } from "./car.data.types";
import { filterRecordsByPeriod } from "@/lib/spaces/car/calculations/expenses.calculations";
import { getCurrentOdometer } from "@/lib/spaces/car/calculations/dashboard.calculations";
import { isDocumentLocked } from "@/lib/spaces/car/utils/documentLock";

// Same mapping as CarDashboard.tsx's statusDotColor / CarHistoryPage.tsx's
// statusDotColor -- "safe" (not yet inside the alert window) is
// success/green, the other 3 mirror DUE SOON's own tiers.
function statusDotColor(status: "safe" | "light" | "medium" | "critical", colors: any) {
  if (status === "safe") return colors.success;
  if (status === "critical") return colors.error;
  if (status === "medium") return colors.warning;
  return colors.caution;
}

// No "Documents" tab -- see the allEntries comment below.
const CATEGORY_TABS: { key: CarRecentItem["type"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "fuel", label: "Fuel" },
  { key: "maintenance", label: "Maintenance" },
  { key: "expense", label: "Expenses" },
];

export type CarCurrentListPageProps = {
  carData: CarData;
  /** Which tab to land on -- e.g. "See all" from ALL's Fuel view opens
   * here already on Fuel, not back on "All". The tabs below still let
   * you switch categories without leaving the page. */
  initialTab?: CarRecentItem["type"] | "all";
  onBack: () => void;
  onRecordPress?: (type: CarRecentItem["type"], id: string | number) => void;
};

/**
 * "See all" from RECENT/ALL opens here, not History -- fixed to the
 * dashboard's own last-7-days window (no period picker: past that, a
 * record has already moved on to History, so a period filter here would
 * just be a confusing way to show nothing), and never archived (that's
 * History's job too, with its own toggle). Only the category tabs are
 * this page's own -- everything else about "what counts as current" is
 * identical to what RECENT/ALL already decided.
 */
export function CarCurrentListPage({
  carData,
  initialTab = "all",
  onBack,
  onRecordPress,
}: CarCurrentListPageProps) {
  const { colors, spacing, radius } = useTheme();
  const [activeTab, setActiveTab] = useState<CarRecentItem["type"] | "all">(initialTab);

  const currentOdometer = useMemo(() => getCurrentOdometer(carData), [carData]);

  // Documents don't feed into this "current" feed at all -- they live
  // permanently in CarDocsPage instead of aging in/out of the
  // dashboard's 7-day window, same reasoning as CarDashboard.tsx's
  // allEntries.
  const allEntries = useMemo(
    () =>
      buildCarRecentItems({
        fuelEntries: carData.fuelEntries,
        maintenanceEntries: carData.maintenanceEntries,
        documentEntries: [],
        expenseEntries: carData.expenseEntries,
        currentOdometer,
      }),
    [carData, currentOdometer],
  );

  // Archived never shows here (that's History's job) and neither does
  // anything older than the dashboard's own 7-day window -- same cutoff
  // RECENT/ALL already use, just uncapped at 5 and one flat list instead
  // of split into "today" vs. "the rest of the week".
  const activeEntries = useMemo(() => {
    const withinWeek = filterRecordsByPeriod(allEntries, { kind: "weeks", count: 1 });
    return withinWeek.filter((e) => !e.archived);
  }, [allEntries]);

  const items = useMemo(() => {
    const filtered =
      activeTab === "all" ? activeEntries : activeEntries.filter((e) => e.type === activeTab);
    return [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeEntries, activeTab]);

  return (
    <SwipeBackView onBack={onBack}>
    <ScrollView
      testID="car-current-list-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        paddingBottom: 150,
      }}
    >
      {/* HEADER */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
        }}
      >
        <Pressable
          testID="current-list-back"
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSecondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 }}>
          Active
        </Text>
      </View>

      {/* TABS */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.xl }}
      >
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <Pressable
              key={tab.key}
              testID={`current-list-tab-${tab.key}`}
              onPress={() => setActiveTab(tab.key)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              style={{
                paddingHorizontal: spacing.md,
                minHeight: 34,
                borderRadius: radius.pill,
                backgroundColor: isActive ? colors.onSurface : colors.surfaceSecondary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: isActive ? colors.surface : colors.onSurface }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* LIST */}
      {items.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: spacing["3xl"] ?? 48, gap: spacing.sm }}>
          <Ionicons name="file-tray-outline" size={28} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center" }}>
            {activeTab === "all"
              ? "Nothing in the last 7 days."
              : `No ${CATEGORY_TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} in the last 7 days.`}
          </Text>
        </View>
      ) : (
        <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden" }}>
          {items.map((item, index) => {
            // Documents only -- locked (read-only) once older than the
            // dashboard's 7-day window. In practice this never actually
            // triggers here (everything on this page is already inside
            // that same window) -- kept for parity with History/the
            // dashboard's own row behavior in case that ever changes.
            const locked = item.type === "document" && isDocumentLocked(item);

            return (
              <Pressable
                key={`${item.type}-${item.id}`}
                testID={`current-list-record-${item.type}-${item.id}`}
                onPress={() => onRecordPress?.(item.type, item.id)}
                disabled={!onRecordPress}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  gap: spacing.md,
                  borderBottomWidth: index === items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceTertiary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={item.icon} size={17} color={colors.onSurface} />

                  {item.statusDot && item.overdue ? (
                    <View
                      style={{
                        position: "absolute",
                        right: -4,
                        bottom: -4,
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: statusDotColor(item.statusDot, colors),
                        borderWidth: 1.5,
                        borderColor: colors.surfaceTertiary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 9.5, fontWeight: "900", color: colors.surface, lineHeight: 11 }}>
                        !
                      </Text>
                    </View>
                  ) : item.statusDot ? (
                    <View
                      style={{
                        position: "absolute",
                        right: -2,
                        bottom: -2,
                        width: 9,
                        height: 9,
                        borderRadius: 4.5,
                        backgroundColor: statusDotColor(item.statusDot, colors),
                        borderWidth: 1.5,
                        borderColor: colors.surfaceTertiary,
                      }}
                    />
                  ) : null}
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>

                  <Text style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>

                {item.amount ? (
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>{item.amount}</Text>
                ) : null}

                {onRecordPress ? (
                  <Ionicons
                    name={locked ? "lock-closed-outline" : "chevron-forward"}
                    size={16}
                    color={colors.onSurfaceTertiary}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
    </SwipeBackView>
  );
}
