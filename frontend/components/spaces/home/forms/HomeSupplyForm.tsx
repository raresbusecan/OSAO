import React, { useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { confirmAction } from "@/lib/confirm";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";

import type { HomeSupplyEntry } from "@/lib/spaces/home/home.types";


type HomeSupplyFormProps = {
  onCancel: () => void;
  onSave: (entry: HomeSupplyEntry) => void;
  entry?: HomeSupplyEntry;
  onDelete?: () => void;
};

/** Add / edit a tracked supply -- the shared Sheet, opened over the
 * Provizii page. Restocks themselves are logged from that page, not
 * here; this only defines what's tracked. */
export default function HomeSupplyForm({ onCancel, onSave, entry, onDelete }: HomeSupplyFormProps) {
  const isEditing = entry !== undefined;
  const { spacing } = useTheme();
  const homeColors = useSpaceColors("home");
  const HOME = homeColors.color;

  const [name, setName] = useState(entry?.name ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [quantity, setQuantity] = useState(entry ? String(entry.quantity) : "1");
  const [unit, setUnit] = useState(entry?.unit ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [error, setError] = useState("");

  const handleSave = () => {
    setError("");
    if (!name.trim()) {
      setError("Dă un nume proviziei.");
      return;
    }
    const quantityValue = Number(quantity.replace(",", "."));
    if (!quantity.trim() || Number.isNaN(quantityValue) || quantityValue < 0) {
      setError("Introdu o cantitate validă.");
      return;
    }
    onSave({
      id: entry?.id ?? `supply-${Date.now()}`,
      name: name.trim(),
      category: category.trim() || "Altele",
      quantity: quantityValue,
      unit: unit.trim() || "buc",
      lastRestockedDate: entry?.lastRestockedDate,
      restockHistory: entry?.restockHistory,
      notes: notes.trim() || undefined,
    });
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction("Ștergi provizia?", "Se șterge definitiv, cu tot istoricul ei.", { confirmLabel: "Șterge", destructive: true });
    if (confirmed) onDelete?.();
  };

  return (
    <Sheet
      visible
      onClose={onCancel}
      info="home.supplyForm"
      title={isEditing ? "Editează provizia" : "Provizie nouă"}
      subtitle={isEditing ? undefined : "Ceva ce ții mereu în casă"}
      icon="basket-outline"
      tone={HOME}
      footer={
        <>
          <Button label={isEditing ? "Salvează" : "Adaugă provizia"} tone={homeColors.fill} onPress={handleSave} />
          {isEditing && onDelete ? <Button variant="ghost" icon="trash-outline" label="Șterge provizia" onPress={handleDelete} /> : null}
        </>
      }
    >
      <Field label="Nume" value={name} onChangeText={setName} placeholder="ex. Hârtie igienică" tone={HOME} error={error && !name.trim() ? error : null} />
      <Field label="Categorie (opțional)" value={category} onChangeText={setCategory} placeholder="ex. Baie" tone={HOME} />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Cantitate" value={quantity} onChangeText={setQuantity} placeholder="1" keyboardType="decimal-pad" tone={HOME} error={error && name.trim() ? error : null} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Unitate" value={unit} onChangeText={setUnit} placeholder="ex. role" tone={HOME} />
        </View>
      </View>
      <Field label="Notițe (opțional)" value={notes} onChangeText={setNotes} placeholder="Orice detaliu util" multiline tone={HOME} />
    </Sheet>
  );
}
