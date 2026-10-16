import React, { useMemo } from "react";
import { View, Text, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { TopBar, Identity, Group, Row, IconWell, EmptyState } from "@/components/ui/primitives";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import type { CarData } from "./car.data.types";
import { getArchivedCarRecords } from "@/lib/spaces/car/calculations/expenses.calculations";
import { formatCarDate, formatCarNumber } from "./utils/carFormatters";

export type CarArchivePageProps = {
  carData: CarData;
  onBack: () => void;
  /** Tapping a record opens it in its own form. Maintenance stays fully
   * editable/deletable, same as everywhere else. Documents don't --
   * every document here is archived, which locks it (see
   * lib/spaces/car/utils/documentLock.ts): it opens read-only instead. */
  onRecordPress?: (category: "document" | "maintenance", id: string) => void;
};

/**
 * Everything a renewal has superseded, in one place -- reachable by
 * tapping the car icon on CarDashboard. Archived entries were already
 * visible (tagged) inside the Expenses page, but that's a money list
 * first and an archive second; this is a dedicated page precisely
 * because "where did my old RCA go" shouldn't require knowing to open
 * Expenses and recognize a small tag. All the actual data comes from
 * lib/spaces/car/calculations/expenses.calculations.ts's
 * getArchivedCarRecords -- this component only renders it.
 */
export function CarArchivePage({ carData, onBack, onRecordPress }: CarArchivePageProps) {
  const { colors, spacing } = useTheme();

  const records = useMemo(() => getArchivedCarRecords(carData), [carData]);

  const carColors = useSpaceColors("car");
  const CAR = carColors.color;
  const tint = carColors.tint;

  return (
    <SwipeBackView onBack={onBack}>
    <ScrollView
      testID="car-archive-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="archive-back" />
      <Identity color={CAR} kicker="Mașină" title="Arhivă" subtitle="Documente și lucrări înlocuite la reînnoire" info="car.archive" />

      {records.length === 0 ? (
        <EmptyState icon="archive-outline" message="Nimic arhivat încă. Când reînnoiești un document sau o lucrare, cea veche ajunge aici." />
      ) : (
        <Group inset={68}>
          {records.map((record) => {
            const locked = record.category === "document";
            const renewed = record.renewedByTitle
              ? `înlocuit de ${record.renewedByTitle}${record.renewedByDate ? ` (până pe ${record.renewedByDate})` : ""}`
              : null;
            return (
              <Row
                key={`${record.category}-${record.id}`}
                testID={`archive-record-${record.category}-${record.id}`}
                onPress={onRecordPress ? () => onRecordPress(record.category, record.id) : undefined}
                leading={<IconWell icon={record.icon} color={CAR} tint={tint} />}
                title={record.title}
                subtitle={[record.categoryLabel, record.category === "document" ? record.subtitle ?? formatCarDate(record.date) : formatCarDate(record.date), renewed].filter(Boolean).join(", ")}
                dim
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {record.amount !== undefined ? (
                      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurfaceTertiary }}>{formatCarNumber(record.amount)} lei</Text>
                    ) : null}
                    {locked ? <Ionicons name="lock-closed-outline" size={14} color={colors.onSurfaceTertiary} /> : null}
                  </View>
                }
              />
            );
          })}
        </Group>
      )}
    </ScrollView>
    </SwipeBackView>
  );
}
