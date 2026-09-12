import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { buildCarRecentItems } from "./utils/carEntries";
import type { CarRecentItem } from "./utils/carEntries.types";
import type { CarData } from "./car.data.types";
import {
  filterRecordsByPeriod,
  formatPeriodLabel,
  periodCutoffDate,
  type CarExpensePeriod,
} from "@/lib/spaces/car/calculations/expenses.calculations";
import { isDocumentLocked } from "@/lib/spaces/car/utils/documentLock";

export type CarHistoryPageProps = {
  carData: CarData;
  onBack: () => void;
  /** Which tab to land on -- e.g. tapping "Show more" under Fuel opens
   * History already filtered to Fuel, not back on "All". */
  initialTab?: CarRecentItem["type"] | "all";
  onRecordPress?: (type: CarRecentItem["type"], id: string | number) => void;
};

const CATEGORY_TABS: { key: CarRecentItem["type"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "fuel", label: "Fuel" },
  { key: "maintenance", label: "Maintenance" },
  { key: "document", label: "Documents" },
  { key: "expense", label: "Expenses" },
];

// Identical presets to the Expenses page (see CarExpensesPage.tsx) --
// same fixed points, same order. Only Custom differs: Expenses' custom
// only goes down to months, History's also offers weeks (see the unit
// toggle in the picker below), since records land here as soon as they
// fall out of the dashboard's 7-day window and "last N weeks" is a more
// useful cut right at that boundary than "last 1 month" is.
const PERIOD_PRESETS: { label: string; period: CarExpensePeriod }[] = [
  { label: "All time", period: { kind: "all" } },
  { label: "Last 3 months", period: { kind: "months", count: 3 } },
  { label: "Last 6 months", period: { kind: "months", count: 6 } },
  { label: "Last year", period: { kind: "months", count: 12 } },
  { label: "Last 2 years", period: { kind: "years", count: 2 } },
  { label: "Last 3 years", period: { kind: "years", count: 3 } },
];

type CustomPeriodUnit = "weeks" | "months";

function periodsEqual(a: CarExpensePeriod, b: CarExpensePeriod): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "all") return true;
  return (a as { count: number }).count === (b as { count: number }).count;
}

/**
 * Every record that isn't (or can't be) on the dashboard right now, and
 * isn't exclusively Archive's either -- one tap away from the header,
 * and the destination for "Show more" on RECENT/ALL instead of
 * expanding those inline forever. That's the complement of
 * CarDashboard's 7-day RECENT/ALL, not a superset of it: a record shows
 * up HERE once it ages out of that 7-day window, OR (maintenance only)
 * gets archived -- see pastDashboardEntries below. Still inside the
 * window and not archived? It's still on the dashboard, not here yet --
 * showing it in both places would just be duplication, not "moved to
 * History". Archived maintenance stays tagged rather than hidden, since
 * it's still a real record, just no longer current -- but archived
 * DOCUMENTS don't show here at all, only in Archive (CarArchivePage),
 * to avoid that same duplication for them.
 * Defaults to "All time" (no period cutoff beyond the above); the
 * PERIOD picker below narrows that on request, same period system
 * Expenses uses.
 */
export function CarHistoryPage({ carData, onBack, initialTab = "all", onRecordPress }: CarHistoryPageProps) {
  const { colors, spacing, radius } = useTheme();
  const [activeTab, setActiveTab] = useState<CarRecentItem["type"] | "all">(initialTab);

  // "All time" by default, same as Expenses. Custom (1-12 weeks OR
  // months, picked via the unit toggle) covers anything the fixed
  // presets don't -- see selectCustom/adjustCustomCount below.
  const [period, setPeriod] = useState<CarExpensePeriod>({ kind: "all" });
  const [usingCustom, setUsingCustom] = useState(false);
  const [customUnit, setCustomUnit] = useState<CustomPeriodUnit>("months");
  const [customCount, setCustomCount] = useState(2);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);

  const selectPreset = (preset: CarExpensePeriod) => {
    setPeriod(preset);
    setUsingCustom(false);
    setPeriodPickerOpen(false);
  };

  const selectCustom = () => {
    setUsingCustom(true);
    setPeriod({ kind: customUnit, count: customCount });
  };

  const selectCustomUnit = (unit: CustomPeriodUnit) => {
    setCustomUnit(unit);
    setPeriod({ kind: unit, count: customCount });
  };

  const adjustCustomCount = (delta: number) => {
    const next = Math.min(12, Math.max(1, customCount + delta));
    setCustomCount(next);
    setPeriod({ kind: customUnit, count: next });
  };

  const allEntries = useMemo(
    () =>
      buildCarRecentItems({
        fuelEntries: carData.fuelEntries,
        maintenanceEntries: carData.maintenanceEntries,
        documentEntries: carData.documentEntries,
        expenseEntries: carData.expenseEntries,
      }),
    [carData],
  );

  // History is the complement of the dashboard, not a superset of it --
  // a record belongs here once it's either archived (never shown on the
  // dashboard at all, any age) or has aged out of its 7-day window (see
  // CarDashboard.tsx). Anything still inside that window is still on the
  // dashboard; showing it here too would mean every record lives in both
  // places until a week passes, which isn't "moved to History", it's
  // just duplicated. This is the same cutoff the dashboard filters
  // *in* with -- History filters everything *before* it out.
  //
  // Archived DOCUMENTS are the one exception: those live exclusively in
  // Archive now (CarArchivePage), not here too -- an archived document
  // showing up in both places is exactly the duplication above, just
  // for the archived case instead of the date-window case. Archived
  // maintenance keeps showing here (tagged), same as always -- only
  // Documents got this split (see documentLock.ts/CarDocumentForm's
  // readOnly mode, both document-only for the same reason).
  const pastDashboardEntries = useMemo(() => {
    const cutoff = periodCutoffDate({ kind: "weeks", count: 1 })!;

    return allEntries.filter((e) => {
      if (e.type === "document" && e.archived) return false;
      return e.archived || new Date(e.date).getTime() < cutoff.getTime();
    });
  }, [allEntries]);

  const items = useMemo(() => {
    const filtered =
      activeTab === "all" ? pastDashboardEntries : pastDashboardEntries.filter((e) => e.type === activeTab);
    const inPeriod = filterRecordsByPeriod(filtered, period);
    return [...inPeriod].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [pastDashboardEntries, activeTab, period]);

  return (
    <ScrollView
      testID="car-history-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 150 }}
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
          testID="history-back"
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
          History
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
              testID={`history-tab-${tab.key}`}
              onPress={() => setActiveTab(tab.key)}
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

      {/* PERIOD -- identical picker to the Expenses page (same presets,
          same trigger/modal), except Custom also offers a Weeks unit,
          not just Months. Filters the list only; "All time" (the
          default) is what makes this History and not just another
          capped view. */}
      <Pressable
        testID="history-period-trigger"
        onPress={() => setPeriodPickerOpen(true)}
        accessibilityRole="button"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surfaceSecondary,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          marginBottom: spacing.xl,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }}>Period</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>
            {formatPeriodLabel(period)}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.onSurfaceTertiary} />
        </View>
      </Pressable>

      {/* PERIOD PICKER */}
      <Modal
        visible={periodPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPeriodPickerOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => setPeriodPickerOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          />

          <View
            style={{
              backgroundColor: colors.surface,
              padding: spacing.xl,
              gap: spacing.xs ?? 4,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm }}>
              Period
            </Text>

            {PERIOD_PRESETS.map((preset) => {
              const isActive = !usingCustom && periodsEqual(period, preset.period);

              return (
                <Pressable
                  key={preset.label}
                  testID={`history-period-option-${preset.label}`}
                  onPress={() => selectPreset(preset.period)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: spacing.md,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: isActive ? "700" : "500", color: colors.onSurface }}>
                    {preset.label}
                  </Text>
                  {isActive ? <Ionicons name="checkmark" size={18} color={colors.onSurface} /> : null}
                </Pressable>
              );
            })}

            <Pressable
              testID="history-period-option-custom"
              onPress={selectCustom}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: spacing.md,
                borderBottomWidth: usingCustom ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: usingCustom ? "700" : "500", color: colors.onSurface }}>
                Custom
              </Text>
              {usingCustom ? <Ionicons name="checkmark" size={18} color={colors.onSurface} /> : null}
            </Pressable>

            {usingCustom ? (
              <>
                {/* UNIT -- Weeks vs Months, the one thing History's custom
                    adds over Expenses' (months-only). Switching resets the
                    stepper's meaning, not its count. */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: spacing.sm,
                    justifyContent: "center",
                    paddingTop: spacing.sm,
                  }}
                >
                  {(["weeks", "months"] as CustomPeriodUnit[]).map((unit) => {
                    const isActive = customUnit === unit;

                    return (
                      <Pressable
                        key={unit}
                        testID={`history-period-custom-unit-${unit}`}
                        onPress={() => selectCustomUnit(unit)}
                        style={{
                          paddingHorizontal: spacing.md,
                          minHeight: 30,
                          borderRadius: radius.pill,
                          backgroundColor: isActive ? colors.onSurface : colors.surfaceSecondary,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: isActive ? colors.surface : colors.onSurface,
                            textTransform: "capitalize",
                          }}
                        >
                          {unit}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: spacing.lg,
                    paddingVertical: spacing.md,
                  }}
                >
                  <Pressable
                    testID="history-period-custom-minus"
                    onPress={() => adjustCustomCount(-1)}
                    disabled={customCount <= 1}
                    hitSlop={8}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.pill,
                      backgroundColor: colors.surfaceSecondary,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: customCount <= 1 ? 0.4 : 1,
                    }}
                  >
                    <Ionicons name="remove" size={18} color={colors.onSurface} />
                  </Pressable>

                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: colors.onSurface,
                      minWidth: 110,
                      textAlign: "center",
                    }}
                  >
                    Last {customCount} {customUnit === "weeks" ? (customCount === 1 ? "week" : "weeks") : customCount === 1 ? "month" : "months"}
                  </Text>

                  <Pressable
                    testID="history-period-custom-plus"
                    onPress={() => adjustCustomCount(1)}
                    disabled={customCount >= 12}
                    hitSlop={8}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.pill,
                      backgroundColor: colors.surfaceSecondary,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: customCount >= 12 ? 0.4 : 1,
                    }}
                  >
                    <Ionicons name="add" size={18} color={colors.onSurface} />
                  </Pressable>
                </View>
              </>
            ) : null}

            <Pressable
              testID="history-period-done"
              onPress={() => setPeriodPickerOpen(false)}
              style={{
                marginTop: spacing.md,
                minHeight: 48,
                borderRadius: radius.md,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.surface }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* LIST */}
      {items.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: spacing["3xl"] ?? 48, gap: spacing.sm }}>
          <Ionicons name="time-outline" size={28} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center" }}>
            {activeTab === "all"
              ? `Nothing recorded${period.kind === "all" ? " yet" : ` in ${formatPeriodLabel(period).toLowerCase()}`}.`
              : `No ${CATEGORY_TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} recorded${period.kind === "all" ? " yet" : ` in ${formatPeriodLabel(period).toLowerCase()}`}.`}
          </Text>
          {period.kind !== "all" ? (
            <Pressable testID="history-period-reset" onPress={() => selectPreset({ kind: "all" })} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }}>Reset period</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden" }}>
          {items.map((item, index) => {
            // Documents only -- locked (read-only) once archived or
            // older than the dashboard's 7-day window. Still tappable:
            // CarDocumentForm opens read-only instead of edit mode (see
            // CarDashboard.tsx's openEntryForEdit), this just previews
            // that with a lock instead of a chevron.
            const locked = item.type === "document" && isDocumentLocked(item);

            return (
            <Pressable
              key={`${item.type}-${item.id}`}
              testID={`history-record-${item.type}-${item.id}`}
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
                  opacity: item.archived ? 0.5 : 1,
                }}
              >
                <Ionicons name={item.icon} size={17} color={colors.onSurface} />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: item.archived ? colors.onSurfaceTertiary : colors.onSurface,
                    }}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>

                  {item.archived ? (
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: radius.pill ?? 999,
                        backgroundColor: colors.surfaceTertiary,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                        ARCHIVED
                      </Text>
                    </View>
                  ) : null}
                </View>

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
  );
}
