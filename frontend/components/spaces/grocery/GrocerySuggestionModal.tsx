import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";

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
export function GrocerySuggestionModal({ visible, suggestions, onAdd, onClose }: GrocerySuggestionModalProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
        <Pressable onPress={onClose} style={{ ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" }} />

        <View
          style={{
            width: "100%",
            maxWidth: 380,
            maxHeight: "80%",
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            padding: spacing.xl,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.md,
                  backgroundColor: `${SPACE_IDENTITY_COLORS.grocery}1A`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="basket-outline" size={16} color={SPACE_IDENTITY_COLORS.grocery} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface }}>Probabil pe terminate</Text>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="close" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <Text style={{ fontSize: 12.5, color: colors.onSurfaceTertiary, marginBottom: spacing.lg, lineHeight: 17 }}>
            Pe baza tiparului tău de cumpărare din Home → Supplies, s-ar putea să ai nevoie de:
          </Text>

          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: spacing.sm }}>
              {suggestions.map((s) => (
                <SuggestionRow key={s.id} suggestion={s} onAdd={onAdd} />
              ))}
            </View>
          </ScrollView>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Nu acum"
            style={{ marginTop: spacing.lg, minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>Nu acum</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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

  const handleAdd = () => {
    const value = Number(quantity.replace(",", "."));
    onAdd(suggestion.id, suggestion.name, Number.isFinite(value) && value > 0 ? value : 1);
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.sm,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "700", color: colors.onSurface }} numberOfLines={1}>
          {suggestion.name}
        </Text>
        <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginTop: 2 }}>
          {suggestion.overdueByDays > 0 ? `Probabil de ~${suggestion.overdueByDays} zile` : "Chiar acum, după tipar"}
        </Text>
      </View>

      <View
        style={{
          width: 52,
          height: 36,
          borderRadius: radius.sm,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          textAlign="center"
          style={[
            { width: "100%", fontSize: 13.5, fontWeight: "700", color: colors.onSurface, paddingVertical: 0 },
            { outlineStyle: "none" } as any,
          ]}
        />
      </View>
      <Text style={{ fontSize: 11, color: colors.onSurfaceTertiary, width: 30 }} numberOfLines={1}>
        {suggestion.unit}
      </Text>

      <Pressable
        onPress={handleAdd}
        accessibilityRole="button"
        accessibilityLabel={`Add ${suggestion.name}`}
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.pill,
          backgroundColor: colors.onSurface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="add" size={18} color={colors.surface} />
      </Pressable>
    </View>
  );
}
