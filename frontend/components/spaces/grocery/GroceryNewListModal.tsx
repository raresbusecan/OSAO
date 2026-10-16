import React from "react";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";

export type GroceryNewListModalProps = {
  visible: boolean;
  name: string;
  onChangeName: (name: string) => void;
  onClose: () => void;
  onCreate: () => void;
  /** True while the create request is in flight -- disables Create so
   * a slow connection doesn't get double-submitted. Optional since
   * GroceryListsPage's own create isn't awaited from that page. */
  saving?: boolean;
};

/**
 * The one popup every "New list" entry point opens -- Lists/Smart
 * List/Recipes each render this the same way, driven by the same
 * shared `creatingList` state from GroceryDashboard. A simple, single
 * field: name, then Create; X in the corner to back out, same as
 * GroceryProductModal's "New category" popup.
 */
/** Name a new grocery list -- the shared Sheet with one field. */
export function GroceryNewListModal({ visible, name, onChangeName, onClose, onCreate, saving }: GroceryNewListModalProps) {
  const GROC = useSpaceColors("grocery").color;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      info="grocery.newList"
      title="Listă nouă"
      subtitle="Pentru săptămâna asta, o ieșire sau orice cumperi des"
      icon="list-outline"
      tone={GROC}
      footer={<Button testID="grocery-new-list-create" label="Creează lista" tone={GROC} onPress={onCreate} loading={!!saving} disabled={!name.trim()} />}
    >
      <Field
        testID="grocery-new-list-input"
        label="Nume"
        value={name}
        onChangeText={onChangeName}
        onSubmitEditing={onCreate}
        returnKeyType="done"
        autoFocus
        placeholder="ex. Săptămâna 3"
        tone={GROC}
      />
    </Sheet>
  );
}
