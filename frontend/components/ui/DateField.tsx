import React, { useState } from "react";
import { FieldButton } from "@/components/ui/primitives";
import { DatePickerSheet } from "@/components/ui/DatePickerSheet";
import { formatDateInput, isValidDateInput, parseDateInput } from "@/lib/spaces/car/utils/dateInput";
import { roDate } from "@/lib/format";

/**
 * A form date that's picked, not typed -- for forms whose state is the
 * "ZZ.LL.AAAA" string (every Car form): shows it as "4 octombrie",
 * opens the shared DatePickerSheet, and hands back "ZZ.LL.AAAA" (or ""
 * when cleared), so the form's own validation and save stay unchanged.
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder = "Alege data",
  range = "any",
  clearable,
  disabled,
  testID,
}: {
  label?: string;
  value: string;
  onChange: (ddmmyyyy: string) => void;
  placeholder?: string;
  range?: "past" | "future" | "any";
  clearable?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const iso = value && isValidDateInput(value) ? parseDateInput(value) ?? undefined : undefined;
  return (
    <>
      <FieldButton
        testID={testID}
        label={label}
        value={iso ? roDate(iso, { withYear: true }) : null}
        placeholder={placeholder}
        onPress={() => {
          if (!disabled) setOpen(true);
        }}
      />
      {open ? (
        <DatePickerSheet
          value={iso}
          range={range}
          clearable={clearable}
          onCancel={() => setOpen(false)}
          onSelect={(picked) => {
            onChange(picked ? formatDateInput(picked) : "");
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
