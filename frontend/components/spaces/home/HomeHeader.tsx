import React from "react";
import { View } from "react-native";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { roCount } from "@/lib/format";
import { TopBar, CircleButton, Identity, Pill } from "@/components/ui/primitives";

export type HomeHeaderProps = {
  space: any;
  /** The profile's county/city -- shown under the name. */
  subtitle?: string;
  onBack: () => void;
  onEdit?: () => void;
  /** Space-level History (Tasks + Maintenance resolved entries). */
  onHistoryPress?: () => void;
  onDocumentsPress?: () => void;
  onSuppliesPress?: () => void;
  /** Expired documents -- a red count on the Documente pill. */
  expiredDocuments?: number;
  /** Supplies probably out -- a red count on the Provizii pill. */
  lowSupplies?: number;
};

/** Back on the left, edit on the right; then the identity block (kind dot
 * "Casă", the home's name, its location) and, under it, the labelled
 * pills -- Istoric, Documente, Provizii -- the same arrangement as
 * Mașină's Documente / Arhivă / Istoric row. Documente and Provizii have
 * no tab in "De rezolvat", so their urgent count rides on the pill. */
export function HomeHeader({ space, subtitle, onBack, onEdit, onHistoryPress, onDocumentsPress, onSuppliesPress, expiredDocuments = 0, lowSupplies = 0 }: HomeHeaderProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.section }}>
      <TopBar onBack={onBack}>
        {onEdit ? <CircleButton testID="space-edit" icon="create-outline" label="Editează casa" onPress={onEdit} /> : null}
      </TopBar>
      <View style={{ gap: spacing.md }}>
        <Identity color={SPACE_IDENTITY_COLORS.home} kicker="Casă" title={space?.name || "Casa mea"} subtitle={subtitle} info="home.space" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {onHistoryPress ? <Pill testID="home-history-open" icon="time-outline" label="Istoric" onPress={onHistoryPress} /> : null}
          {onDocumentsPress ? (
            <Pill
              testID="home-documents-open"
              icon="document-text-outline"
              label="Documente"
              badge={expiredDocuments}
              a11yLabel={expiredDocuments > 0 ? `Documente, ${roCount(expiredDocuments, "expirat", "expirate")}` : "Documente"}
              onPress={onDocumentsPress}
            />
          ) : null}
          {onSuppliesPress ? (
            <Pill
              testID="home-supplies-open"
              icon="basket-outline"
              label="Provizii"
              badge={lowSupplies}
              a11yLabel={lowSupplies > 0 ? `Provizii, ${lowSupplies} pe terminate` : "Provizii"}
              onPress={onSuppliesPress}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
