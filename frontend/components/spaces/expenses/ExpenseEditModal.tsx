import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { confirmAction } from "@/lib/confirm";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { ExpenseDatePickerSheet } from "./ExpenseDatePickerSheet";

export type ExpenseEditModalProps = {
  entry: ExpenseEntry | null;
  onClose: () => void;
  onSave: (entry: ExpenseEntry) => void;
  onDelete: (id: string) => void;
};

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Astăzi";
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

/** Opened by tapping a row in ExpensesListSection -- was previously not
 * possible at all (rows were plain, non-pressable Views). Same fields
 * ExpensesAddBar collects (name, price, date, notes). */
export function ExpenseEditModal({ entry, onClose, onSave, onDelete }: ExpenseEditModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (entry) {
      setName(entry.name);
      setPrice(String(entry.price));
      setDate(entry.date);
      setNotes(entry.notes ?? "");
      setError("");
    }
  }, [entry]);

  const parsedPrice = Number(price.replace(",", "."));
  const canSubmit = name.trim().length > 0 && price.trim().length > 0 && !Number.isNaN(parsedPrice) && parsedPrice >= 0;

  const handleSave = () => {
    if (!entry) return;
    if (!canSubmit) {
      setError("Introdu un nume și un preț valid.");
      return;
    }
    onSave({ ...entry, name: name.trim(), price: parsedPrice, date, notes: notes.trim() || undefined });
  };

  const handleDelete = async () => {
    if (!entry) return;
    const confirmed = await confirmAction(
      "Șterge cheltuiala",
      `Ștergi "${entry.name}" definitiv?`,
      { confirmLabel: "Șterge", destructive: true },
    );
    if (confirmed) onDelete(entry.id);
  };

  return (
    <Modal visible={!!entry} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            maxHeight: "85%",
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                alignSelf: "center",
              }}
            />

            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface }}>Editează cheltuiala</Text>

            <TextInput
              testID="expense-edit-name"
              value={name}
              onChangeText={setName}
              placeholder="What did you buy?"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={{
                height: 48,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.onSurface,
                fontSize: 14,
              }}
            />

            <TextInput
              testID="expense-edit-price"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="Price"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={{
                height: 48,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.onSurface,
                fontSize: 14,
              }}
            />

            <Pressable
              testID="expense-edit-date"
              onPress={() => setDatePickerVisible(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                height: 48,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 14, color: colors.onSurface }}>{date ? formatShortDate(date) : ""}</Text>
              <Ionicons name="calendar-outline" size={16} color={colors.onSurfaceTertiary} />
            </Pressable>

            <TextInput
              testID="expense-edit-notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Notă (opțional)"
              placeholderTextColor={colors.onSurfaceTertiary}
              multiline
              style={{
                minHeight: 60,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.onSurface,
                fontSize: 14,
                textAlignVertical: "top",
              }}
            />

            {error ? <Text style={{ fontSize: 12, color: colors.error }}>{error}</Text> : null}

            <Pressable
              testID="expense-edit-save"
              onPress={handleSave}
              style={{
                height: 50,
                borderRadius: radius.sm,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.surface }}>Salvează</Text>
            </Pressable>

            <Pressable
              testID="expense-edit-delete"
              onPress={handleDelete}
              style={{ height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Șterge</Text>
            </Pressable>
          </ScrollView>
        </View>

        {datePickerVisible ? (
          <ExpenseDatePickerSheet
            value={date}
            onCancel={() => setDatePickerVisible(false)}
            onSelect={(picked) => {
              setDate(picked);
              setDatePickerVisible(false);
            }}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
