import React, { useEffect, useRef, useState } from "react";
import { View, Text, type TextInput } from "react-native";
import { useTheme } from "@/lib/theme";
import { confirmAction } from "@/lib/confirm";
import { groceryCategoryLabel, type GroceryCategory, type GroceryItem } from "@/lib/spaces/grocery/grocery.types";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";
import { matchIngredientCategory, useIngredientReferences } from "@/lib/spaces/grocery/ingredientLookup";

export type GroceryProductModalProps = {
  visible: boolean;
  onClose: () => void;
  onSave: (draft: { name: string; quantity?: string; category: GroceryCategory; price?: number }) => void;
  /** Pass an existing item to edit (and offer Delete) instead of adding
   * a new one. */
  item?: GroceryItem | null;
  onDelete?: () => void;
};

/**
 * One shared sheet for both Add and Edit -- "Add product" from the
 * Shopping List page and tapping an existing row's pencil icon both
 * land here, editing only swaps in the item's current values and adds a
 * Delete action. Name is the only required field (see handleSave);
 * amount/unit are optional and combine into the single `quantity`
 * display string. Category isn't a visible field here at all anymore --
 * it's still guessed from the name as it's typed (see handleNameChange,
 * the same ingredientLookup matching GroceryQuickAddBar uses) and saved
 * along with the product, defaulting to "Other" on no match; there's
 * just no picker to override it, on purpose.
 */
export function GroceryProductModal({
  visible,
  onClose,
  onSave,
  item,
  onDelete,
}: GroceryProductModalProps) {
  const { colors, spacing, radius } = useTheme();
  const isEditing = !!item;
  const ingredientReferences = useIngredientReferences();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<GroceryCategory>("Other");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const nameInputRef = useRef<TextInput>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed the form fresh every time the sheet opens (either empty for
  // Add, or the item's current values for Edit) -- a Modal keeps its
  // children mounted while `visible` is false, so without this the next
  // Add would still show whatever was left in the fields last time.
  useEffect(() => {
    if (!visible) return;

    setError("");
    setSuccessMessage("");
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    setName(item?.name ?? "");
    setCategory(item?.category ?? "Other");

    if (item?.quantity) {
      const [firstWord, ...rest] = item.quantity.split(" ");
      setAmount(firstWord ?? "");
      setUnit(rest.join(" "));
    } else {
      setAmount("");
      setUnit("");
    }
    setPrice(item?.price != null ? String(item.price) : "");
  }, [visible, item]);

  // Clears the success timeout on unmount so it never fires setState
  // after the component is gone.
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Scrie numele produsului.");
      return;
    }

    const quantity = [amount.trim(), unit.trim()].filter(Boolean).join(" ") || undefined;
    const trimmedPrice = price.trim().replace(",", ".");
    const priceValue = trimmedPrice ? Number(trimmedPrice) : undefined;
    if (trimmedPrice && (Number.isNaN(priceValue) || (priceValue as number) < 0)) {
      setError("Introdu un preț valid.");
      return;
    }

    onSave({ name: trimmedName, quantity, category, price: priceValue });

    // Editing closes as before (the parent hides the sheet once it gets
    // this callback). Adding stays open instead: clears Name/Amount/Unit
    // (Category is left as-is on purpose -- adding several products
    // into the same category in a row is the whole point), shows a
    // brief confirmation, and refocuses Name so the next product can be
    // typed immediately without touching the sheet.
    if (isEditing) return;

    setName("");
    setAmount("");
    setUnit("");
    setPrice("");
    setError("");
    setSuccessMessage(`„${trimmedName}” a fost adăugat.`);
    nameInputRef.current?.focus();

    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    successTimeoutRef.current = setTimeout(() => setSuccessMessage(""), 2500);
  };

  // Recognizes a known ingredient (name or alias, case-insensitive) as
  // the user types and sets `category` to it, silently -- there's no
  // picker here for it to feed into, just whatever gets saved with the
  // product (see handleSave).
  const handleNameChange = (value: string) => {
    setName(value);
    const matched = matchIngredientCategory(ingredientReferences, value);
    if (matched) setCategory(matched);
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction("Ștergi produsul?", `Scoți „${item?.name}” de pe listă?`, { confirmLabel: "Șterge", destructive: true });
    if (confirmed) onDelete?.();
  };


  const GROC = SPACE_IDENTITY_COLORS.grocery!;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      info="grocery.product"
      title={isEditing ? "Editează produsul" : "Produs nou"}
      icon="cart-outline"
      tone={GROC}
      footer={
        <>
          <Button testID="grocery-product-save" label={isEditing ? "Salvează" : "Adaugă pe listă"} tone={GROC} onPress={handleSave} />
          {isEditing && onDelete ? <Button variant="ghost" icon="trash-outline" label="Șterge produsul" onPress={handleDelete} /> : null}
        </>
      }
    >
      <Field
        testID="grocery-product-name"
        label="Produs"
        value={name}
        onChangeText={handleNameChange}
        placeholder="ex. Morcovi"
        autoFocus={!isEditing}
        tone={GROC}
        hint={name.trim() ? `Categorie: ${groceryCategoryLabel(category)}` : null}
      />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Cantitate" value={amount} onChangeText={setAmount} placeholder="ex. 1" keyboardType="decimal-pad" tone={GROC} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Unitate" value={unit} onChangeText={setUnit} placeholder="ex. kg" tone={GROC} />
        </View>
      </View>
      <Field label="Preț (opțional)" value={price} onChangeText={setPrice} placeholder="ex. 12,50" keyboardType="decimal-pad" suffix="lei" tone={GROC} />

      {successMessage ? <Text style={{ fontSize: 14, fontWeight: "500", color: colors.success }}>{successMessage}</Text> : null}
      {error ? (
        <View style={{ padding: spacing.md, borderRadius: radius.control, backgroundColor: `${colors.error}14` }}>
          <Text style={{ fontSize: 14, color: colors.error }}>{error}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}
