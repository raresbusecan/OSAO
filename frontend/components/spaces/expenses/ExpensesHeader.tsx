import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { TopBar, CircleButton, Identity } from "@/components/ui/primitives";

export type ExpensesHeaderProps = {
  space: any;
  onEdit?: () => void;
};

/** Back to Spaces + edit on top, then the identity block -- the same
 * header every Space uses (kind dot "Cheltuieli", the space's name). */
export function ExpensesHeader({ space, onEdit }: ExpensesHeaderProps) {
  const { spacing } = useTheme();
  const TEAL = useSpaceColors("expenses").color;
  const router = useRouter();
  return (
    <View style={{ gap: spacing.section }}>
      <TopBar onBack={() => router.push("/spaces")}>
        {onEdit ? <CircleButton testID="space-edit" icon="create-outline" label="Editează spațiul" onPress={onEdit} /> : null}
      </TopBar>
      <Identity color={TEAL} kicker="Cheltuieli" title={space?.name || "Cheltuieli"} info="expenses.space" />
    </View>
  );
}
