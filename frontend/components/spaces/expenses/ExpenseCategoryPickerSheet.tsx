/** @deprecated The Expenses space's category tag was removed (nothing
 * in the app ever read it back -- no filtering, grouping or budgeting
 * used it, purely a display label). Not imported anywhere; kept only
 * because this environment couldn't delete the file. */
import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

const EXPENSE_CATEGORIES = ["Shopping", "Travel", "Health", "Food", "Gifts", "Other"] as const;

export const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Shopping: "bag-handle-outline",
  Travel: "airplane-outline",
  Health: "medkit-outline",
  Food: "restaurant-outline",
  Gifts: "gift-outline",
  Other: "ellipsis-horizontal-outline",
};

export type ExpenseCategoryPickerSheetProps = {
  value?: string;
  onCancel: () => void;
  onSelect: (category: string | undefined) => void;
};

/** Opened from the compact category button next to Name/Price on
 * ExpensesAddBar -- a vertical scroll strip squeezed into that same
 * ~48px row was the original idea, but it'd fight the page's own
 * vertical scroll and only ever show one bare icon at a time. This
 * keeps the same "no need to open Add details just for category" goal
 * with full labels and no nested-scroll conflict instead. */
export function ExpenseCategoryPickerSheet({ value, onCancel, onSelect }: ExpenseCategoryPickerSheetProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg + 4,
            borderTopRightRadius: radius.lg + 4,
            padding: spacing.xl,
            gap: spacing.sm,
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
              alignSelf: "center",
              marginBottom: spacing.sm,
            }}
          />

          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm }}>
            Categorie
          </Text>

          {EXPENSE_CATEGORIES.map((c) => {
            const selected = value === c;
            return (
              <Pressable
                key={c}
                testID={`category-picker-${c.toLowerCase()}`}
                onPress={() => onSelect(c)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  height: 48,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.onSurface : "transparent",
                }}
              >
                <Ionicons name={CATEGORY_ICONS[c] ?? "pricetag-outline"} size={18} color={selected ? colors.surface : colors.onSurface} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: selected ? colors.surface : colors.onSurface }}>
                  {c}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            testID="category-picker-clear"
            onPress={() => onSelect(undefined)}
            style={{
              marginTop: spacing.sm,
              height: 48,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.onSurfaceTertiary }}>Fără categorie</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
