import React, { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/primitives";
import { PressableScale } from "@/components/ui/PressableScale";
import { motion } from "@/lib/motion";
import { roCount, roUnit, parseLocaleNumber } from "@/lib/format";

export type SupplySuggestion = {
  /** The Home supply's own item id -- carried through so the added
   * grocery item can be linked back to it (see GroceryDashboard.tsx's
   * handleAddSuggestion / linkedSupplyId). */
  id: string;
  name: string;
  unit: string;
  /** Prefill for the quantity input -- the supply's last known
   * quantity, since that's usually close to what gets bought again. */
  defaultQuantity: number;
  /** Whole days since the estimated restock point, rounded -- shown as
   * "probabil de ~N zile" so it reads as a pattern-based guess, not a
   * hard fact. */
  overdueByDays: number;
};

export type GrocerySuggestionModalProps = {
  visible: boolean;
  suggestions: SupplySuggestion[];
  onAdd: (supplyId: string, name: string, quantity: number) => void;
  onClose: () => void;
};

/**
 * Shown the first time a list crosses 80% checked into cart, if any
 * tracked Home supply looks like it's probably running low (see
 * getSupplyRestockEstimate, read cross-space from Home) and isn't
 * already on this list -- see GroceryDashboard.tsx's handleToggle.
 * Adding a suggestion asks how much is being bought (the quantity
 * matters for getSupplyRestockEstimate's rate calculation) before
 * calling the same handleAdd every other "add a product" entry point in
 * Grocery uses -- linked back to this supply (linkedSupplyId) so it logs
 * a real restock if it's still in cart when "Finalizează cumpărăturile"
 * is tapped (see handleFinishShopping). Auto-closes once nothing is
 * left to suggest -- see GroceryDashboard's useEffect.
 */
/** Home supplies probably running low, offered while shopping -- the
 * shared Sheet, one row per supply with an editable quantity and a "+". */
export function GrocerySuggestionModal({ visible, suggestions, onAdd, onClose }: GrocerySuggestionModalProps) {
  const { spacing } = useTheme();
  const GROC = useSpaceColors("grocery").color;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      info="grocery.suggestions"
      title="Probabil pe terminate"
      subtitle="Din ritmul în care cumperi proviziile din Casă"
      icon="basket-outline"
      tone={GROC}
      footer={<Button variant="secondary" label="Nu acum" onPress={onClose} />}
    >
      <View style={{ gap: spacing.sm }}>
        {suggestions.map((s) => (
          <SuggestionRow key={s.id} suggestion={s} onAdd={onAdd} />
        ))}
      </View>
    </Sheet>
  );
}

function SuggestionRow({
  suggestion,
  onAdd,
}: {
  suggestion: SupplySuggestion;
  onAdd: (supplyId: string, name: string, quantity: number) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const [quantity, setQuantity] = useState(String(suggestion.defaultQuantity || 1));
  const groc = useSpaceColors("grocery");
  const GROC = groc.color;

  const handleAdd = () => {
    const value = parseLocaleNumber(quantity);
    onAdd(suggestion.id, suggestion.name, Number.isFinite(value) && value > 0 ? value : 1);
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceTertiary }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{suggestion.name}</Text>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 }}>
          {suggestion.overdueByDays > 0 ? `Probabil de ~${roCount(suggestion.overdueByDays, "zi", "zile")}` : "Cam acum, după ritmul tău"}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", height: 40, borderRadius: radius.inner, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.sm }}>
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          textAlign="center"
          accessibilityLabel={`Cantitate ${suggestion.name}`}
          style={[{ width: 36, fontSize: 15, fontWeight: "600", color: colors.onSurface, paddingVertical: 0 }, { outlineStyle: "none" } as any]}
        />
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{roUnit(suggestion.unit)}</Text>
      </View>
      <PressableScale
        onPress={handleAdd}
        scaleTo={motion.scale.control}
        accessibilityRole="button"
        accessibilityLabel={`Adaugă ${suggestion.name}`}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: GROC, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name="add" size={20} color={groc.ink} />
      </PressableScale>
    </View>
  );
}
