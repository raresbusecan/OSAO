import React, { useState } from "react";
import { roDate } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, FieldButton } from "@/components/ui/primitives";
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
  if (d.toDateString() === now.toDateString()) return "Azi";
  return roDate(d);
}

/**
 * Edit one expense -- the shared Sheet. The body is keyed by entry.id,
 * so every open starts from that entry's saved values (no stale
 * prefill from the previous one).
 */
export function ExpenseEditModal({ entry, onClose, onSave, onDelete }: ExpenseEditModalProps) {
  if (!entry) return null;
  return <ExpenseEditSheet key={entry.id} entry={entry} onClose={onClose} onSave={onSave} onDelete={onDelete} />;
}

function ExpenseEditSheet({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: ExpenseEntry;
  onClose: () => void;
  onSave: (entry: ExpenseEntry) => void;
  onDelete: (id: string) => void;
}) {
  const TEAL = SPACE_IDENTITY_COLORS.expenses!;
  const [name, setName] = useState(entry.name);
  const [price, setPrice] = useState(String(entry.price));
  const [date, setDate] = useState(entry.date);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [error, setError] = useState("");

  const parsedPrice = Number(price.replace(",", "."));
  const canSubmit = name.trim().length > 0 && price.trim().length > 0 && !Number.isNaN(parsedPrice) && parsedPrice >= 0;

  const handleSave = () => {
    if (!canSubmit) {
      setError("Introdu un nume și un preț valid.");
      return;
    }
    onSave({ ...entry, name: name.trim(), price: parsedPrice, date, notes: notes.trim() || undefined });
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction("Ștergi cheltuiala?", `„${entry.name}” se șterge definitiv.`, { confirmLabel: "Șterge", destructive: true });
    if (confirmed) onDelete(entry.id);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Editează cheltuiala"
      icon="receipt-outline"
      tone={TEAL}
      footer={
        <>
          <Button testID="expense-edit-save" label="Salvează" tone={TEAL} onPress={handleSave} />
          <Button testID="expense-edit-delete" variant="ghost" icon="trash-outline" label="Șterge cheltuiala" onPress={handleDelete} />
        </>
      }
    >
      <Field testID="expense-edit-name" label="Ce ai cumpărat" value={name} onChangeText={setName} placeholder="ex. Geacă de iarnă" tone={TEAL} />
      <Field testID="expense-edit-price" label="Preț" value={price} onChangeText={setPrice} keyboardType="decimal-pad" big suffix="lei" tone={TEAL} error={error || null} />
      <FieldButton testID="expense-edit-date" label="Data" value={date ? formatShortDate(date) : null} onPress={() => setDatePickerVisible(true)} />
      <Field testID="expense-edit-notes" label="Notă (opțional)" value={notes} onChangeText={setNotes} placeholder="Orice detaliu util" multiline tone={TEAL} />

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
    </Sheet>
  );
}
