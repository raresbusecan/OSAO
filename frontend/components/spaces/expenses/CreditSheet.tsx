import React, { useState } from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { refreshBudgetPlan } from "@/lib/budget/plan";
import { SPACE_KIND_LABEL, spaceColors } from "@/lib/spaces/spaceProfile";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { creditToItemBody, type CreditEntry } from "@/lib/spaces/expenses/credits";
import { CreditFields, creditDraftError, emptyCreditDraft, parseCreditAmount, type CreditDraft } from "./CreditFields";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Pill } from "@/components/ui/primitives";

/** A car/home space a credit can be shown in ("Arată-l și în spațiul"). */
export type LinkableSpace = { id: string; kind: "car" | "home"; name: string; color?: string | null };


export type CreditSheetProps = {
  /** "new" opens an empty form; a CreditEntry edits it; null = closed. */
  credit: CreditEntry | "new" | null;
  /** This Cheltuieli space -- where a new credit is created. */
  spaceId: string | number;
  linkable: LinkableSpace[];
  onClose: () => void;
  /** After a create/update/delete went through (reload the list). */
  onChanged: () => void;
};

/**
 * Add / edit / delete one credit ("Credite" in the Cheltuieli space).
 * Saves through the generic Items API itself (type expense_credit) and
 * refreshes the shared /budget cache so Buget/Mașină/Casă see it too.
 */
export function CreditSheet(props: CreditSheetProps) {
  if (!props.credit) return null;
  const key = props.credit === "new" ? "new" : props.credit.id;
  return <CreditSheetBody key={key} {...props} credit={props.credit} />;
}

/** lib/api throws Laravel's `message` (the first validation error, in
 * Romanian) -- or, when there's none, the JSON of the `errors` object. */
function apiErrorText(error: any): string {
  const raw = String(error?.message || "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const first = Object.values(parsed)[0];
      if (Array.isArray(first) && first.length) return String(first[0]);
      if (typeof first === "string") return first;
    }
  } catch {
    // Not JSON -- already a readable message.
  }
  return raw || "A apărut o eroare.";
}

function CreditSheetBody({ credit, spaceId, linkable, onClose, onChanged }: CreditSheetProps & { credit: CreditEntry | "new" }) {
  const { colors, spacing, isDark } = useTheme();
  const exp = useSpaceColors("expenses");
  const TEAL = exp.color;
  const isNew = credit === "new";
  const initial = isNew ? null : credit;


  const [draft, setDraft] = useState<CreditDraft>(
    initial
      ? { title: initial.title, amount: String(initial.amount), dayOfMonth: initial.dayOfMonth, endDate: initial.endDate }
      : emptyCreditDraft(),
  );
  // The exact space (one of several cars/homes), picked by name.
  const [linkedId, setLinkedId] = useState<string | null>(initial?.linkedSpaceId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const invalid = creditDraftError(draft, isNew);
    if (invalid) return setError(invalid);
    setError(null);
    setSaving(true);
    try {
      const body = creditToItemBody(
        { title: draft.title, amount: parseCreditAmount(draft.amount), dayOfMonth: draft.dayOfMonth, endDate: draft.endDate, linkedSpaceId: linkedId },
        isNew ? spaceId : undefined,
      );
      if (isNew) await api.createItem(body);
      else await api.updateItem(credit.id, body);
      refreshBudgetPlan();
      onChanged();
      onClose();
    } catch (e: any) {
      const msg = apiErrorText(e);
      setError(msg);
      notifyAction("Nu am putut salva creditul", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew) return;
    const ok = await confirmAction("Ștergi creditul?", `„${credit.title}” se șterge definitiv, cu tot cu mementourile lui.`, { confirmLabel: "Șterge", destructive: true });
    if (!ok) return;
    try {
      await api.deleteItem(credit.id);
      refreshBudgetPlan();
      onChanged();
      onClose();
    } catch (e: any) {
      notifyAction("Nu am putut șterge creditul", apiErrorText(e));
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={isNew ? "Credit nou" : "Editează creditul"}
      icon="card-outline"
      tone={TEAL}
      info="expenses.credits"
      testID="credit-sheet"
      footer={
        <>
          <Button testID="credit-save" label="Salvează creditul" tone={exp.fill} onPress={handleSave} loading={saving} />
          {!isNew ? <Button testID="credit-delete" variant="ghost" icon="trash-outline" label="Șterge creditul" onPress={handleDelete} /> : null}
        </>
      }
    >
      <CreditFields draft={draft} onChange={setDraft} allowPastEnd={!isNew} />

      {linkable.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Arată-l și în spațiul</Text>
          {/* Every car/home by its own name -- with two homes the credit
              belongs to one specific house, not "Casă" in general. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <Pill testID="credit-link-none" label="Niciunul" active={linkedId === null} onPress={() => setLinkedId(null)} />
            {linkable.map((s) => (
              <Pill
                key={s.id}
                testID={`credit-link-${s.id}`}
                label={s.name || SPACE_KIND_LABEL[s.kind]!}
                icon={s.kind === "car" ? "car-outline" : "home-outline"}
                active={linkedId === s.id}
                tone={spaceColors({ kind: s.kind, color: s.color }, isDark)?.color}
                onPress={() => setLinkedId(s.id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {error ? <Text testID="credit-error" style={{ fontSize: 13, color: colors.error }}>{error}</Text> : null}

    </Sheet>
  );
}
