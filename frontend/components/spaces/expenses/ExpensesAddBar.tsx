import React, { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, SPACE_ON_FILL } from "@/lib/spaces/spaceProfile";
import { PressableScale } from "@/components/ui/PressableScale";
import { Field, FieldButton } from "@/components/ui/primitives";
import { motion } from "@/lib/motion";
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
  if (d.toDateString() === now.toDateString()) return "Azi";
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long" });
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

  const TEAL = SPACE_IDENTITY_COLORS.expenses!;
  const input = {
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    fontSize: 15,
  } as const;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <TextInput
          testID="expenses-add-name"
          value={name}
          onChangeText={setName}
          onSubmitEditing={submit}
          returnKeyType="done"
          placeholder="Ce ai cumpărat?"
          placeholderTextColor={colors.onSurfaceTertiary}
          accessibilityLabel="Ce ai cumpărat"
          style={{ ...input, flex: 1, minWidth: 0 }}
        />
        <TextInput
          testID="expenses-add-price"
          value={price}
          onChangeText={setPrice}
          onSubmitEditing={submit}
          returnKeyType="done"
          keyboardType="decimal-pad"
          placeholder="Preț"
          placeholderTextColor={colors.onSurfaceTertiary}
          accessibilityLabel="Preț în lei"
          style={{ ...input, width: 92, paddingHorizontal: spacing.md }}
        />
        <PressableScale
          testID="expenses-add-button"
          onPress={submit}
          disabled={!canSubmit}
          scaleTo={motion.scale.control}
          accessibilityRole="button"
          accessibilityLabel="Adaugă cheltuiala"
          style={{ width: 52, height: 52, borderRadius: radius.control, backgroundColor: canSubmit ? TEAL : `${TEAL}55`, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="add" size={24} color={SPACE_ON_FILL.expenses} />
        </PressableScale>
      </View>

      <Pressable
        testID="expenses-add-toggle-details"
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 40 }}
      >
        <Ionicons name={expanded ? "remove" : "add"} size={15} color={colors.onSurfaceTertiary} />
        <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{expanded ? "Ascunde detaliile" : "Dată sau notă"}</Text>
      </Pressable>

      {expanded ? (
        <View style={{ gap: spacing.sm }}>
          <FieldButton testID="expenses-add-date" label="Data" value={formatShortDate(date)} onPress={() => setDatePickerVisible(true)} />
          <Field testID="expenses-add-notes" label="Notă (opțional)" value={notes} onChangeText={setNotes} placeholder="Orice detaliu util" multiline tone={TEAL} />
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
