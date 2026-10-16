import React from "react";
import { DatePickerSheet } from "@/components/ui/DatePickerSheet";

export type HomeDatePickerSheetProps = {
  /** ISO string, or undefined for "no date selected yet". */
  value?: string;
  onCancel: () => void;
  onSelect: (dateIso: string | undefined) => void;
  /** Footer offers "Fără dată" (onSelect(undefined)) instead of "Azi".
   * Only for a date the record can really live without (a task's due
   * date). Off by default: every Casă category date (a visit's date, a
   * bill's next payment, a document's validity) always has a value, so
   * "Fără dată" there used to be a silent no-op. */
  clearable?: boolean;
};

/** Casă's date picker -- the shared DatePickerSheet, any month (a due
 * date ahead, or the date a past expense/visit happened). It used to
 * page forward only, so a Casă expense from last month couldn't be
 * dated at all. */
export function HomeDatePickerSheet({ value, onCancel, onSelect, clearable = false }: HomeDatePickerSheetProps) {
  return <DatePickerSheet value={value} onCancel={onCancel} onSelect={onSelect} range="any" clearable={clearable} title="Alege o dată" />;
}
