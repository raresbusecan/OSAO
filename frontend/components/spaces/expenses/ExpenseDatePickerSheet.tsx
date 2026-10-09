import React from "react";
import { DatePickerSheet } from "@/components/ui/DatePickerSheet";

export type ExpenseDatePickerSheetProps = {
  /** ISO string -- opens on this date's month (today's when unset). */
  value?: string;
  onCancel: () => void;
  onSelect: (dateIso: string) => void;
};

/** An expense's date -- the shared DatePickerSheet limited to today and
 * earlier (an expense can't be dated in the future), "Azi" in the footer. */
export function ExpenseDatePickerSheet({ value, onCancel, onSelect }: ExpenseDatePickerSheetProps) {
  return (
    <DatePickerSheet
      value={value}
      onCancel={onCancel}
      onSelect={(iso) => iso && onSelect(iso)}
      range="past"
    />
  );
}
