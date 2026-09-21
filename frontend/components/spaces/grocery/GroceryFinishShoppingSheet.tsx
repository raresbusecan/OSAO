import React, { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

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
    const value = Number(price.replace(",", "."));
    if (Number.isNaN(value) || value < 0) {
      setError("Preț invalid.");
      return;
    }
    confirmWith(value);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable
          onPress={onCancel}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.lg + 4,
              borderTopRightRadius: radius.lg + 4,
              padding: spacing.xl,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                alignSelf: "center",
                marginBottom: spacing.lg,
              }}
            />

            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark-done-outline" size={16} color={colors.onSurface} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface }}>
                Finalizează cumpărăturile
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginLeft: 42, marginBottom: spacing.xl }} numberOfLines={1}>
              {listName}
            </Text>

            {linkedSupplyCount > 0 ? (
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
                  marginBottom: spacing.lg,
                }}
              >
                <Ionicons name="basket-outline" size={16} color={colors.onSurfaceTertiary} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 16 }}>
                  {linkedSupplyCount === 1
                    ? "1 produs actualizează un supply din Home."
                    : `${linkedSupplyCount} produse actualizează supplies din Home.`}
                </Text>
              </View>
            ) : null}

            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
              Cât a costat coșul? (opțional)
            </Text>
            <View
              style={{
                height: 56,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 2,
                borderColor: colors.onSurface,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.md,
                marginBottom: spacing.sm,
              }}
            >
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="0"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="decimal-pad"
                autoFocus
                style={[
                  { flex: 1, fontSize: 20, fontWeight: "700", color: colors.onSurface, paddingVertical: 0, borderWidth: 0 },
                  Platform.OS === "web" && ({ outlineStyle: "none" } as any),
                ]}
              />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary }}>RON</Text>
            </View>

            {error ? (
              <Text style={{ fontSize: 12, color: colors.error, marginBottom: spacing.sm }}>{error}</Text>
            ) : (
              <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginBottom: spacing.lg, lineHeight: 16 }}>
                Intră în bugetul lunar, la categoria Grocery.
              </Text>
            )}

            <Pressable
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel="Confirmă finalizarea"
              style={{
                height: 52,
                borderRadius: radius.md,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>Finalizează</Text>
            </Pressable>

            <Pressable
              onPress={() => confirmWith(undefined)}
              accessibilityRole="button"
              accessibilityLabel="Finalizează fără preț"
              style={{ height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                Finalizează fără preț
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
