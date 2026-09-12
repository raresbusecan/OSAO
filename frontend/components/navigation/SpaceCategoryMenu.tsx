import React, { useCallback, useImperativeHandle, useRef } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type SpaceCategory = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type SpaceCategoryMenuProps = {
  spaceLabel: string;
  categories: SpaceCategory[];
  onSelect: (key: string) => void;
};

export type SpaceCategoryMenuRef = {
  present: () => void;
  dismiss: () => void;
};

/**
 * The "half button" -- a dome handle sitting right above the bottom tab
 * bar on every space's detail screen -- and the sheet it opens, listing
 * that space's categories (Documents, Expenses, Maintenance, ...).
 * Selecting one is how a user now reaches a category's dedicated page;
 * replaces what used to be every category's full list stacked directly
 * on the dashboard.
 *
 * Shared across every space (Car/Home/Grocery/Expenses/...) rather than
 * rebuilt per space -- only the `categories` list passed in changes.
 * Renders nothing for a space with no categories to offer.
 */
export const SpaceCategoryMenu = React.forwardRef<
  SpaceCategoryMenuRef,
  SpaceCategoryMenuProps
>(function SpaceCategoryMenu({ spaceLabel, categories, onSelect }, ref) {
  const { colors, spacing, radius } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);

  const open = useCallback(() => sheetRef.current?.present(), []);
  const close = useCallback(() => sheetRef.current?.dismiss(), []);

  // Lets an existing "+" button on a space's own header (e.g. Car's) open
  // the same sheet as the dome handle, instead of duplicating a second,
  // separate picker -- one sheet, two entry points.
  useImperativeHandle(ref, () => ({ present: open, dismiss: close }), [
    open,
    close,
  ]);

  const handleSelect = useCallback(
    (key: string) => {
      close();
      onSelect(key);
    },
    [close, onSelect],
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    [],
  );

  if (categories.length === 0) {
    return null;
  }

  return (
    <>
      {/* The handle itself: a raised circle floating just above the tab
          bar, with a second, dimmer disc peeking out behind it -- "there
          are several things back there" purely through shape, no label
          competing for space. Was a small flat dome (56x26, same color as
          the background); this is deliberately bigger and higher-contrast
          after comparing it against several more-visible alternatives.
          box-none so the empty space to its left/right never intercepts
          touches meant for the tab bar underneath. Can only draw ABOVE the
          screen's own bottom edge (this component has no access to the
          real tab bar rendered by the navigator) -- no literal notch cut
          into the bar itself, just this floating above it. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
        }}
      >
        <View style={{ width: 66, height: 60 }}>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              // Sinks the same amount as the button below -- half its own
              // height sits behind the tab bar's now-empty center gap
              // (see CustomTabBar in app/(tabs)/_layout.tsx), half stays
              // above it, floating.
              bottom: -25,
              left: 0,
              width: 54,
              height: 54,
              borderRadius: 999,
              backgroundColor: colors.surfaceTertiary,
              opacity: 0.8,
            }}
          />

          <Pressable
            testID="space-category-handle"
            onPress={open}
            hitSlop={10}
            style={{
              position: "absolute",
              bottom: -27,
              left: 6,
              width: 54,
              height: 54,
              borderRadius: 999,
              backgroundColor: colors.onSurface,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <Ionicons
              name="chevron-up"
              size={20}
              color={colors.surface}
            />
          </Pressable>
        </View>
      </View>

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={["50%"]}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        keyboardBehavior={Platform.OS === "ios" ? "extend" : "interactive"}
        keyboardBlurBehavior="restore"
        handleIndicatorStyle={{ backgroundColor: colors.surfaceTertiary }}
        backgroundStyle={{ backgroundColor: colors.surface }}
      >
        <BottomSheetView
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.sm,
            paddingBottom: spacing.xl,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "800",
              letterSpacing: 1,
              color: colors.onSurfaceTertiary,
              marginBottom: spacing.md,
            }}
          >
            {spaceLabel.toUpperCase()} · CATEGORIES
          </Text>

          <View style={{ gap: spacing.sm }}>
            {categories.map((category) => (
              <Pressable
                key={category.key}
                testID={`category-item-${category.key}`}
                onPress={() => handleSelect(category.key)}
                style={{
                  minHeight: 60,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSecondary,
                  paddingHorizontal: spacing.lg,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceTertiary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={category.icon}
                    size={19}
                    color={colors.onSurface}
                  />
                </View>

                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: "600",
                    color: colors.onSurface,
                  }}
                >
                  {category.label}
                </Text>

                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.onSurfaceTertiary}
                />
              </Pressable>
            ))}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
});

SpaceCategoryMenu.displayName = "SpaceCategoryMenu";
