import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { capitalize } from "@/lib/format";
import type { HelpKey } from "@/lib/help";
import { InfoButton } from "@/components/ui/primitives";
import { ProfileButton } from "./ProfileButton";

/** Top padding above a TabHeader -- the same on every tab root. */
export const TAB_HEADER_TOP = "lg" as const;

/**
 * The ONE header of every main tab root (Acasă, Spații, Calendar, Buget,
 * Simplu's Acasă + Calendar) and of their edit modes, so nothing moves
 * when you switch tabs (user, 2026-11-01): a small grey line (today's
 * date unless `label` says otherwise), the title under it (shrinks
 * rather than wrapping) with its ⓘ, then the tab's own `actions`, then
 * the ProfileButton -- always last, always in the same spot. The screen
 * puts it at `paddingTop: spacing[TAB_HEADER_TOP]` under the safe area.
 */
export function TabHeader({
  title,
  label,
  info,
  actions,
  profile = true,
  profileTestID,
  testID,
}: {
  title: string;
  /** The small line above the title; defaults to today's date. */
  label?: string;
  info?: HelpKey;
  /** The tab's own buttons, left of the profile circle. */
  actions?: React.ReactNode;
  /** Off in edit modes (they show Renunță / Gata instead). */
  profile?: boolean;
  profileTestID?: string;
  testID?: string;
}) {
  const { colors, spacing, typography } = useTheme();
  const line = label ?? capitalize(new Date().toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }));
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 56 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }} numberOfLines={1}>
          {line}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={{ ...typography.title, lineHeight: 30, color: colors.onSurface, flexShrink: 1 }}
            accessibilityRole="header"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {title}
          </Text>
          {info ? <InfoButton topic={info} /> : null}
        </View>
      </View>
      {actions}
      {profile ? <ProfileButton testID={profileTestID} /> : null}
    </View>
  );
}
