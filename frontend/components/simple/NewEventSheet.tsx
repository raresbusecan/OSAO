import React, { useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";
import { roDate } from "@/lib/format";
import { CUSTOM_EVENT_COLOR } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import { DatePickerSheet } from "@/components/ui/DatePickerSheet";
import { Button, Field, FieldButton } from "@/components/ui/primitives";
import { useTheme } from "@/lib/theme";

/** Local calendar date, never toISOString() (that reads UTC). */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * orgOS Simplu's "Eveniment nou" (the Calendar's "+ Eveniment"): a title,
 * Data + Ora and an optional note -- no purchase / repeat (those stay in
 * Complet). Same `custom_event` item and local-time -> UTC conversion as
 * the full Calendar's NewEventSheet (app/(tabs)/calendar.tsx). The date
 * starts on `day` (YYYY-MM-DD); mounted-per-open, so every open is fresh.
 */
export function SimpleNewEventSheet({
  visible,
  day,
  onClose,
  onSaved,
}: {
  visible: boolean;
  day: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { spacing } = useTheme();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(day);
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form on every open, dated on the selected day.
  const [seenOpen, setSeenOpen] = useState(false);
  if (visible !== seenOpen) {
    setSeenOpen(visible);
    if (visible) {
      setTitle("");
      setDate(day);
      setTime("09:00");
      setNotes("");
      setPickerOpen(false);
      setError(null);
    }
  }

  const [dy, dm, dd] = date.split("-").map(Number);
  const dateObj = new Date(dy, dm - 1, dd);

  const save = async () => {
    if (saving) return;
    if (!title.trim()) {
      setError("Scrie un titlu pentru eveniment.");
      return;
    }
    const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    const hh = m ? Math.min(23, Number(m[1])) : 9;
    const mm = m ? Math.min(59, Number(m[2])) : 0;
    setSaving(true);
    try {
      await api.createItem({
        type: "custom_event",
        title: title.trim(),
        // Local wall-clock time -> the right UTC instant.
        due_at: new Date(dy, dm - 1, dd, hh, mm, 0).toISOString(),
        notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (e: any) {
      notifyAction("Nu am putut salva evenimentul", e?.message || "A apărut o eroare.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Eveniment nou"
      icon="sparkles-outline"
      tone={CUSTOM_EVENT_COLOR}
      testID="simple-new-event-sheet"
      footer={<Button testID="simple-new-event-save" label="Adaugă evenimentul" tone={CUSTOM_EVENT_COLOR} onPress={save} loading={saving} disabled={!title.trim()} />}
    >
      <Field
        testID="simple-new-event-title"
        label="Ce se întâmplă"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          setError(null);
        }}
        placeholder="ex. Ziua Anei"
        tone={CUSTOM_EVENT_COLOR}
        error={error}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-end" }}>
        <View style={{ flex: 1.45 }}>
          <FieldButton testID="simple-new-event-date" label="Data" value={roDate(dateObj, { withYear: true })} onPress={() => setPickerOpen(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Field testID="simple-new-event-time" label="Ora" value={time} onChangeText={setTime} placeholder="09:00" tone={CUSTOM_EVENT_COLOR} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <Field testID="simple-new-event-notes" label="Notă (opțional)" value={notes} onChangeText={setNotes} placeholder="Orice detaliu util" multiline tone={CUSTOM_EVENT_COLOR} />

      {/* Nested inside the form sheet (a sibling Modal can fail to show on iOS). */}
      {pickerOpen ? (
        <DatePickerSheet
          value={dateObj.toISOString()}
          range="any"
          title="Data evenimentului"
          onCancel={() => setPickerOpen(false)}
          onSelect={(iso) => {
            if (iso) setDate(ymd(new Date(iso)));
            setPickerOpen(false);
          }}
        />
      ) : null}
    </Sheet>
  );
}
