import { useRecordMutation } from "@/lib/navigation/useRecordMutation";
import React, { useState } from "react";
import { roDate } from "@/lib/format";
import { confirmAction } from "@/lib/confirm";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Disclosure, Field, FieldButton } from "@/components/ui/primitives";
import { ExpenseDatePickerSheet } from "./ExpenseDatePickerSheet";
import { GuiltFreeToggle } from "@/components/dashboard/GuiltFree";

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
  const mutation = useRecordMutation();
  const TEAL = useSpaceColors("expenses").color;
  const [name, setName] = useState(entry.name);
  const [price, setPrice] = useState(String(entry.price));
  const [date, setDate] = useState(entry.date);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [guiltFree, setGuiltFree] = useState(!!entry.guiltFree);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [moreOpen, setMoreOpen] = useState(!!entry.notes);
  const [error, setError] = useState("");

  const parsedPrice = Number(price.replace(",", "."));
  const canSubmit = name.trim().length > 0 && price.trim().length > 0 && !Number.isNaN(parsedPrice) && parsedPrice >= 0;

  const handleSave = () => mutation.run(async () => {
    if (!canSubmit) {
      setError("Introdu un nume și un preț valid.");
      return;
    }
    await onSave({ ...entry, name: name.trim(), price: parsedPrice, date, notes: notes.trim() || undefined, guiltFree });
  });

  const handleDelete = () => mutation.run(async () => {
    const confirmed = await confirmAction("Ștergi cheltuiala?", `„${entry.name}” se șterge definitiv.`, { confirmLabel: "Șterge", destructive: true });
    if (confirmed) await onDelete(entry.id);
  });

  return (
    <Sheet
      visible
      onClose={() => { if (mutation.canClose()) onClose(); }}
      info="expenses.edit"
      title="Editează cheltuiala"
      icon="receipt-outline"
      tone={TEAL}
      footer={
        <>
          <Button testID="expense-edit-save" label="Salvează" tone={TEAL} disabled={mutation.busy} onPress={handleSave} />
          <Button testID="expense-edit-delete" variant="ghost" icon="trash-outline" label="Șterge cheltuiala" disabled={mutation.busy} onPress={handleDelete} />
        </>
      }
    >
      <Field testID="expense-edit-name" label="Ce ai cumpărat" value={name} onChangeText={setName} placeholder="ex. Geacă de iarnă" tone={TEAL} />
      <Field testID="expense-edit-price" label="Preț" value={price} onChangeText={setPrice} keyboardType="decimal-pad" big suffix="lei" tone={TEAL} error={error || null} />
      <FieldButton testID="expense-edit-date" label="Data" value={date ? formatShortDate(date) : null} onPress={() => setDatePickerVisible(true)} />
      <GuiltFreeToggle testID="expense-edit-guilt-free" value={guiltFree} onChange={setGuiltFree} tone={TEAL} />
      <Disclosure label="Adaugă o notă" open={moreOpen} onToggle={() => setMoreOpen((v) => !v)} />
      {moreOpen ? (
        <Field testID="expense-edit-notes" label="Notă" value={notes} onChangeText={setNotes} placeholder="Orice detaliu util" multiline tone={TEAL} />
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
    </Sheet>
  );
}
