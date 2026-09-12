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

import type { CarDocumentEntry } from "@/lib/spaces/car/car.types";

type CarDocumentFormProps = {
  onCancel: () => void;
  onSave: (entry: CarDocumentEntry) => void;
  /** Pass an existing entry to edit it instead of creating a new one. */
  entry?: CarDocumentEntry;
  /** Only meaningful while editing -- deletes this entry entirely. */
  onDelete?: () => void;
  /** True once `entry` is archived or has fallen out of the dashboard's
   * 7-day window (see lib/spaces/car/utils/documentLock.ts) -- renders
   * every field disabled, hides Save/Delete, and swaps Cancel for a
   * plain Close. The caller (CarDashboard.tsx) decides this; the form
   * itself never checks archived/date. */
  readOnly?: boolean;
  /** Opened from a "Expires soon" NEXT alert -- pre-fills Document Type/
   * Title/Issuer from the expiring entry, but this still creates a
   * brand-new record (a renewal), never overwrites the old one. `sourceId`
   * is carried onto the saved entry as `renewedFromId` so the caller can
   * archive the old one -- see CarDashboard.tsx's handleDocumentSave.
   * Ignored when `entry` is set (editing always wins). */
  renewFrom?: Pick<CarDocumentEntry, "documentType" | "title" | "issuer"> & {
    sourceId: string;
  };
};

const DOCUMENT_TYPES = [
  "RCA",
  "CASCO",
  "ITP",
  "Rovinieta",
  "Tax",
];

export default function CarDocumentForm({
  onCancel,
  onSave,
  entry,
  onDelete,
  renewFrom,
  readOnly = false,
}: CarDocumentFormProps) {
  const isEditing = entry !== undefined;
  const isRenewing = !isEditing && renewFrom !== undefined;

  const { colors, spacing, radius } = useTheme();

  const [documentType, setDocumentType] = useState(entry?.documentType ?? renewFrom?.documentType ?? "");
  const [title, setTitle] = useState(entry?.title ?? renewFrom?.title ?? "");
  const [issuer, setIssuer] = useState(entry?.issuer ?? renewFrom?.issuer ?? "");
  const [issueDate, setIssueDate] = useState(entry?.issueDate ?? "");
  const [expiryDate, setExpiryDate] = useState(entry?.expiryDate ?? "");
  const [price, setPrice] = useState(entry?.price !== undefined ? String(entry.price) : "");
  const [notes, setNotes] = useState(entry?.notes ?? "");

  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [error, setError] = useState("");

  const handleTypeSelect = (type: string) => {
    if (!title || title === documentType) {
      setTitle(type);
    }
    setDocumentType(type);
  };

  const handleSave = () => {
    setError("");

    const priceValue = price
      ? Number(price.replace(",", "."))
      : undefined;

    if (!documentType.trim()) {
      setError("Please select a document type.");
      return;
    }

    if (!title.trim()) {
      setError("Please enter a document title.");
      return;
    }

    if (
      price &&
      (priceValue === undefined ||
        Number.isNaN(priceValue) ||
        priceValue < 0)
    ) {
      setError("Please enter a valid price.");
      return;
    }

    if (issueDate && !isValidDate(issueDate)) {
      setError(
        "Issue date must use the format DD.MM.YYYY.",
      );
      return;
    }

    if (expiryDate && !isValidDate(expiryDate)) {
      setError(
        "Expiry date must use the format DD.MM.YYYY.",
      );
      return;
    }

    if (
      issueDate &&
      expiryDate &&
      parseDate(expiryDate) < parseDate(issueDate)
    ) {
      setError(
        "Expiry date cannot be before the issue date.",
      );
      return;
    }

    const entryToSave: CarDocumentEntry = {
      id: entry?.id ?? `document-${Date.now()}`,
      date: entry?.date ?? new Date().toISOString(),
      documentType: documentType.trim(),
      title: title.trim(),
      issuer: issuer.trim() || undefined,
      issueDate: issueDate.trim() || undefined,
      expiryDate: expiryDate.trim() || undefined,
      price: priceValue,
      notes: notes.trim() || undefined,
      renewedFromId: isRenewing ? renewFrom?.sourceId : entry?.renewedFromId,
    };

    onSave(entryToSave);
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      "Delete document",
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
                  name="document-text-outline"
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
                {readOnly ? "Document" : isEditing ? "Edit Document" : "Add Document"}
              </Text>
            </View>

            <Text
              style={{
                marginTop: 6,
                fontSize: 13,
                color: colors.onSurfaceTertiary,
              }}
            >
              {readOnly
                ? "Read-only -- see below"
                : isEditing
                  ? "Update this document"
                  : "Record a vehicle document"}
            </Text>
          </View>

          <Pressable
            onPress={onCancel}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close document form"
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

        {isRenewing ? (
          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSecondary,
              marginBottom: spacing.lg,
            }}
          >
            <Ionicons name="information-circle-outline" size={18} color={colors.onSurfaceTertiary} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 17 }}>
              Creating a new record for this renewal -- your previous{" "}
              {renewFrom?.documentType || "document"} stays in your history, not overwritten.
            </Text>
          </View>
        ) : null}

        {readOnly ? (
          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSecondary,
              marginBottom: spacing.lg,
            }}
          >
            <Ionicons name="lock-closed-outline" size={18} color={colors.onSurfaceTertiary} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 17 }}>
              {entry?.archived
                ? "This document was replaced by a renewal, so it's locked -- an archived record stays exactly as filed."
                : "This document is in History (older than 7 days), so it's locked -- edit it while it's still on the dashboard, or use it as the source for a renewal instead."}
            </Text>
          </View>
        ) : null}

        {/* Document Type */}

        <Text
          style={{
            marginBottom: spacing.sm,
            fontSize: 12,
            fontWeight: "700",
            color: colors.onSurfaceTertiary,
          }}
        >
          Document Type
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {DOCUMENT_TYPES.map((type) => {
            const selected = documentType === type;

            return (
              <Pressable
                key={type}
                onPress={readOnly ? undefined : () => handleTypeSelect(type)}
                disabled={readOnly}
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
                  opacity: readOnly && !selected ? 0.5 : 1,
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
                  {type}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Title */}

        <FormField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. RCA 2026"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="title"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
          disabled={readOnly}
        />

        {/* Issuer */}

        <FormField
          label="Issuer"
          value={issuer}
          onChangeText={setIssuer}
          placeholder="e.g. Allianz"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="issuer"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
          disabled={readOnly}
        />

        {/* Issue Date */}

        <FormField
          label="Issue Date"
          value={issueDate}
          onChangeText={setIssueDate}
          placeholder="DD.MM.YYYY"
          keyboardType="default"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="issueDate"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
          disabled={readOnly}
        />

        {/* Expiry Date */}

        <FormField
          label="Expiry Date"
          value={expiryDate}
          onChangeText={setExpiryDate}
          placeholder="DD.MM.YYYY"
          keyboardType="default"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="expiryDate"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
          disabled={readOnly}
        />

        {/* Price */}

        <FormField
          label="Price"
          value={price}
          onChangeText={setPrice}
          placeholder="e.g. 650"
          keyboardType="decimal-pad"
          suffix="RON"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="price"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
          disabled={readOnly}
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
          disabled={readOnly}
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

        {/* Save -- hidden entirely while readOnly, not just disabled;
            there's nothing valid to submit. */}

        {!readOnly ? (
          <Pressable
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="Save document"
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
              {isEditing ? "Save Changes" : "Save Document"}
            </Text>
          </Pressable>
        ) : null}

        {/* Cancel / Close -- same dismiss handler either way, just
            relabeled so "Close" doesn't imply there was anything to
            discard. */}

        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={readOnly ? "Close document" : "Cancel document"}
          style={{
            marginTop: readOnly ? spacing.xl : spacing.sm,
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
            {readOnly ? "Close" : "Cancel"}
          </Text>
        </Pressable>

        {!readOnly && isEditing && onDelete ? (
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete document"
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
  keyboardType?: "default" | "decimal-pad";
  suffix?: string;
  multiline?: boolean;
  /** Read-only mode (see the `readOnly` form prop) -- dims the field and
   * blocks typing, the input still shows its saved value. */
  disabled?: boolean;
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
  disabled = false,
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
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          editable={!disabled}
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

function isValidDate(value: string) {
  const match = value.match(
    /^(\d{2})\.(\d{2})\.(\d{4})$/,
  );

  if (!match) {
    return false;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseDate(value: string) {
  const [day, month, year] = value
    .split(".")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
  ).getTime();
}