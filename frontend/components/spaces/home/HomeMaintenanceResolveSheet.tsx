import React, { useState } from "react";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, SPACE_BUTTON_FILL } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";

import type { HomeMaintenanceEntry } from "@/lib/spaces/home/home.types";
import { addRecurrenceInterval } from "@/components/spaces/home/homeCategoryConfig";

export type HomeMaintenanceResolveSheetProps = {
  entry: HomeMaintenanceEntry;
  onCancel: () => void;
  /** Always a real, non-zero price -- unlike Tasks, every Maintenance
   * entry already has one (the form field is required), so there's no
   * "resolve without a price" escape hatch here, just confirming or
   * correcting the amount this cycle actually cost. */
  onResolve: (price: number) => void;
};

/**
 * Opened only for a RECURRING Maintenance entry's resolve action (see
 * HomeDashboard's resolveCategoryEntry) -- nothing previously asked for
 * a fresh price on repeat visits, so every resolve silently kept the
 * entry's ORIGINAL price forever, and the "this month" spend total never
 * grew past the first visit. Pre-fills with the entry's last known price
 * (most repeat services cost about the same), editable in case this
 * cycle's bill was different. Mirrors HomeTaskResolveSheet's layout, one
 * field simpler (no next-date override -- Maintenance's own
 * addRecurrenceInterval schedule isn't user-adjustable here, only shown
 * as a preview).
 */
export function HomeMaintenanceResolveSheet({ entry, onCancel, onResolve }: HomeMaintenanceResolveSheetProps) {
  const { colors } = useTheme();
  const [price, setPrice] = useState(entry.price ? String(entry.price) : "");
  const [error, setError] = useState("");

  const nextDueDate = addRecurrenceInterval(
    entry.nextDueDate || entry.date,
    entry.recurrenceFrequency ?? "monthly",
    entry.recurrenceInterval ?? 1,
  );
  const nextDueLabel = new Date(nextDueDate).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const handleResolve = () => {
    if (!price.trim()) {
      setError("Introdu prețul plătit.");
      return;
    }
    const value = Number(price.replace(",", "."));
    if (Number.isNaN(value) || value <= 0) {
      setError("Preț invalid.");
      return;
    }
    onResolve(value);
  };

  return (
    <Sheet
      visible
      onClose={onCancel}
      centered
      icon="checkmark"
      tone={colors.success}
      title={`${entry.service}: rezolvat`}
      subtitle={`Cât a costat de data asta? Următoarea e programată pe ${nextDueLabel}.`}
      footer={<Button label="Confirmă" tone={SPACE_BUTTON_FILL.home} onPress={handleResolve} />}
    >
      <Field
        value={price}
        onChangeText={(t) => {
          setPrice(t);
          if (error) setError("");
        }}
        placeholder="0"
        keyboardType="decimal-pad"
        autoFocus
        big
        suffix="lei"
        tone={SPACE_IDENTITY_COLORS.home}
        error={error || null}
        hint="Intră în totalul lunii, separat de vizitele anterioare."
        accessibilityLabel="Preț plătit"
      />
    </Sheet>
  );
}
