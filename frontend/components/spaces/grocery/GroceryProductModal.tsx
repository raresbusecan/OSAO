import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { confirmAction } from "@/lib/confirm";
import type { GroceryCategory, GroceryItem } from "@/lib/spaces/grocery/grocery.types";
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
      setError("Please enter a product name.");
      return;
    }

    const quantity = [amount.trim(), unit.trim()].filter(Boolean).join(" ") || undefined;
    const trimmedPrice = price.trim().replace(",", ".");
    const priceValue = trimmedPrice ? Number(trimmedPrice) : undefined;
    if (trimmedPrice && (Number.isNaN(priceValue) || (priceValue as number) < 0)) {
      setError("Please enter a valid price.");
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
    setSuccessMessage(`"${trimmedName}" added.`);
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
    const confirmed = await confirmAction(
      "Delete product",
      `Remove "${item?.name}" from your shopping list?`,
      { confirmLabel: "Delete", destructive: true },
    );

    if (confirmed) {
      onDelete?.();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />

        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            maxHeight: "85%",
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.xl }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: spacing.lg,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.3 }}>
                {isEditing ? "Edit Product" : "Add Product"}
              </Text>

              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.pill,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>

            {/* Name -- the only required field; Enter saves directly,
                matching "as few steps as possible" for a quick add. */}
            <Field label="Name" required colors={colors} spacing={spacing}>
              <TextInput
                ref={nameInputRef}
                testID="grocery-modal-name"
                value={name}
                onChangeText={handleNameChange}
                onSubmitEditing={handleSave}
                returnKeyType="done"
                autoFocus
                placeholder="e.g. Carrots"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={{
                  minHeight: 48,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.sm,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.onSurface,
                  fontSize: 15,
                }}
              />
            </Field>

            {/* Amount + Unit -- optional, side by side ("1" + "kg"). */}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Field label="Amount" colors={colors} spacing={spacing}>
                  <TextInput
                    testID="grocery-modal-amount"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="e.g. 1"
                    keyboardType="default"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    style={{
                      minHeight: 48,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.sm,
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: colors.border,
                      color: colors.onSurface,
                      fontSize: 15,
                    }}
                  />
                </Field>
              </View>

              <View style={{ flex: 1 }}>
                <Field label="Unit" colors={colors} spacing={spacing}>
                  <TextInput
                    testID="grocery-modal-unit"
                    value={unit}
                    onChangeText={setUnit}
                    placeholder="e.g. kg"
                    placeholderTextColor={colors.onSurfaceTertiary}
                    style={{
                      minHeight: 48,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.sm,
                      backgroundColor: "transparent",
                      borderWidth: 1,
                      borderColor: colors.border,
                      color: colors.onSurface,
                      fontSize: 15,
                    }}
                  />
                </Field>
              </View>
            </View>

            {/* Price -- optional, RON. Nothing downstream reads it yet
                (no mandatory validation beyond "must be a valid
                non-negative number" if filled in); it's here ahead of
                the planned basket-cost total and budget sync. */}
            <Field label="Price (RON)" colors={colors} spacing={spacing}>
              <TextInput
                testID="grocery-modal-price"
                value={price}
                onChangeText={setPrice}
                placeholder="e.g. 12.50"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={{
                  minHeight: 48,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.sm,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.onSurface,
                  fontSize: 15,
                }}
              />
            </Field>

            {successMessage ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  marginBottom: spacing.md,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.success + "1A",
                }}
              >
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.success }}>{successMessage}</Text>
              </View>
            ) : null}

            {error ? (
              <View
                style={{
                  marginBottom: spacing.md,
                  padding: spacing.md,
                  borderRadius: radius.sm,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 13, color: colors.onSurface }}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              testID="grocery-modal-save"
              onPress={handleSave}
              style={{
                minHeight: 52,
                borderRadius: radius.sm,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>
                {isEditing ? "Save Changes" : "Add Product"}
              </Text>
            </Pressable>

            {isEditing && onDelete ? (
              <Pressable
                testID="grocery-modal-delete"
                onPress={handleDelete}
                style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Delete Product</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  required,
  colors,
  spacing,
  children,
}: {
  label: string;
  required?: boolean;
  colors: any;
  spacing: any;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={{ marginBottom: spacing.sm, fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}
