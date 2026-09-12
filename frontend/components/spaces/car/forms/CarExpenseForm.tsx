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
import { confirmAction } from "@/lib/confirm";

import type { CarExpenseEntry } from "@/lib/spaces/car/car.types";
import { formatDateInput, isValidDateInput, parseDateInput } from "@/lib/spaces/car/utils/dateInput";

type CarExpenseFormProps = {
  onCancel: () => void;
  onSave: (entry: CarExpenseEntry) => void;
  /** Pass an existing entry to edit it instead of creating a new one. */
  entry?: CarExpenseEntry;
  /** Only meaningful while editing -- deletes this entry entirely. */
  onDelete?: () => void;
};

const EXPENSE_CATEGORIES = [
  "Parking",
  "Fines",
  "Car Wash",
  "Accessories",
  "Tolls",
  "Other",
];

export default function CarExpenseForm({
  onCancel,
  onSave,
  entry,
  onDelete,
}: CarExpenseFormProps) {
  const isEditing = entry !== undefined;

  const { colors, spacing, radius } = useTheme();

  const [category, setCategory] = useState(entry?.category ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [odometer, setOdometer] = useState(entry?.odometer !== undefined ? String(entry.odometer) : "");
  const [provider, setProvider] = useState(entry?.provider ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");

  // Defaults to today -- an expense gets logged the day it happens most
  // of the time, but a receipt from earlier in the week shouldn't have
  // to become "today's" entry just because that's when you got around
  // to logging it.
  const [date, setDate] = useState(formatDateInput(entry?.date ?? new Date()));

  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [error, setError] = useState("");

  const handleCategorySelect = (item: string) => {
    if (!title || title === category) {
      setTitle(item);
    }
    setCategory(item);
  };

  const handleSave = () => {
    setError("");

    const amountValue = Number(
      amount.replace(",", "."),
    );

    const odometerValue = odometer
      ? Number(odometer.replace(",", "."))
      : undefined;

    if (!category.trim()) {
      setError("Please select an expense category.");
      return;
    }

    if (!title.trim()) {
      setError("Please enter an expense title.");
      return;
    }

    if (
      !amount ||
      Number.isNaN(amountValue) ||
      amountValue <= 0
    ) {
      setError("Please enter a valid amount.");
      return;
    }

    if (
      odometer &&
      (odometerValue === undefined ||
        Number.isNaN(odometerValue) ||
        odometerValue <= 0)
    ) {
      setError("Please enter a valid odometer value.");
      return;
    }

    if (!isValidDateInput(date)) {
      setError("Date must use the format DD.MM.YYYY.");
      return;
    }

    const entryToSave: CarExpenseEntry = {
      id: entry?.id ?? `expense-${Date.now()}`,
      date: parseDateInput(date) ?? entry?.date ?? new Date().toISOString(),
      category: category.trim(),
      title: title.trim(),
      amount: amountValue,
      odometer: odometerValue,
      provider: provider.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    onSave(entryToSave);
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      "Delete expense",
      "This entry will be permanently deleted.",
      { confirmLabel: "Delete", destructive: true },
    );

    if (confirmed) {
      onDelete?.();
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={
        Platform.OS === "ios" ? "padding" : undefined
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing.xl,
        }}
      >
        {/* Header */}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.xl,
          }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.md,
                  backgroundColor:
                    colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="receipt-outline"
                  size={19}
                  color={colors.onSurface}
                />
              </View>

              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: colors.onSurface,
                  letterSpacing: -0.3,
                }}
              >
                {isEditing ? "Edit Expense" : "Add Expense"}
              </Text>
            </View>

            <Text
              style={{
                marginTop: 6,
                fontSize: 13,
                color: colors.onSurfaceTertiary,
              }}
            >
              {isEditing ? "Update this expense" : "Record a vehicle-related expense"}
            </Text>
          </View>

          <Pressable
            onPress={onCancel}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close expense form"
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor:
                colors.surfaceSecondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="close"
              size={20}
              color={colors.onSurfaceTertiary}
            />
          </Pressable>
        </View>

        {/* Category */}

        <Text
          style={{
            marginBottom: spacing.sm,
            fontSize: 12,
            fontWeight: "700",
            color: colors.onSurfaceTertiary,
          }}
        >
          Category
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {EXPENSE_CATEGORIES.map((item) => {
            const selected = category === item;

            return (
              <Pressable
                key={item}
                onPress={() => handleCategorySelect(item)}
                style={{
                  paddingHorizontal: spacing.md,
                  minHeight: 40,
                  borderRadius: radius.pill,
                  backgroundColor: selected
                    ? colors.onSurface
                    : colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: selected
                    ? colors.onSurface
                    : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: selected
                      ? colors.surface
                      : colors.onSurface,
                  }}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Date */}

        <FormField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="DD.MM.YYYY"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="date"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {/* Title */}

        <FormField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Parking at airport"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="title"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {/* Amount */}

        <FormField
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          placeholder="e.g. 25"
          keyboardType="decimal-pad"
          suffix="RON"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="amount"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {/* Odometer */}

        <FormField
          label="Odometer"
          value={odometer}
          onChangeText={setOdometer}
          placeholder="e.g. 123580"
          keyboardType="number-pad"
          suffix="km"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="odometer"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {/* Provider */}

        <FormField
          label="Provider"
          value={provider}
          onChangeText={setProvider}
          placeholder="e.g. Airport Parking"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="provider"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {/* Notes */}

        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional notes"
          colors={colors}
          spacing={spacing}
          radius={radius}
          multiline
          fieldName="notes"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {/* Error */}

        {error ? (
          <View
            style={{
              marginTop: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor:
                colors.surfaceSecondary,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: colors.onSurface,
              }}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {/* Save */}

        <Pressable
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save expense"
          style={{
            marginTop: spacing.xl,
            minHeight: 52,
            borderRadius: radius.md,
            backgroundColor: colors.onSurface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: colors.surface,
            }}
          >
            {isEditing ? "Save Changes" : "Save Expense"}
          </Text>
        </Pressable>

        {/* Cancel */}

        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel expense"
          style={{
            marginTop: spacing.sm,
            minHeight: 48,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: colors.onSurface,
            }}
          >
            Cancel
          </Text>
        </Pressable>

        {isEditing && onDelete ? (
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete expense"
            style={{
              marginTop: spacing.sm,
              minHeight: 48,
              borderRadius: radius.md,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: colors.error,
              }}
            >
              Delete Entry
            </Text>
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
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  suffix?: string;
  multiline?: boolean;
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
  suffix,
  multiline = false,
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
      <Text
        style={{
          marginBottom: spacing.sm,
          fontSize: 12,
          fontWeight: "700",
          color: colors.onSurfaceTertiary,
        }}
      >
        {label}
      </Text>

      <View
        style={{
          minHeight: multiline ? 90 : 52,
          borderRadius: radius.md,
          backgroundColor:
            colors.surfaceSecondary,
          borderWidth: isFocused ? 2 : 1,
          borderColor: isFocused
            ? colors.onSurface
            : colors.border,
          flexDirection: "row",
          alignItems: multiline
            ? "flex-start"
            : "center",
          paddingHorizontal: spacing.md,
          paddingVertical: multiline
            ? spacing.md
            : 0,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={
            colors.onSurfaceTertiary
          }
          keyboardType={keyboardType}
          multiline={multiline}
          textAlignVertical={
            multiline ? "top" : "center"
          }
          onFocus={() => onFocus(fieldName)}
          onBlur={onBlur}
          style={[{
            flex: 1,
            fontSize: 15,
            color: colors.onSurface,
            paddingVertical: 0,
            borderWidth: 0,
          }, Platform.OS === "web" && { outlineStyle: "none" } as any]}
        />

        {suffix ? (
          <Text
            style={{
              marginLeft: spacing.sm,
              fontSize: 12,
              fontWeight: "700",
              color: colors.onSurfaceTertiary,
            }}
          >
            {suffix}
          </Text>
        ) : null}
      </View>
    </View>
  );
}