import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { SurfaceLevelContext } from "@/components/ui/primitives";
import { PressableScale } from "@/components/ui/PressableScale";

/**
 * primitives' Row, plus a small chip right after the title ("Fără vină",
 * a credit's "Mașină"/"Casă" link) -- Row's title is a plain string, so
 * it has no slot for one. Same metrics and pressed highlight as Row.
 */
export function TitleChipRow({
  leading,
  title,
  chip,
  subtitle,
  trailing,
  onPress,
  dim,
  testID,
}: {
  leading?: React.ReactNode;
  title: string;
  chip?: React.ReactNode;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  dim?: boolean;
  testID?: string;
}) {
  const { colors, spacing } = useTheme();
  const onCard = React.useContext(SurfaceLevelContext) === "card";
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, paddingVertical: spacing.sm + 2, opacity: dim ? 0.5 : 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface, flexShrink: 1 }} numberOfLines={2}>
            {title}
          </Text>
          {chip}
        </View>
        {subtitle ? (
          <Text style={{ marginTop: 2, fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={{ opacity: dim ? 0.5 : 1 }}>{trailing}</View> : null}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 58,
    backgroundColor: onCard ? colors.surfaceTertiary : colors.surfaceSecondary,
  };
  if (!onPress) return <View testID={testID} style={style}>{content}</View>;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={1}
      pressedStyle={{ backgroundColor: onCard ? colors.segmentActive : colors.surfaceTertiary }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={style}
    >
      {content}
    </PressableScale>
  );
}
