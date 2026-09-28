import React, { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";

import type { HomeMaintenanceEntry } from "@/lib/spaces/home/home.types";
import { addRecurrenceInterval } from "@/components/spaces/home/homeCategoryConfig";

export type HomeMaintenanceResolveSheetProps = {
  entry: HomeMaintenanceEntry;
  onCancel: () => void;
  /** Always a real, non-zero price -- unlike Tasks, every Maintenance
   * entry already has one (the form field is required), so there's no
   * "resolve without a price" escape hatch here, just confirming or
   * correcting the amount this cycle actually cost. */
  onResolve: (price: number) => void;
};

/**
 * Opened only for a RECURRING Maintenance entry's resolve action (see
 * HomeDashboard's resolveCategoryEntry) -- nothing previously asked for
 * a fresh price on repeat visits, so every resolve silently kept the
 * entry's ORIGINAL price forever, and the "this month" spend total never
 * grew past the first visit. Pre-fills with the entry's last known price
 * (most repeat services cost about the same), editable in case this
 * cycle's bill was different. Mirrors HomeTaskResolveSheet's layout, one
 * field simpler (no next-date override -- Maintenance's own
 * addRecurrenceInterval schedule isn't user-adjustable here, only shown
 * as a preview).
 */
export function HomeMaintenanceResolveSheet({ entry, onCancel, onResolve }: HomeMaintenanceResolveSheetProps) {
  const { colors, spacing, radius } = useTheme();
  const [price, setPrice] = useState(entry.price ? String(entry.price) : "");
  const [error, setError] = useState("");

  const nextDueDate = addRecurrenceInterval(
    entry.nextDueDate || entry.date,
    entry.recurrenceFrequency ?? "monthly",
    entry.recurrenceInterval ?? 1,
  );
  const nextDueLabel = new Date(nextDueDate).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const handleResolve = () => {
    if (!price.trim()) {
      setError("Introdu prețul plătit.");
      return;
    }
    const value = Number(price.replace(",", "."));
    if (Number.isNaN(value) || value <= 0) {
      setError("Preț invalid.");
      return;
    }
    onResolve(value);
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

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.md,
                    backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="construct-outline" size={16} color={SPACE_IDENTITY_COLORS.home} />
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface }}>
                  Marchează ca rezolvat
                </Text>
              </View>

              <Pressable
                onPress={onCancel}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.pill,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.error,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={18} color={colors.error} />
              </Pressable>
            </View>

            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginLeft: 42, marginBottom: spacing.xl }} numberOfLines={1}>
              {entry.service}
            </Text>

            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
              Preț plătit
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
                Intră în totalul de cheltuieli al lunii, separat de vizitele anterioare.
              </Text>
            )}

            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
              Următoarea dată
            </Text>
            <View
              style={{
                minHeight: 52,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: spacing.md,
                marginBottom: spacing.lg,
              }}
            >
              <Text style={{ fontSize: 15, color: colors.onSurface }}>{nextDueLabel}</Text>
              <Ionicons name="calendar-outline" size={18} color={colors.onSurfaceTertiary} />
            </View>

            <Pressable
              onPress={handleResolve}
              accessibilityRole="button"
              accessibilityLabel="Rezolvă mentenanța"
              style={{
                height: 52,
                borderRadius: radius.md,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>Rezolvă</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
