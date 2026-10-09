import React from "react";
import { DatePickerSheet } from "@/components/ui/DatePickerSheet";

export type HomeDatePickerSheetProps = {
  /** ISO string, or undefined for "no date selected yet". */
  value?: string;
  onCancel: () => void;
  onSelect: (dateIso: string | undefined) => void;
};

/** Casă's date picker -- the shared DatePickerSheet, any month (a due
 * date ahead, or the date a past expense/visit happened), with
 * "Fără dată" for optional fields. It used to page forward only, so a
 * Casă expense from last month couldn't be dated at all. */
export function HomeDatePickerSheet({ value, onCancel, onSelect }: HomeDatePickerSheetProps) {
  return <DatePickerSheet value={value} onCancel={onCancel} onSelect={onSelect} range="any" clearable title="Alege o dată" />;
}
