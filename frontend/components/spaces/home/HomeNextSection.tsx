import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { PressableScale } from "@/components/ui/PressableScale";
import { SectionHeader, IconWell, Chip } from "@/components/ui/primitives";
import { capitalize } from "@/lib/format";
import type { HomeNextItem } from "./home.ui.types";

export type HomeNextSectionProps = {
  items: HomeNextItem[];
  /** Opens the row's own entry for editing -- item.id is always
   * "<prefix>-<entry id>" (doc-/maint-/rec-, see getUpcomingHomeItems),
   * the caller (HomeDashboard) is the one that knows how to turn that
   * back into a category+id. Rows are inert when this is omitted. */
  onItemPress?: (item: HomeNextItem) => void;
  /** Swipe-right -- same resolveCategoryEntry action the category
   * page's own row swipe already fires. A "doc-" item has no resolve
   * concept (only Maintenance/Recurring do, see homeCategoryConfig.ts's
   * resolveEntry) -- that row skips the left-swipe reveal entirely. */
  onItemResolve?: (item: HomeNextItem) => void;
  /** Swipe-left -- deletes the entry (caller confirms first). */
  onItemDelete?: (item: HomeNextItem) => void;
};

/** "Urmează" on the Home space: the next few documents/maintenance/
 * bills, one grouped card; each row's chip says how close it is. */
export function HomeNextSection({ items, onItemPress, onItemResolve, onItemDelete }: HomeNextSectionProps) {
  const { colors, spacing, radius, isDark } = useTheme();

  if (items.length === 0) return null;

  const tint = spaceTextColor("home", isDark) ?? SPACE_IDENTITY_COLORS.home!;

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Urmează" info="home.next" />
      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card, overflow: "hidden" }}>
        {items.map((item, index) => {
          const canResolve = !String(item.id).startsWith("doc-");
          const text = item.subtitle ?? "";
          const tone = /^(restant|expirat)/.test(text) ? colors.error : /azi$/.test(text) ? colors.warning : null;

          const row = (
            <PressableScale
              testID={`home-next-item-${item.id}`}
              onPress={onItemPress ? () => onItemPress(item) : undefined}
              disabled={!onItemPress}
              scaleTo={1}
              pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${text}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                minHeight: 64,
                backgroundColor: colors.surfaceSecondary,
              }}
            >
              <IconWell icon={item.icon} color={SPACE_IDENTITY_COLORS.home!} tint={tint} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={2}>
                {item.title}
              </Text>
              {tone ? <Chip label={capitalize(text)} color={tone} /> : <Chip label={capitalize(text)} color={colors.onSurfaceTertiary} filled={false} />}
            </PressableScale>
          );

          return (
            <View key={item.id}>
              {index > 0 ? <View style={{ height: 1, marginLeft: 68, backgroundColor: colors.border }} /> : null}
              {onItemDelete ? (
                <SwipeRow
                  // A document's swipe-right renews it (the caller's pop-up).
                  onResolve={onItemResolve ? () => onItemResolve(item) : undefined}
                  resolveIcon={canResolve ? "checkmark" : "refresh"}
                  resolveLabel={canResolve ? "Rezolvă" : "Reînnoiește"}
                  onDelete={() => onItemDelete(item)}
                  cornerRadius={0}
                  colors={colors}
                >
                  {row}
                </SwipeRow>
              ) : (
                row
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
