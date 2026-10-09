import React, { useState } from "react";
import { roUnit } from "@/lib/format";
import { SPACE_IDENTITY_COLORS, SPACE_BUTTON_FILL } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";

import type { HomeSupplyEntry } from "@/lib/spaces/home/home.types";

// Drag-to-dismiss on the sheet's own handle bar -- same classic
// PanGestureHandler + React Native Animated pattern as
// ExpenseEditModal's sheet (not react-native-reanimated's newer
// Gesture.Pan()/worklet system, confirmed live on a real device to do
// nothing in this project's Expo Go install). This component is only
// ever mounted while its caller holds a non-null entry (see
// HomeDashboard's `{restockSheetEntry ? <HomeSupplyRestockSheet ... />
// : null}`), so -- unlike ExpenseEditModal, which stayed mounted with
// Modal's own `visible` toggling -- a fresh mount every open already
// gives this a clean Animated.Value for free, no remount-key trick
// needed.

export type HomeSupplyRestockSheetProps = {
  entry: HomeSupplyEntry;
  onCancel: () => void;
  onConfirm: (quantity: number) => void;
};

/** Opened from "Restocked" on HomeSuppliesPage. Asks how much was just
 * bought -- the raw day-gap between restocks isn't a reliable signal on
 * its own (1 unit vs. 5 units of the same product naturally lasts
 * different lengths of time), so getSupplyRestockEstimate needs the
 * quantity per event to learn an actual units/day consumption rate. */
export function HomeSupplyRestockSheet({ entry, onCancel, onConfirm }: HomeSupplyRestockSheetProps) {
  const [quantity, setQuantity] = useState(String(entry.quantity ?? ""));
  const [error, setError] = useState("");

  const handleConfirm = () => {
    const value = Number(quantity.replace(",", "."));
    if (!quantity.trim() || Number.isNaN(value) || value <= 0) {
      setError("Introdu o cantitate validă.");
      return;
    }
    onConfirm(value);
  };

  return (
    <Sheet
      visible
      onClose={onCancel}
      info="home.supplies"
      title={entry.name}
      subtitle="Cât ai cumpărat?"
      icon="basket-outline"
      tone={SPACE_IDENTITY_COLORS.home}
      footer={<Button label="Salvează" tone={SPACE_BUTTON_FILL.home} onPress={handleConfirm} />}
    >
      <Field
        value={quantity}
        onChangeText={(t) => {
          setQuantity(t);
          if (error) setError("");
        }}
        keyboardType="decimal-pad"
        autoFocus
        big
        suffix={roUnit(entry.unit)}
        tone={SPACE_IDENTITY_COLORS.home}
        error={error || null}
        hint="Cantitatea contează pentru estimare: perioada până la următoarea cumpărătură depinde de cât iei de fiecare dată."
        accessibilityLabel="Cantitate cumpărată"
      />
    </Sheet>
  );
}
