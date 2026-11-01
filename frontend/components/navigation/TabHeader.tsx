import React from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { capitalize } from "@/lib/format";
import type { HelpKey } from "@/lib/help";
import { InfoButton } from "@/components/ui/primitives";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { ProfileButton } from "./ProfileButton";

/**
 * The frame of every main tab root (Acasă, Spații, Calendar, Buget,
 * Simplu's Acasă + Calendar): safe area, the Aspect background, and the
 * tab's `header` (a <TabHeader />) FIXED above `children` -- never inside
 * the scroll, so it sits at exactly the same spot on every tab whatever
 * each tab's scroll offset (tabs stay mounted and keep it; user,
 * 2026-11-01). A screen only says what its header holds. `header`
 * undefined = no header (Buget's sub-pages bring their own TopBar).
 * `headerTarget` = a tour target (useTourTarget) around the header.
 * The gap under the header belongs to the screen's scroll content
 * (`paddingTop: spacing.md`), so the first card's shadow isn't clipped.
 */
export function TabScreen({
  testID,
  header,
  headerTarget,
  children,
}: {
  testID?: string;
  header?: React.ReactElement;
  headerTarget?: { ref: (node: any) => void; collapsable: false };
  children: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID={testID}>
      <ScreenBackground />
      {header ? (
        <View {...headerTarget} style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg }}>
          {header}
        </View>
      ) : null}
      {children}
    </SafeAreaView>
  );
}

/**
 * The ONE header of every main tab root and of their edit modes, so
 * nothing moves when you switch tabs: a small grey line (today's date
 * unless `label` says otherwise), the title under it (shrinks rather
 * than wrapping) with its ⓘ, then the tab's own `actions`, then the
 * ProfileButton -- always last, always in the same spot. Pass it as
 * TabScreen's `header`.
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
            minimumFontScale={0.65}
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
