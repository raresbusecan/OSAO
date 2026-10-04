import React, { useState } from "react";
import { SPACE_IDENTITY_COLORS, SPACE_BUTTON_FILL } from "@/lib/spaces/spaceProfile";
import { confirmAction } from "@/lib/confirm";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, FieldButton, Segmented, ToggleRow } from "@/components/ui/primitives";
import { roDate } from "@/lib/format";

import type { HomeTaskEntry } from "@/lib/spaces/home/home.types";
import { HomeDatePickerSheet } from "@/components/spaces/home/HomeDatePickerSheet";

const HOME = SPACE_IDENTITY_COLORS.home!;

type HomeTaskFormProps = {
  onCancel: () => void;
  onSave: (entry: HomeTaskEntry) => void;
  /** Pass an existing entry to edit it instead of creating a new one. */
  entry?: HomeTaskEntry;
  /** Only meaningful while editing -- deletes this entry entirely. */
  onDelete?: () => void;
};

/**
 * Add / edit a Home task -- the shared Sheet (spring in, drag the handle
 * down to dismiss). Due date is optional (not every task needs a
 * deadline) and picked from a day grid, so it's always a valid ISO
 * string or undefined. Price is never asked here, only when the task is
 * resolved (HomeTaskResolveSheet) -- the real cost isn't known yet.
 */
export default function HomeTaskForm({ onCancel, onSave, entry, onDelete }: HomeTaskFormProps) {
  const isEditing = entry !== undefined;

  const [title, setTitle] = useState(entry?.title ?? "");
  const [dueDate, setDueDate] = useState<string | undefined>(entry?.dueDate);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [isPurchase, setIsPurchase] = useState(entry?.isPurchase ?? false);
  const [isRecurring, setIsRecurring] = useState(entry?.isRecurring ?? false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<HomeTaskEntry["recurrenceFrequency"]>(entry?.recurrenceFrequency);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [error, setError] = useState("");

  const handleSave = () => {
    setError("");
    if (!title.trim()) {
      setError("Dă un nume task-ului.");
      return;
    }
    if (isRecurring && !recurrenceFrequency) {
      setError("Alege cât de des se repetă task-ul.");
      return;
    }

    onSave({
      id: entry?.id ?? `task-${Date.now()}`,
      title: title.trim(),
      dueDate,
      completed: entry?.completed ?? false,
      completedAt: entry?.completedAt,
      isPurchase,
      // Price is only ever set from the resolve sheet, never here.
      price: entry?.price,
      isRecurring,
      recurrenceFrequency: isRecurring ? recurrenceFrequency : undefined,
      notes: notes.trim() || undefined,
      // Preserved, never derived from this form -- only resolveTask
      // appends to this (see HomeDashboard.tsx).
      spendHistory: entry?.spendHistory,
    });
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction("Ștergi task-ul?", "Se șterge definitiv.", { confirmLabel: "Șterge", destructive: true });
    if (confirmed) onDelete?.();
  };

  return (
    <Sheet
      visible
      onClose={onCancel}
      title={isEditing ? "Editează task-ul" : "Task nou"}
      subtitle={isEditing ? undefined : "Un lucru de făcut prin casă"}
      icon="checkmark-circle-outline"
      tone={HOME}
      footer={
        <>
          <Button testID="home-task-save" label={isEditing ? "Salvează" : "Adaugă task-ul"} tone={SPACE_BUTTON_FILL.home} onPress={handleSave} />
          {isEditing && onDelete ? <Button variant="ghost" icon="trash-outline" label="Șterge task-ul" onPress={handleDelete} /> : null}
        </>
      }
    >
      <Field
        testID="home-task-title"
        label="Ce trebuie făcut"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          if (error) setError("");
        }}
        placeholder="ex. Scoate gunoiul"
        tone={HOME}
        error={error && !title.trim() ? error : null}
      />

      <FieldButton
        label="Termen (opțional)"
        value={dueDate ? roDate(dueDate, { withYear: true }) : null}
        placeholder="Fără dată"
        onPress={() => setDatePickerVisible(true)}
      />

      <ToggleRow
        icon="cart-outline"
        label="Implică o cumpărare"
        hint="Prețul îl introduci când îl marchezi ca rezolvat."
        value={isPurchase}
        onChange={setIsPurchase}
        tone={HOME}
      />

      <ToggleRow
        icon="repeat-outline"
        label="Se repetă"
        hint={isRecurring ? "Rămâne activ după rezolvare, gata pentru data următoare." : "Se arhivează când îl rezolvi."}
        value={isRecurring}
        onChange={setIsRecurring}
        tone={HOME}
      >
        <Segmented
          options={[
            { key: "daily", label: "Zilnic" },
            { key: "weekly", label: "Săptămânal" },
            { key: "monthly", label: "Lunar" },
          ]}
          value={(recurrenceFrequency ?? "") as "daily" | "weekly" | "monthly"}
          onChange={(k) => {
            setRecurrenceFrequency(k);
            if (error) setError("");
          }}
        />
      </ToggleRow>

      <Field
        label="Notițe (opțional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Orice detaliu util"
        multiline
        tone={HOME}
        error={error && title.trim() ? error : null}
      />

      {datePickerVisible ? (
        <HomeDatePickerSheet
          value={dueDate}
          onCancel={() => setDatePickerVisible(false)}
          onSelect={(picked) => {
            setDueDate(picked);
            setDatePickerVisible(false);
          }}
        />
      ) : null}
    </Sheet>
  );
}
