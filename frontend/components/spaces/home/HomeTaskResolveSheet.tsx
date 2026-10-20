import React, { useRef, useState } from "react";
import { Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, FieldButton } from "@/components/ui/primitives";
import { roDate } from "@/lib/format";
import { GuiltFreeToggle } from "@/components/dashboard/GuiltFree";

import type { HomeTaskEntry } from "@/lib/spaces/home/home.types";
import { nextTaskOccurrence } from "@/lib/spaces/home/calculations/dashboard.calculations";
import { HomeDatePickerSheet } from "@/components/spaces/home/HomeDatePickerSheet";

export type HomeTaskResolveSheetProps = {
  entry: HomeTaskEntry;
  onCancel: () => void;
  /** price is undefined for a non-purchase task, or when "Rezolvă fără
   * preț" is tapped (still resolves, just never counts as spend).
   * nextDueDate is only meaningful for a recurring task -- undefined for
   * a plain one, since it just archives instead of getting a next date.
   * guiltFree ("Bani fără vină") is only passed when a price is logged
   * (purchase step) -- undefined leaves the task's flag as it was. */
  onResolve: (price: number | undefined, nextDueDate: string | undefined, guiltFree?: boolean) => void;
};

/** Opened for a purchase task's checkbox tap (asks for the price) and,
 * always, for a row tapped from HomeRecurringWarningsPage (asks to
 * confirm/adjust the next due date) -- see HomeDashboard. Only those two
 * fields are editable here; everything else about the task (title,
 * notes, toggles) stays exactly as it was set on HomeTaskForm. */
export function HomeTaskResolveSheet({ entry, onCancel, onResolve }: HomeTaskResolveSheetProps) {
  const { colors } = useTheme();
  const homeColors = useSpaceColors("home");
  const [price, setPrice] = useState("");
  const [nextDueDate, setNextDueDate] = useState<string | undefined>(
    entry.isRecurring ? nextTaskOccurrence(entry.dueDate, entry.recurrenceFrequency) : undefined,
  );
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [error, setError] = useState("");
  const [guiltFree, setGuiltFree] = useState(!!entry.guiltFree);

  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const resolveWith = async (value: number | undefined) => {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      await onResolve(value, nextDueDate, value !== undefined ? guiltFree : undefined);
    } catch (error: any) {
      setError(error?.message || "Nu am putut rezolva. Încearcă din nou.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const handleResolve = () => {
    if (!entry.isPurchase) {
      resolveWith(undefined);
      return;
    }
    if (!price.trim()) {
      setError("Introdu un preț sau alege „Rezolvă fără preț”.");
      return;
    }
    const value = Number(price.replace(",", "."));
    if (Number.isNaN(value) || value < 0) {
      setError("Preț invalid.");
      return;
    }
    // 0 is a syntactically valid number but not a real price -- forces
    // the explicit "Rezolvă fără preț" path instead of silently logging
    // a 0-RON purchase (which would still count as "priced" downstream,
    // e.g. showing up in spend totals as a real, if zero, entry).
    if (value === 0) {
      setError("Introdu un preț real sau alege „Rezolvă fără preț”.");
      return;
    }
    resolveWith(value);
  };

  return (
    <Sheet
      visible
      onClose={() => { if (!saveLock.current) onCancel(); }}
      info="home.resolve"
      centered
      icon={entry.isPurchase ? "cart-outline" : "checkmark"}
      tone={colors.success}
      title={entry.title}
      subtitle={`Marchezi ca rezolvat.${entry.isPurchase ? " Cât ai plătit? Intră în cheltuielile lunii." : entry.isRecurring ? " Alege când e data viitoare." : ""}`}
      footer={
        <>
          <Button label="Rezolvă" tone={homeColors.fill} onPress={handleResolve} loading={saving} />
          {entry.isPurchase ? <Button variant="ghost" label="Rezolvă fără preț" onPress={() => resolveWith(undefined)} disabled={saving} /> : null}
        </>
      }
    >
      {!entry.isPurchase && error ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text> : null}
      {entry.isPurchase ? (
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
          accessibilityLabel="Preț plătit"
        />
      ) : null}

      {entry.isPurchase ? (
        <GuiltFreeToggle value={guiltFree} onChange={setGuiltFree} tone={homeColors.color} testID="home-task-resolve-guilt-free" />
      ) : null}

      {entry.isRecurring ? (
        <FieldButton
          label="Data viitoare"
          value={nextDueDate ? roDate(nextDueDate, { withYear: true }) : null}
          placeholder="Alege o dată"
          onPress={() => setDatePickerVisible(true)}
        />
      ) : null}

      {datePickerVisible ? (
        <HomeDatePickerSheet
          value={nextDueDate}
          onCancel={() => setDatePickerVisible(false)}
          onSelect={(picked) => {
            setNextDueDate(picked);
            setDatePickerVisible(false);
          }}
        />
      ) : null}
    </Sheet>
  );
}
