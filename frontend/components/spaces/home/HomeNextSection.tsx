import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import type { HomeNextItem } from "./home.ui.types";

export type HomeNextSectionProps = {
  items: HomeNextItem[];
  /** Opens the row's own entry for editing -- item.id is always
   * "<prefix>-<entry id>" (doc-/maint-/rec-, see getUpcomingHomeItems),
   * the caller (HomeDashboard) is the one that knows how to turn that
   * back into a category+id. Rows render as plain Views (no tap,
   * no chevron) when this is omitted. */
  onItemPress?: (item: HomeNextItem) => void;
  /** Swipe-right -- same resolveCategoryEntry action the category
   * page's own row swipe already fires, reachable here without opening
   * that page first. A "doc-" item has no resolve concept at all (only
   * Maintenance/Recurring do, see homeCategoryConfig.ts's resolveEntry)
   * -- that row skips the left-swipe reveal entirely rather than
   * wiring a dead gesture (same "omit onResolve to skip it" pattern
   * every other SwipeRow usage uses, not a disabled/no-op action). */
  onItemResolve?: (item: HomeNextItem) => void;
  /** Swipe-left -- deletes the entry (caller confirms first). */
  onItemDelete?: (item: HomeNextItem) => void;
};

export function HomeNextSection({ items, onItemPress, onItemResolve, onItemDelete }: HomeNextSectionProps) {
  const { colors, spacing, radius } = useTheme();

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 1,
          color: colors.onSurfaceTertiary,
          marginBottom: 10,
        }}
      >
        NEXT
      </Text>

      <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
        {items.map((item) => {
          // Only Maintenance/Recurring entries have a resolve concept
          // at all (see homeCategoryConfig.ts's resolveEntry) -- a
          // Document row omits onResolve entirely rather than wiring a
          // swipe that would silently do nothing, same as every other
          // SwipeRow usage in the app.
          const canResolve = !String(item.id).startsWith("doc-");

          const row = (
          <Pressable
            key={item.id}
            testID={`home-next-item-${item.id}`}
            onPress={onItemPress ? () => onItemPress(item) : undefined}
            disabled={!onItemPress}
            style={{
              backgroundColor: colors.surfaceSecondary,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.sm,
              padding: spacing.lg,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: radius.md,
                // Tinted with Home's identity color, same recipe as
                // Home's "CATEGORII" tile chips and Car's own DUE
                // SOON/Quick Actions -- this icon's job is "this is a
                // Documents/Maintenance/Recurring/... entry," the same
                // identity signal those already carry.
                backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={item.icon} size={20} color={SPACE_IDENTITY_COLORS.home} />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: colors.onSurface,
                }}
              >
                {item.title}
              </Text>

              <Text
                style={{
                  marginTop: 3,
                  fontSize: 12,
                  color: colors.onSurfaceTertiary,
                }}
              >
                {item.subtitle}
              </Text>
            </View>

            {item.right ? (
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: colors.onSurfaceTertiary,
                }}
              >
                {item.right}
              </Text>
            ) : null}

            {onItemPress ? (
              <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
            ) : null}
          </Pressable>
          );

          if (!onItemDelete) return row;

          return (
            <SwipeRow
              key={item.id}
              onResolve={canResolve && onItemResolve ? () => onItemResolve(item) : undefined}
              onDelete={() => onItemDelete(item)}
              cornerRadius={radius.sm}
              colors={colors}
            >
              {row}
            </SwipeRow>
          );
        })}
      </View>
    </>
  );
}
