import React, { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

import type { HomeSupplyEntry } from "@/lib/spaces/home/home.types";

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
  const { colors, spacing, radius } = useTheme();
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
                <Ionicons name="refresh-outline" size={16} color={colors.onSurface} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface }}>Restock</Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginLeft: 42, marginBottom: spacing.xl }} numberOfLines={1}>
              {entry.name}
            </Text>

            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
              Cât ai cumpărat?
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
                value={quantity}
                onChangeText={setQuantity}
                placeholder="0"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="decimal-pad"
                autoFocus
                style={[
                  { flex: 1, fontSize: 20, fontWeight: "700", color: colors.onSurface, paddingVertical: 0, borderWidth: 0 },
                  Platform.OS === "web" && ({ outlineStyle: "none" } as any),
                ]}
              />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary }}>{entry.unit}</Text>
            </View>

            {error ? (
              <Text style={{ fontSize: 12, color: colors.error, marginBottom: spacing.sm }}>{error}</Text>
            ) : (
              <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginBottom: spacing.lg, lineHeight: 16 }}>
                Cantitatea contează pentru estimare -- perioada dintre restock-uri diferă în funcție de cât cumperi de fiecare dată.
              </Text>
            )}

            <Pressable
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel="Confirmă restock-ul"
              style={{
                height: 52,
                borderRadius: radius.md,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>Confirmă</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
