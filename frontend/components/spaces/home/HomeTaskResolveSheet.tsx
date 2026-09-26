import React, { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";

import type { HomeTaskEntry } from "@/lib/spaces/home/home.types";
import { nextTaskOccurrence } from "@/lib/spaces/home/calculations/dashboard.calculations";
import { HomeDatePickerSheet } from "@/components/spaces/home/HomeDatePickerSheet";

export type HomeTaskResolveSheetProps = {
  entry: HomeTaskEntry;
  onCancel: () => void;
  /** price is undefined for a non-purchase task, or when "Rezolvă fără
   * preț" is tapped (still resolves, just never counts as spend).
   * nextDueDate is only meaningful for a recurring task -- undefined for
   * a plain one, since it just archives instead of getting a next date. */
  onResolve: (price: number | undefined, nextDueDate: string | undefined) => void;
};

/** Opened for a purchase task's checkbox tap (asks for the price) and,
 * always, for a row tapped from HomeRecurringWarningsPage (asks to
 * confirm/adjust the next due date) -- see HomeDashboard. Only those two
 * fields are editable here; everything else about the task (title,
 * notes, toggles) stays exactly as it was set on HomeTaskForm. */
export function HomeTaskResolveSheet({ entry, onCancel, onResolve }: HomeTaskResolveSheetProps) {
  const { colors, spacing, radius } = useTheme();
  const [price, setPrice] = useState("");
  const [nextDueDate, setNextDueDate] = useState<string | undefined>(
    entry.isRecurring ? nextTaskOccurrence(entry.dueDate, entry.recurrenceFrequency) : undefined,
  );
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [error, setError] = useState("");

  const resolveWith = (value: number | undefined) => onResolve(value, nextDueDate);

  const handleResolve = () => {
    if (!entry.isPurchase) {
      resolveWith(undefined);
      return;
    }
    if (!price.trim()) {
      setError("Introdu un preț sau alege „Rezolvă fără preț”.");
      return;
    }
    const value = Number(price.replace(",", "."));
    if (Number.isNaN(value) || value < 0) {
      setError("Preț invalid.");
      return;
    }
    // 0 is a syntactically valid number but not a real price -- forces
    // the explicit "Rezolvă fără preț" path instead of silently logging
    // a 0-RON purchase (which would still count as "priced" downstream,
    // e.g. showing up in spend totals as a real, if zero, entry).
    if (value === 0) {
      setError("Introdu un preț real sau alege „Rezolvă fără preț”.");
      return;
    }
    resolveWith(value);
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
                    // Same tinted-chip pattern as HomeTaskForm/HomeSupplyForm's
                    // header chips -- this sheet was the one missed spot.
                    backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={entry.isPurchase ? "cart-outline" : "checkmark-circle-outline"} size={16} color={SPACE_IDENTITY_COLORS.home} />
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface }}>
                  Marchează ca rezolvat
                </Text>
              </View>

              {/* Explicit exit -- backdrop-tap-only dismiss wasn't
                  discoverable enough; this is the same "way out without
                  resolving" every other modal/sheet in the app gets. */}
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
              {entry.title}
            </Text>

            {entry.isPurchase ? (
              <>
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
                    Intră în totalul de cheltuieli al lunii, exact ca o factură recurentă plătită.
                  </Text>
                )}
              </>
            ) : null}

            {entry.isRecurring ? (
              <>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
                  Următoarea dată
                </Text>
                <Pressable
                  onPress={() => setDatePickerVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Choose next due date"
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
                  <Text style={{ fontSize: 15, color: colors.onSurface }}>
                    {nextDueDate
                      ? new Date(nextDueDate).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })
                      : "Fără dată"}
                  </Text>
                  <Ionicons name="calendar-outline" size={18} color={colors.onSurfaceTertiary} />
                </Pressable>
              </>
            ) : null}

            <Pressable
              onPress={handleResolve}
              accessibilityRole="button"
              accessibilityLabel="Rezolvă task-ul"
              style={{
                height: 52,
                borderRadius: radius.md,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: entry.isPurchase ? spacing.sm : 0,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>Rezolvă task-ul</Text>
            </Pressable>

            {entry.isPurchase ? (
              <Pressable
                onPress={() => resolveWith(undefined)}
                accessibilityRole="button"
                accessibilityLabel="Rezolvă fără preț"
                style={{ height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                  Rezolvă fără preț
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>

        {datePickerVisible ? (
          <HomeDatePickerSheet
            value={nextDueDate}
            onCancel={() => setDatePickerVisible(false)}
            onSelect={(picked) => {
              setNextDueDate(picked);
              setDatePickerVisible(false);
            }}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
