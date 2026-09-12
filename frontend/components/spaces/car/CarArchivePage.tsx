import React, { useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
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
  const { colors, spacing, radius } = useTheme();

  const records = useMemo(() => getArchivedCarRecords(carData), [carData]);

  return (
    <ScrollView
      testID="car-archive-page"
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
          testID="archive-back"
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

        <View>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: colors.onSurface,
              letterSpacing: -0.4,
            }}
          >
            Archive
          </Text>
          <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
            Documents and maintenance replaced by a renewal
          </Text>
        </View>
      </View>

      {records.length === 0 ? (
        <View
          style={{
            alignItems: "center",
            paddingVertical: spacing["3xl"] ?? 48,
            gap: spacing.sm,
          }}
        >
          <Ionicons name="archive-outline" size={28} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center" }}>
            Nothing archived yet. Renewing a document or maintenance entry from
            a NEXT alert moves the old one here.
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: colors.surfaceSecondary,
            borderRadius: radius.lg,
            overflow: "hidden",
          }}
        >
          {records.map((record, index) => {
            // Every record on this page is already archived by
            // construction (getArchivedCarRecords only returns those) --
            // no need to run isDocumentLocked's date check here, just
            // "is this a document" (maintenance stays editable, see the
            // prop doc above).
            const locked = record.category === "document";

            return (
            <Pressable
              key={`${record.category}-${record.id}`}
              testID={`archive-record-${record.category}-${record.id}`}
              onPress={() => onRecordPress?.(record.category, record.id)}
              disabled={!onRecordPress}
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                gap: 6,
                borderBottomWidth: index === records.length - 1 ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceTertiary,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: 0.6,
                  }}
                >
                  <Ionicons name={record.icon} size={17} color={colors.onSurface} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}>
                    {record.title}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }}>
                    {record.categoryLabel} · {formatCarDate(record.date)}
                    {record.subtitle ? ` · ${record.subtitle}` : ""}
                  </Text>
                </View>

                {record.amount !== undefined ? (
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                    {formatCarNumber(record.amount)} RON
                  </Text>
                ) : null}

                {onRecordPress ? (
                  <Ionicons
                    name={locked ? "lock-closed-outline" : "chevron-forward"}
                    size={14}
                    color={colors.onSurfaceTertiary}
                  />
                ) : null}
              </View>

              {record.renewedByTitle ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginLeft: 48,
                  }}
                >
                  <Ionicons name="arrow-forward-outline" size={12} color={colors.onSurfaceTertiary} />
                  <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
                    Renewed by {record.renewedByTitle}
                    {record.renewedByDate ? ` · ${record.renewedByDate}` : ""}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
