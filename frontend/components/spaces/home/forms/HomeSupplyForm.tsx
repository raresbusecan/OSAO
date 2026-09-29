import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { confirmAction } from "@/lib/confirm";

import type { HomeSupplyEntry } from "@/lib/spaces/home/home.types";

type HomeSupplyFormProps = {
  onCancel: () => void;
  onSave: (entry: HomeSupplyEntry) => void;
  /** Pass an existing entry to edit it instead of creating a new one. */
  entry?: HomeSupplyEntry;
  /** Only meaningful while editing -- deletes this entry entirely. */
  onDelete?: () => void;
};

export default function HomeSupplyForm({ onCancel, onSave, entry, onDelete }: HomeSupplyFormProps) {
  const isEditing = entry !== undefined;

  const { colors, spacing, radius } = useTheme();

  const [name, setName] = useState(entry?.name ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [quantity, setQuantity] = useState(entry ? String(entry.quantity) : "1");
  const [unit, setUnit] = useState(entry?.unit ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleSave = () => {
    setError("");

    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }

    const quantityValue = Number(quantity.replace(",", "."));
    if (!quantity.trim() || Number.isNaN(quantityValue) || quantityValue < 0) {
      setError("Please enter a valid quantity.");
      return;
    }

    const entryToSave: HomeSupplyEntry = {
      id: entry?.id ?? `supply-${Date.now()}`,
      name: name.trim(),
      category: category.trim() || "Other",
      quantity: quantityValue,
      unit: unit.trim() || "pcs",
      lastRestockedDate: entry?.lastRestockedDate,
      restockHistory: entry?.restockHistory,
      notes: notes.trim() || undefined,
    };

    onSave(entryToSave);
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      "Delete supply",
      "This entry will be permanently deleted.",
      { confirmLabel: "Delete", destructive: true },
    );

    if (confirmed) {
      onDelete?.();
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl }}
      >
        {/* Header */}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xl }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.md,
                  // Same tinted-chip identity signal as HomeTaskForm's
                  // own header chip and the Space header avatar.
                  backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="basket-outline" size={19} color={SPACE_IDENTITY_COLORS.home} />
              </View>

              <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.3 }}>
                {isEditing ? "Edit Supply" : "Add Supply"}
              </Text>
            </View>

            <Text style={{ marginTop: 6, fontSize: 13, color: colors.onSurfaceTertiary }}>
              {isEditing ? "Update this supply" : "Something you keep stocked around the house"}
            </Text>
          </View>

          <Pressable
            onPress={onCancel}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close supply form"
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Toilet Paper"
          required
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="name"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        <FormField
          label="Category"
          value={category}
          onChangeText={setCategory}
          placeholder="e.g. Bathroom"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="category"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Quantity"
              value={quantity}
              onChangeText={setQuantity}
              placeholder="1"
              keyboardType="decimal-pad"
              required
              colors={colors}
              spacing={spacing}
              radius={radius}
              fieldName="quantity"
              focusedField={focusedField}
              onFocus={setFocusedField}
              onBlur={() => setFocusedField(null)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Unit"
              value={unit}
              onChangeText={setUnit}
              placeholder="e.g. rolls"
              colors={colors}
              spacing={spacing}
              radius={radius}
              fieldName="unit"
              focusedField={focusedField}
              onFocus={setFocusedField}
              onBlur={() => setFocusedField(null)}
            />
          </View>
        </View>

        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes"
          multiline
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="notes"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {error ? (
          <View style={{ marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 13, color: colors.onSurface }}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save supply"
          style={{
            marginTop: spacing.xl,
            minHeight: 52,
            borderRadius: radius.md,
            backgroundColor: colors.onSurface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>
            {isEditing ? "Save Changes" : "Save Supply"}
          </Text>
        </Pressable>

        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel supply"
          style={{
            marginTop: spacing.sm,
            minHeight: 48,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.error,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Cancel</Text>
        </Pressable>

        {isEditing && onDelete ? (
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete supply"
            style={{ marginTop: spacing.sm, minHeight: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Delete Entry</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "decimal-pad";
  multiline?: boolean;
  required?: boolean;
  colors: any;
  spacing: any;
  radius: any;
  fieldName: string;
  focusedField: string | null;
  onFocus: (field: string) => void;
  onBlur: () => void;
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  required = false,
  colors,
  spacing,
  radius,
  fieldName,
  focusedField,
  onFocus,
  onBlur,
}: FormFieldProps) {
  const isFocused = focusedField === fieldName;

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={{ marginBottom: spacing.sm, fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>

      <View
        style={{
          minHeight: multiline ? 90 : 52,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceSecondary,
          borderWidth: isFocused ? 2 : 1,
          borderColor: isFocused ? colors.onSurface : colors.border,
          flexDirection: "row",
          // "stretch" so a multiline field's TextInput fills the whole
          // box height -- otherwise only its top ~20px was tappable.
          alignItems: multiline ? "stretch" : "center",
          paddingHorizontal: spacing.md,
          paddingVertical: multiline ? spacing.md : 0,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.onSurfaceTertiary}
          keyboardType={keyboardType}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          onFocus={() => onFocus(fieldName)}
          onBlur={onBlur}
          style={[
            { flex: 1, fontSize: 15, color: colors.onSurface, paddingVertical: 0, borderWidth: 0 },
            Platform.OS === "web" && ({ outlineStyle: "none" } as any),
          ]}
        />
      </View>
    </View>
  );
}
