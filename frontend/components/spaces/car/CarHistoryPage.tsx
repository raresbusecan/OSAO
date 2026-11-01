import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { TopBar, Identity, Segmented, SectionHeader, Group, EmptyState } from "@/components/ui/primitives";
import { capitalize, roCount } from "@/lib/format";
import { RecentRow } from "./CarRecentRow";
import { CAR_PERIOD_PRESETS } from "./CarPeriodSheet";
import { PeriodPicker } from "@/components/ui/PeriodPicker";
import { buildCarRecentItems } from "./utils/carEntries";
import type { CarRecentItem } from "./utils/carEntries.types";
import type { CarData } from "./car.data.types";
import {
  filterRecordsByPeriod,
  periodCutoffDate,
  type CarExpensePeriod,
} from "@/lib/spaces/car/calculations/expenses.calculations";
import { getCurrentOdometer } from "@/lib/spaces/car/calculations/dashboard.calculations";

// Same mapping as CarDashboard.tsx's statusDotColor -- "safe" (not yet
// inside the alert window) is success/green, the other 3 mirror DUE
// SOON's own tiers. See CarRecentItem.statusDot.
export type CarHistoryPageProps = {
  carData: CarData;
  onBack: () => void;
  /** Which tab to land on -- e.g. tapping "Show more" under Fuel opens
   * History already filtered to Fuel, not back on "All". */
  initialTab?: CarRecentItem["type"] | "all";
  onRecordPress?: (type: CarRecentItem["type"], id: string | number) => void;
  /** Swipe-left delete for a logged entry (never a document). */
  onRecordDelete?: (item: CarRecentItem) => void;
};

// No "Documents" tab -- see allEntries below, documents never reach
// this page's feed at all any more.
const CATEGORY_TABS: { key: CarRecentItem["type"] | "all"; label: string }[] = [
  { key: "all", label: "Toate" },
  { key: "fuel", label: "Alimentări" },
  { key: "maintenance", label: "Service" },
  { key: "expense", label: "Cheltuieli" },
];

// Identical presets to the Expenses page (see CarExpensesPage.tsx) --
// same fixed points, same order. Only Custom differs: Expenses' custom
// only goes down to months, History's also offers weeks (see the unit
// toggle in the picker below), since records land here as soon as they
// fall out of the dashboard's 7-day window and "last N weeks" is a more
// useful cut right at that boundary than "last 1 month" is.
/**
 * Every Fuel/Maintenance/Expense record that isn't (or can't be) on the
 * dashboard right now -- one tap away from the header, and the
 * destination for "Show more" on RECENT/ALL instead of expanding those
 * inline forever. That's the complement of CarDashboard's 7-day
 * RECENT/ALL, not a superset of it: a record shows up HERE once it ages
 * out of that 7-day window, OR (maintenance only) gets archived -- see
 * pastDashboardEntries below. Still inside the window and not archived?
 * It's still on the dashboard, not here yet -- showing it in both
 * places would just be duplication, not "moved to History". Archived
 * maintenance stays tagged rather than hidden, since it's still a real
 * record, just no longer current.
 *
 * Documents don't appear here at all, in any state -- they never flow
 * through the dashboard's 7-day window to begin with (see
 * CarDashboard.tsx's allEntries), so there's no "aged out" state for
 * them to land in History with. Current documents live permanently in
 * CarDocsPage; archived ones live exclusively in Archive
 * (CarArchivePage).
 * Defaults to "All time" (no period cutoff beyond the above); the
 * PERIOD picker below narrows that on request, same period system
 * Expenses uses.
 */
export function CarHistoryPage({ carData, onBack, initialTab = "all", onRecordPress, onRecordDelete }: CarHistoryPageProps) {
  const { colors, spacing } = useTheme();
  const carColors = useSpaceColors("car");
  const [activeTab, setActiveTab] = useState<CarRecentItem["type"] | "all">(initialTab);

  // "All time" by default, same as Expenses. Custom (1-12 weeks OR
  // months, picked via the unit toggle) covers anything the fixed
  // presets don't -- PeriodPicker's "Personalizat".
  const [period, setPeriod] = useState<CarExpensePeriod>({ kind: "all" });
  const currentOdometer = useMemo(() => getCurrentOdometer(carData), [carData]);

  // Documents never reach this feed -- they don't pass through the
  // dashboard's 7-day window at all any more (see CarDashboard.tsx's
  // allEntries), so there's nothing of theirs to "age into" History
  // with. Current documents live permanently in CarDocsPage; archived
  // ones live exclusively in Archive (CarArchivePage) -- neither ever
  // shows up here.
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

  // History is the complement of the dashboard, not a superset of it --
  // a record belongs here once it's either archived (never shown on the
  // dashboard at all, any age) or has aged out of its 7-day window (see
  // CarDashboard.tsx). Anything still inside that window is still on the
  // dashboard; showing it here too would mean every record lives in both
  // places until a week passes, which isn't "moved to History", it's
  // just duplicated. This is the same cutoff the dashboard filters
  // *in* with -- History filters everything *before* it out.
  const pastDashboardEntries = useMemo(() => {
    const cutoff = periodCutoffDate({ kind: "weeks", count: 1 })!;

    return allEntries.filter((e) => e.archived || new Date(e.date).getTime() < cutoff.getTime());
  }, [allEntries]);

  const items = useMemo(() => {
    const filtered =
      activeTab === "all" ? pastDashboardEntries : pastDashboardEntries.filter((e) => e.type === activeTab);
    const inPeriod = filterRecordsByPeriod(filtered, period);
    return [...inPeriod].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [pastDashboardEntries, activeTab, period]);

  // Records grouped by calendar month, newest first ("Septembrie").
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: CarRecentItem[] }[] = [];
    items.forEach((item) => {
      const d = new Date(item.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        const label = capitalize(d.toLocaleDateString("ro-RO", { month: "long", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}) }));
        g = { key, label, items: [] };
        out.push(g);
      }
      g.items.push(item);
    });
    return out;
  }, [items]);

  return (
    <SwipeBackView onBack={onBack}>
    <ScrollView
      testID="car-history-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="history-back" />
      <Identity color={carColors.color} kicker="Mașină" title="Istoric" subtitle="Ce a ieșit de pe pagina mașinii după 7 zile" info="car.history" />

      <Segmented options={CATEGORY_TABS} value={activeTab} onChange={setActiveTab} testIDPrefix="history-tab" />

      <PeriodPicker value={period} onChange={setPeriod} presets={CAR_PERIOD_PRESETS} testIDPrefix="history">
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{roCount(items.length, "înregistrare", "înregistrări")}</Text>
      </PeriodPicker>

      {items.length === 0 ? (
        <EmptyState
          icon="time-outline"
          message={period.kind === "all" ? "Nimic în istoric încă. Ce adaugi apare aici după 7 zile." : "Nimic în perioada aleasă."}
          action={
            period.kind !== "all" ? (
              <Pressable testID="history-period-reset" onPress={() => setPeriod({ kind: "all" })} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}>Arată tot timpul</Text>
              </Pressable>
            ) : null
          }
        />
      ) : (
        groups.map((group) => (
          <View key={group.key} style={{ gap: spacing.xs }}>
            <SectionHeader title={group.label} muted />
            <Group inset={68}>
              {group.items.map((item) => (
                <SwipeRow
                  key={`${item.type}-${item.id}`}
                  cornerRadius={0}
                  colors={colors}
                  onDelete={onRecordDelete && item.type !== "document" ? () => onRecordDelete(item) : undefined}
                >
                <View testID={`history-record-${item.type}-${item.id}`}>
                  <RecentRow
                    {...item}
                    subtitle={item.archived ? `${item.subtitle}, arhivat` : item.subtitle}
                    colors={colors}
                    spacing={spacing}
                    onPress={onRecordPress ? () => onRecordPress(item.type, item.id) : undefined}
                  />
                </View>
                </SwipeRow>
              ))}
            </Group>
          </View>
        ))
      )}
    </ScrollView>
    </SwipeBackView>
  );
}
