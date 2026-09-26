import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { ExpenseDatePickerSheet } from "./ExpenseDatePickerSheet";

export type ExpensesAddBarDraft = {
  name: string;
  price: number;
  date: string;
  notes?: string;
};

export type ExpensesAddBarProps = {
  onAdd: (draft: ExpensesAddBarDraft) => void;
};

function todayIso(): string {
  return new Date().toISOString();
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Astăzi";
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

/**
 * Name + price stay the fast, always-visible path -- "What did you
 * buy?" + submit. Date/notes stay collapsed behind "Add details", since
 * backdating or annotating an entry is the occasional case, not the
 * common one.
 */
export function ExpensesAddBar({ onAdd }: ExpensesAddBarProps) {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const parsedPrice = Number(price.replace(",", "."));
  const canSubmit = name.trim().length > 0 && price.trim().length > 0 && !Number.isNaN(parsedPrice) && parsedPrice >= 0;

  const reset = () => {
    setName("");
    setPrice("");
    setDate(todayIso());
    setNotes("");
    setExpanded(false);
  };

  const submit = () => {
    if (!canSubmit) return;
    onAdd({ name: name.trim(), price: parsedPrice, date, notes: notes.trim() || undefined });
    reset();
  };

  return (
    <View style={{ marginBottom: spacing.xl, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <TextInput
          testID="expenses-add-name"
          value={name}
          onChangeText={setName}
          onSubmitEditing={submit}
          returnKeyType="done"
          placeholder="What did you buy?"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={{
            flex: 1,
            // Without this, a flex item on web defaults to
            // min-width: auto -- it refuses to shrink below its content's
            // natural width instead of respecting the row's actual
            // available space.
            minWidth: 0,
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
          testID="expenses-add-price"
          value={price}
          onChangeText={setPrice}
          onSubmitEditing={submit}
          returnKeyType="done"
          keyboardType="decimal-pad"
          placeholder="Price"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={{
            width: 78,
            height: 48,
            paddingHorizontal: spacing.md,
            borderRadius: radius.sm,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.onSurface,
            fontSize: 14,
          }}
        />

        <Pressable
          testID="expenses-add-button"
          onPress={submit}
          disabled={!canSubmit}
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.sm,
            // Expenses' identity color, same fill treatment as
            // Grocery's own quick-add button. Fixed dark icon (not
            // colors.surface/white): teal fails contrast against white
            // (~2.5:1, under WCAG's 3:1 minimum for graphical objects),
            // same issue Grocery's amber had.
            backgroundColor: SPACE_IDENTITY_COLORS.expenses,
            borderWidth: 0,
            alignItems: "center",
            justifyContent: "center",
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          <Ionicons name="add" size={22} color="#111111" />
        </Pressable>
      </View>

      <Pressable
        testID="expenses-add-toggle-details"
        onPress={() => setExpanded((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
      >
        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>
          {expanded ? "Ascunde detaliile" : "Adaugă detalii (dată, notă)"}
        </Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={12} color={colors.onSurfaceTertiary} />
      </Pressable>

      {expanded ? (
        <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border }}>
          <Pressable
            testID="expenses-add-date"
            onPress={() => setDatePickerVisible(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              height: 44,
              paddingHorizontal: spacing.md,
              borderRadius: radius.sm,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 13.5, color: colors.onSurface }}>{formatShortDate(date)}</Text>
            <Ionicons name="calendar-outline" size={16} color={colors.onSurfaceTertiary} />
          </Pressable>

          <TextInput
            testID="expenses-add-notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Notă (opțional)"
            placeholderTextColor={colors.onSurfaceTertiary}
            multiline
            style={{
              minHeight: 44,
              paddingHorizontal: spacing.md,
              paddingVertical: 10,
              borderRadius: radius.sm,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.onSurface,
              fontSize: 13.5,
              textAlignVertical: "top",
            }}
          />
        </View>
      ) : null}

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
    </View>
  );
}
