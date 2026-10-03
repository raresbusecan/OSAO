import React from "react";
import { View } from "react-native";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { TopBar, CircleButton, Identity } from "@/components/ui/primitives";

export type HomeHeaderProps = {
  space: any;
  /** The profile's county/city -- shown under the name. */
  subtitle?: string;
  onBack: () => void;
  onEdit?: () => void;
  /** Space-level History (Tasks + Maintenance resolved entries). */
  onHistoryPress?: () => void;
};

/** 2026-10 redesign: back on the left; history + edit as round buttons
 * on the right; then the left-aligned identity block (kind dot "Casă",
 * the home's name, its location) -- same header every Space uses. */
export function HomeHeader({ space, subtitle, onBack, onEdit, onHistoryPress }: HomeHeaderProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.section }}>
      <TopBar onBack={onBack}>
        {onHistoryPress ? <CircleButton testID="home-history-open" icon="time-outline" label="Istoric" onPress={onHistoryPress} /> : null}
        {onEdit ? <CircleButton testID="space-edit" icon="create-outline" label="Editează casa" onPress={onEdit} /> : null}
      </TopBar>
      <Identity color={SPACE_IDENTITY_COLORS.home} kicker="Casă" title={space?.name || "Casa mea"} subtitle={subtitle} />
    </View>
  );
}
