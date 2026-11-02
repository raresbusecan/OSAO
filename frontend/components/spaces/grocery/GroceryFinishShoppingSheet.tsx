import React, { useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";
import { parseLocaleNumber } from "@/lib/format";

export type GroceryFinishShoppingSheetProps = {
  listName: string;
  /** How many checked-into-cart items on this list are linked to a Home
   * supply -- shown so it's clear finishing also logs a restock for
   * those, not just clears the cart. */
  linkedSupplyCount: number;
  onCancel: () => void;
  onConfirm: (price: number | undefined) => void;
};

/** Opened from "Finalizează cumpărăturile" on the active list (only
 * shown once something's checked into cart). Two things happen on
 * confirm, see GroceryDashboard.tsx's handleFinishShopping: every
 * checked item linked to a Home supply logs a real restock event there
 * (quantity + date, same shape as Home's own "Restocked"), and an
 * optional total price becomes a grocery_trip expense that rolls into
 * the monthly budget. Price is optional -- skipping it still logs the
 * restocks and clears the cart. */
export function GroceryFinishShoppingSheet({
  listName,
  linkedSupplyCount,
  onCancel,
  onConfirm,
}: GroceryFinishShoppingSheetProps) {
  const { colors, spacing, radius } = useTheme();
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  const confirmWith = (value: number | undefined) => onConfirm(value);

  const handleConfirm = () => {
    if (!price.trim()) {
      confirmWith(undefined);
      return;
    }
    const value = parseLocaleNumber(price);
    if (Number.isNaN(value) || value < 0) {
      setError("Preț invalid.");
      return;
    }
    confirmWith(value);
  };

  const GROC = useSpaceColors("grocery").color;

  return (
    <Sheet
      visible
      onClose={onCancel}
      info="grocery.finish"
      centered
      icon="checkmark-done"
      tone={colors.success}
      title="Gata cumpărăturile?"
      subtitle={`${listName}: cât ai plătit în total? Poți lăsa gol.`}
      footer={<Button label="Termină cumpărăturile" tone={GROC} onPress={handleConfirm} />}
    >
      <Field
        value={price}
        onChangeText={(t) => {
          setPrice(t);
          if (error) setError("");
        }}
        placeholder="0"
        keyboardType="decimal-pad"
        autoFocus
        big
        suffix="lei"
        tone={GROC}
        error={error || null}
        hint="Intră în bugetul lunii, la Cumpărături."
        accessibilityLabel="Total plătit"
      />
      {linkedSupplyCount > 0 ? (
        <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceTertiary }}>
          <Ionicons name="basket-outline" size={18} color={colors.onSurfaceTertiary} />
          <Text style={{ flex: 1, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 18 }}>
            {linkedSupplyCount === 1
              ? "Un produs actualizează și proviziile din Casă."
              : `${linkedSupplyCount} produse actualizează și proviziile din Casă.`}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}
