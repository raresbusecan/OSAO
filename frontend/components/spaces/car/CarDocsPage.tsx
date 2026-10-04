import React, { useMemo } from "react";
import { ScrollView } from "react-native";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { TopBar, Identity, Group, Row, IconWell, Chip, EmptyState } from "@/components/ui/primitives";
import { roCount } from "@/lib/format";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
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
  if (status === "no_expiry") return "Fără expirare";
  if (status === "expired") return "Expirat";
  if (status === "expiring_soon") return daysUntilExpiry === 0 ? "Expiră azi" : `Expiră în ${roCount(daysUntilExpiry ?? 0, "zi", "zile")}`;
  return "Valabil";
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
  const { colors, spacing, isDark } = useTheme();

  const documents = useMemo(() => {
    return carData.documentEntries
      .filter((entry) => !entry.archived)
      .map((entry) => ({ ...entry, ...getDocumentStatus(entry) }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [carData.documentEntries]);

  const CAR = SPACE_IDENTITY_COLORS.car!;
  const tint = spaceTextColor("car", isDark) ?? CAR;

  return (
    <SwipeBackView onBack={onBack}>
    <ScrollView
      testID="car-docs-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="docs-back" />
      <Identity color={CAR} kicker="Mașină" title="Documente" subtitle="RCA, ITP, rovinietă și orice altceva ai la dosar" />

      {documents.length === 0 ? (
        <EmptyState icon="document-text-outline" message="Niciun document încă. Adaugă unul din butonul Document de pe pagina mașinii." />
      ) : (
        <Group inset={68}>
          {documents.map((doc) => {
            const tone = statusColor(doc.status, colors);
            return (
              <Row
                key={doc.id}
                testID={`docs-record-${doc.id}`}
                onPress={onRecordPress ? () => onRecordPress(doc.id) : undefined}
                leading={<IconWell icon="document-text-outline" color={CAR} tint={tint} />}
                title={doc.title}
                subtitle={[doc.documentType, formatCarDate(doc.date), doc.price !== undefined ? `${formatCarNumber(doc.price)} lei` : null].filter(Boolean).join(", ")}
                trailing={
                  doc.status === "valid" || doc.status === "no_expiry"
                    ? <Chip label={statusLabel(doc.status, doc.daysUntilExpiry)} color={tone} filled={false} />
                    : <Chip label={statusLabel(doc.status, doc.daysUntilExpiry)} color={tone} icon={doc.status === "expired" ? "alert-circle" : undefined} />
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
