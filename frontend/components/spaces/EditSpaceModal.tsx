import React, { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";

export type EditSpaceModalProps = {
  visible: boolean;
  /** "edit" (the default -- every existing call site) renames an
   * already-saved space. "create" collects just a name for a NEW space
   * before it exists at all -- same modal, same UX as Car/Home's own
   * "fill in details, then Create" forms, for the 2 kinds (Grocery,
   * Expenses) that have no dedicated profile form of their own. */
  mode?: "edit" | "create";
  /** In "edit" mode: the existing space (id required). In "create"
   * mode: the template's own icon/color/type, carried straight through
   * to api.createSpace once the user confirms a name -- id is never
   * read here. */
  space: { id?: string | number; name: string; icon?: string; color?: string; type?: string } | null;
  onClose: () => void;
  onSaved: (updated: any) => void;
};

/**
 * Renaming for any space type with no dedicated form of its own (Grocery,
 * Expenses, a custom space) -- name only, deliberately not the same
 * name+icon editor Car/Home's own dedicated forms use (see
 * CarProfileForm.tsx/HomeProfileForm.tsx) -- changing icon/type here
 * would let a space impersonate a different one, which those forms
 * exist to prevent. In "create" mode this doubles as the pre-creation
 * naming step those 2 kinds were missing -- a space no longer gets
 * created with a generic template name (then only renameable
 * afterward); the user names it before it's created at all.
 */
export function EditSpaceModal({ visible, mode = "edit", space, onClose, onSaved }: EditSpaceModalProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (space) {
      setName(space.name || "");
    }
  }, [space]);

  const save = async () => {
    if (!space || !name.trim()) return;

    setBusy(true);
    try {
      if (mode === "create") {
        const result = await api.createSpace({
          name: name.trim(),
          icon: space.icon,
          color: space.color,
          type: space.type,
        });
        onSaved(result?.space ?? result);
      } else {
        const result = await api.updateSpace(space.id!, { name: name.trim() });
        onSaved(result?.space ?? { ...space, name: name.trim() });
      }
      onClose();
    } catch (error: any) {
      notifyAction(
        "Nu am putut salva",
        error?.message || "A apărut o eroare.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={mode === "create" ? `${space?.name ?? "Spațiu"} nou` : "Redenumește spațiul"}
      subtitle={mode === "create" ? "Dă-i un nume, ca să-l recunoști ușor" : undefined}
      icon={(space?.icon as any) ?? "grid-outline"}
      tone={space?.color}
      footer={
        <Button
          testID="edit-space-save-button"
          label={mode === "create" ? "Creează spațiul" : "Salvează"}
          onPress={save}
          loading={busy}
          disabled={!name.trim()}
        />
      }
    >
      <Field
        testID="edit-space-name"
        label="Nume"
        value={name}
        onChangeText={setName}
        placeholder="ex. Cumpărături de familie"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        tone={space?.color}
      />
    </Sheet>
  );
}
