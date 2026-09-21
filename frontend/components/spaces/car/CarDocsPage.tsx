import React, { useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import type { CarData } from "./car.data.types";
import { getDocumentStatus, type DocumentStatus } from "@/lib/spaces/car/calculations/dashboard.calculations";
import { formatCarDate, formatCarNumber } from "./utils/carFormatters";

export type CarDocsPageProps = {
  carData: CarData;
  onBack: () => void;
  /** Tapping a row opens it in CarDocumentForm, same as everywhere else
   * -- read-only once archived (see isDocumentLocked), otherwise fully
   * editable. Archived documents don't show here at all (that's
   * Archive's job); this page never locks on age the way the old
   * RECENT/ALL mix used to. */
  onRecordPress?: (id: string) => void;
};

function statusLabel(status: DocumentStatus, daysUntilExpiry: number | null): string {
  if (status === "no_expiry") return "No expiry set";
  if (status === "expired") return "Expired";
  if (status === "expiring_soon") return `Expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`;
  return "Valid";
}

function statusColor(status: DocumentStatus, colors: any): string {
  if (status === "expired") return colors.error;
  if (status === "expiring_soon") return colors.warning;
  if (status === "valid") return colors.success;
  return colors.onSurfaceTertiary;
}

/**
 * Every CURRENT document (RCA, ITP, road tax, ...) in one permanent
 * place -- reachable from the Archive/History pill row on CarDashboard.
 * Used to be mixed into RECENT/ALL/History alongside fuel/maintenance/
 * expenses, time-boxed to the dashboard's 7-day window -- but a
 * document isn't a thing that "happened" the way a fill-up or a repair
 * is, it's something that stays valid for months or years, so aging it
 * out of view after a week never made sense for this one category. This
 * page has no period filter at all: a document lives here for as long
 * as it's current, full stop, and moves to Archive only once an actual
 * renewal supersedes it (see CarDashboard.tsx's "renew" flow).
 */
export function CarDocsPage({ carData, onBack, onRecordPress }: CarDocsPageProps) {
  const { colors, spacing, radius } = useTheme();

  const documents = useMemo(() => {
    return carData.documentEntries
      .filter((entry) => !entry.archived)
      .map((entry) => ({ ...entry, ...getDocumentStatus(entry) }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [carData.documentEntries]);

  return (
    <ScrollView
      testID="car-docs-page"
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
          testID="docs-back"
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 }}>
            Docs
          </Text>
          <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
            RCA, ITP, road tax and anything else on file
          </Text>
        </View>
      </View>

      {documents.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: spacing["3xl"] ?? 48, gap: spacing.sm }}>
          <Ionicons name="document-text-outline" size={28} color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center" }}>
            No documents on file yet. Add one from the + menu's Document category.
          </Text>
        </View>
      ) : (
        <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
          {documents.map((doc, index) => (
            <Pressable
              key={doc.id}
              testID={`docs-record-${doc.id}`}
              onPress={() => onRecordPress?.(doc.id)}
              disabled={!onRecordPress}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                borderBottomWidth: index === documents.length - 1 ? 0 : StyleSheet.hairlineWidth,
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
                <Ionicons name="document-text-outline" size={17} color={colors.onSurface} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>
                  {doc.title}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, color: colors.onSurfaceTertiary }} numberOfLines={1}>
                  {doc.documentType} · {formatCarDate(doc.date)}
                </Text>
                <Text style={{ marginTop: 2, fontSize: 12, fontWeight: "700", color: statusColor(doc.status, colors) }}>
                  {statusLabel(doc.status, doc.daysUntilExpiry)}
                </Text>
              </View>

              {doc.price !== undefined ? (
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>
                  {formatCarNumber(doc.price)} RON
                </Text>
              ) : null}

              {onRecordPress ? (
                <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceTertiary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
