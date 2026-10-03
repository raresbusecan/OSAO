import React, { useEffect, useRef } from "react";
import { View, Text, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { confirmAction } from "@/lib/confirm";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import type { GroceryItem } from "@/lib/spaces/grocery/grocery.types";
import { PressableScale } from "@/components/ui/PressableScale";
import { SwipeRow } from "@/components/spaces/SwipeRow";
import { motion, useReducedMotion } from "@/lib/motion";

export type GroceryItemRowProps = {
  item: GroceryItem;
  onToggle: (id: string) => void;
  /** Opens the shared add/edit sheet on this item -- long-press the row
   * (Delete also lives inside that sheet). */
  onOpenMenu: (item: GroceryItem) => void;
  /** Deletes the item -- swipe the row left; confirms first, same as
   * every other delete in this space. */
  onDelete: (id: string) => void;
  /** Trailing slot, e.g. the avatar of who added it on a shared list. */
  trailing?: React.ReactNode;
};

/**
 * One product row, 2026-10 redesign. Tap anywhere = tick it into the
 * cart (always reversible) -- the check pops and the row fades, the way
 * you cross something off paper. The old per-row trash and pencil
 * icons are gone: swipe left to delete, long-press to edit, so the row
 * is one big target instead of three small ones side by side.
 */
export function GroceryItemRow({ item, onToggle, onOpenMenu, onDelete, trailing }: GroceryItemRowProps) {
  const { colors, spacing } = useTheme();
  const reduced = useReducedMotion();
  const fill = SPACE_IDENTITY_COLORS.grocery!;

  const pop = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(item.inCart ? 0.45 : 1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const target = item.inCart ? 0.45 : 1;
    if (reduced) {
      fade.setValue(target);
      return;
    }
    Animated.parallel([
      Animated.timing(fade, { toValue: target, useNativeDriver: true, ...motion.quick }),
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.18, duration: 90, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }),
      ]),
    ]).start();
  }, [item.inCart, reduced, fade, pop]);

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      "Șterge produsul",
      `Scoți „${item.name}" de pe listă?`,
      { confirmLabel: "Șterge", destructive: true },
    );
    if (confirmed) onDelete(item.id);
  };

  const detail = item.price != null ? `${new Intl.NumberFormat("ro-RO").format(item.price)} lei` : null;

  return (
    <SwipeRow onDelete={handleDelete} cornerRadius={0} colors={colors}>
      <PressableScale
        testID={`grocery-item-${item.id}`}
        onPress={() => onToggle(item.id)}
        onLongPress={() => onOpenMenu(item)}
        delayLongPress={350}
        scaleTo={0.99}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!item.inCart }}
        accessibilityLabel={item.name}
        accessibilityHint="Atinge ca să bifezi. Ține apăsat ca să editezi."
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          minHeight: 58,
          backgroundColor: colors.surfaceSecondary,
        }}
      >
        <Animated.View
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            // Amber fill with a fixed dark check: a white check on amber
            // is ~2.2:1, under the 3:1 minimum for a graphic.
            backgroundColor: item.inCart ? fill : "transparent",
            borderWidth: item.inCart ? 0 : 2,
            borderColor: colors.borderStrong,
            transform: [{ scale: pop }],
          }}
        >
          {item.inCart ? <Ionicons name="checkmark" size={16} color="#1A1206" /> : null}
        </Animated.View>

        <Animated.View style={{ flex: 1, opacity: fade, paddingVertical: spacing.sm + 2 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "500",
              color: colors.onSurface,
              textDecorationLine: item.inCart ? "line-through" : "none",
            }}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {detail ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 1 }}>{detail}</Text> : null}
        </Animated.View>

        {item.quantity ? (
          <Animated.Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, opacity: fade }}>{item.quantity}</Animated.Text>
        ) : null}
        {trailing ? <View>{trailing}</View> : null}
      </PressableScale>
    </SwipeRow>
  );
}
