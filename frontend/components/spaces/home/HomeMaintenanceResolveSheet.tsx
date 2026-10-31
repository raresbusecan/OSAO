import React, { useRef, useState } from "react";
import { roDate, parseLocaleNumber } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";

import type { HomeMaintenanceEntry } from "@/lib/spaces/home/home.types";
import { addRecurrenceInterval } from "@/components/spaces/home/homeCategoryConfig";

export type HomeMaintenanceResolveSheetProps = {
  entry: HomeMaintenanceEntry;
  onCancel: () => void;
  /** This visit's price, or null for "Fără cost" (a warranty visit, a
   * free check) -- resolves without logging any spend and keeps the
   * entry's usual price for next time. */
  onResolve: (price: number | null) => void;
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
  const homeColors = useSpaceColors("home");
  const [price, setPrice] = useState(entry.price ? String(entry.price) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const resolveWith = async (value: number | null) => {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      await onResolve(value);
    } catch (error: any) {
      setError(error?.message || "Nu am putut rezolva. Încearcă din nou.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const nextDueDate = addRecurrenceInterval(
    entry.nextDueDate || entry.date,
    entry.recurrenceFrequency ?? "monthly",
    entry.recurrenceInterval ?? 1,
  );
  const nextDueLabel = roDate(nextDueDate);

  const handleResolve = () => {
    if (!price.trim()) {
      setError("Introdu prețul plătit.");
      return;
    }
    const value = parseLocaleNumber(price);
    if (Number.isNaN(value) || value <= 0) {
      setError("Preț invalid.");
      return;
    }
    void resolveWith(value);
  };

  return (
    <Sheet
      visible
      onClose={() => { if (!saveLock.current) onCancel(); }}
      info="home.resolve"
      centered
      icon="checkmark"
      tone={colors.success}
      title={entry.service}
      subtitle={`Marchezi ca rezolvat. Cât a costat de data asta? Următoarea: ${nextDueLabel}.`}
      footer={
        <>
          <Button label="Confirmă" tone={homeColors.fill} onPress={handleResolve} loading={saving} />
          <Button testID="maintenance-resolve-free" variant="ghost" label="Fără cost" onPress={() => resolveWith(null)} disabled={saving} />
        </>
      }
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
        tone={homeColors.color}
        error={error || null}
        hint="Intră în totalul lunii, separat de vizitele anterioare."
        accessibilityLabel="Preț plătit"
      />
    </Sheet>
  );
}
