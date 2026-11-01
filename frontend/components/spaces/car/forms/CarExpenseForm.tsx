import { useRecordMutation } from "@/lib/navigation/useRecordMutation";
import React, { useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Pill } from "@/components/ui/primitives";
import { GuiltFreeToggle } from "@/components/dashboard/GuiltFree";

import { confirmAction } from "@/lib/confirm";

import type { CarExpenseEntry } from "@/lib/spaces/car/car.types";
import { formatDateInput, isValidDateInput, parseDateInput } from "@/lib/spaces/car/utils/dateInput";
import { parseLocaleNumber } from "@/lib/format";

type CarExpenseFormProps = {
  onCancel: () => void;
  onSave: (entry: CarExpenseEntry) => void;
  /** Pass an existing entry to edit it instead of creating a new one. */
  entry?: CarExpenseEntry;
  /** Only meaningful while editing -- deletes this entry entirely. */
  onDelete?: () => void;
};

// Stored as typed (free text) -- older entries may still carry the
// earlier English names, which simply show as-is.
const EXPENSE_CATEGORIES = ["Parcare", "Amenzi", "Spălătorie", "Accesorii", "Taxe de drum", "Altele"];

export default function CarExpenseForm({
  onCancel,
  onSave,
  entry,
  onDelete,
}: CarExpenseFormProps) {
  const mutation = useRecordMutation();
  const isEditing = entry !== undefined;

  const { colors, spacing, radius } = useTheme();
  const carColors = useSpaceColors("car");
  const CAR = carColors.color;

  const [category, setCategory] = useState(entry?.category ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [odometer, setOdometer] = useState(entry?.odometer !== undefined ? String(entry.odometer) : "");
  const [provider, setProvider] = useState(entry?.provider ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [guiltFree, setGuiltFree] = useState(!!entry?.guiltFree);

  // Defaults to today -- an expense gets logged the day it happens most
  // of the time, but a receipt from earlier in the week shouldn't have
  // to become "today's" entry just because that's when you got around
  // to logging it.
  const [date, setDate] = useState(formatDateInput(entry?.date ?? new Date()));


  const [error, setError] = useState("");

  const handleCategorySelect = (item: string) => {
    if (!title || title === category) {
      setTitle(item);
    }
    setCategory(item);
  };

  const handleSave = () => mutation.run(async () => {
    setError("");

    const amountValue = parseLocaleNumber(amount);

    const odometerValue = odometer
      ? parseLocaleNumber(odometer)
      : undefined;

    if (
      !amount ||
      Number.isNaN(amountValue) ||
      amountValue <= 0
    ) {
      setError("Introdu o sumă validă.");
      return;
    }

    // The server requires a title; the category stands in for an empty one.
    // Without either, the save used to fail with a server error after the entry had
    // already flashed into the list.
    if (!title.trim() && !category.trim()) {
      setError("Alege o categorie sau scrie un titlu.");
      return;
    }

    if (
      odometer &&
      (odometerValue === undefined ||
        Number.isNaN(odometerValue) ||
        odometerValue <= 0)
    ) {
      setError("Introdu un kilometraj valid.");
      return;
    }

    if (!isValidDateInput(date)) {
      setError("Alege data.");
      return;
    }

    const entryToSave: CarExpenseEntry = {
      id: entry?.id ?? `expense-${Date.now()}`,
      date: parseDateInput(date) ?? entry?.date ?? new Date().toISOString(),
      category: category.trim(),
      // A picked category with the title cleared still needs a title server-side.
      title: title.trim() || category.trim(),
      amount: amountValue,
      odometer: odometerValue,
      provider: provider.trim() || undefined,
      notes: notes.trim() || undefined,
      guiltFree,
    };

    await onSave(entryToSave);
  });

  const handleDelete = () => mutation.run(async () => {
    const confirmed = await confirmAction("Ștergi cheltuiala?", "Se șterge definitiv.", { confirmLabel: "Șterge", destructive: true });
    if (confirmed) await onDelete?.();
  });

  return (
    <Sheet
      visible
      onClose={() => { if (mutation.canClose()) onCancel(); }}
      info="car.expenseForm"
      title={isEditing ? "Editează cheltuiala" : "Cheltuială nouă"}
      subtitle="Doar suma e obligatorie"
      icon="receipt-outline"
      tone={CAR}
      footer={
        <>
          <Button testID="car-expense-save" label={isEditing ? "Salvează" : "Salvează cheltuiala"} tone={carColors.fill} disabled={mutation.busy} onPress={handleSave} />
          {isEditing && onDelete ? <Button variant="ghost" icon="trash-outline" label="Șterge cheltuiala" disabled={mutation.busy} onPress={handleDelete} /> : null}
        </>
      }
    >
      <Field label="Sumă" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" big suffix="lei" tone={CAR} />

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Categorie</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {EXPENSE_CATEGORIES.map((item) => (
            <Pill key={item} label={item} active={category === item} tone={CAR} onPress={() => handleCategorySelect(item)} />
          ))}
        </View>
      </View>

      <Field label="Titlu (opțional)" value={title} onChangeText={setTitle} placeholder="ex. Parcare aeroport" tone={CAR} />

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <DateField testID="car-expense-date" label="Data" value={date} onChange={setDate} range="past" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Kilometraj (opțional)" value={odometer} onChangeText={setOdometer} placeholder="ex. 124580" keyboardType="number-pad" suffix="km" tone={CAR} />
        </View>
      </View>

      <Field label="Furnizor (opțional)" value={provider} onChangeText={setProvider} placeholder="ex. Parcările Cluj" tone={CAR} />
      <Field label="Notițe (opțional)" value={notes} onChangeText={setNotes} placeholder="Orice detaliu util" multiline tone={CAR} />
      <GuiltFreeToggle value={guiltFree} onChange={setGuiltFree} tone={CAR} testID="car-expense-guilt-free" />

      {error ? (
        <View style={{ padding: spacing.md, borderRadius: radius.control, backgroundColor: `${colors.error}14` }}>
          <Text style={{ fontSize: 14, color: colors.error }}>{error}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}
