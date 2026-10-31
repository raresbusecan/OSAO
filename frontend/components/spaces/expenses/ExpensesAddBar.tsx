import React, { useState } from "react";
import { roDate, parseLocaleNumber } from "@/lib/format";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { PressableScale } from "@/components/ui/PressableScale";
import { Field, FieldButton, Disclosure } from "@/components/ui/primitives";
import { motion } from "@/lib/motion";
import { ExpenseDatePickerSheet } from "./ExpenseDatePickerSheet";

export type ExpensesAddBarDraft = {
  name: string;
  price: number;
  date: string;
  notes?: string;
};

export type ExpensesAddBarProps = {
  onAdd: (draft: ExpensesAddBarDraft) => void | Promise<unknown>;
};

function todayIso(): string {
  return new Date().toISOString();
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Azi";
  return roDate(d);
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

  const [saving, setSaving] = useState(false);

  const parsedPrice = parseLocaleNumber(price);
  const canSubmit = !saving && name.trim().length > 0 && price.trim().length > 0 && !Number.isNaN(parsedPrice) && parsedPrice >= 0;

  const reset = () => {
    setName("");
    setPrice("");
    setDate(todayIso());
    setNotes("");
    setExpanded(false);
  };

  // Cleared only once the save succeeded: a failed save (no internet) has
  // already told the user, and must not throw away what they typed.
  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), price: parsedPrice, date, notes: notes.trim() || undefined });
      reset();
    } catch {
      // keep the fields for a retry
    } finally {
      setSaving(false);
    }
  };

  const exp = useSpaceColors("expenses");
  const TEAL = exp.color;
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
          <Ionicons name="add" size={24} color={exp.ink} />
        </PressableScale>
      </View>

      <Disclosure testID="expenses-add-toggle-details" label="Dată sau notă" open={expanded} onToggle={() => setExpanded((v) => !v)} />

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
