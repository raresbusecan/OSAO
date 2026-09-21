import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { HomeCategorySection, type HomeCategoryRow } from "./HomeCategorySection";
import type { HomeCategoryField } from "./homeCategoryConfig";
import { HomeDatePickerSheet } from "./HomeDatePickerSheet";
import { confirmAction } from "@/lib/confirm";

function formatFieldDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

export type HomeCategoryPageProps = {
  title: string;
  fields: HomeCategoryField[];
  submitLabel: string;
  rows: HomeCategoryRow[];
  emptyLabel: string;
  onBack: () => void;
  /** `editingId` is set when this save is an edit of an existing row
   * rather than a new one -- see HomeDashboard, which resolves it back to
   * the full entry via the category's own `entries`/`buildEntry`. */
  onSubmit: (values: Record<string, string>, editingId?: string) => void;
  onDelete: (id: string) => void;
  /** Prefills the form when a row is tapped, via the category's own
   * `valuesFromEntry`. */
  getEditValues: (id: string) => Record<string, string>;
  /** Deep-link from TodoCarouselSheet's "Deschide" -- pre-opens this
   * row for edit on mount, same as tapping it, instead of leaving the
   * user to find it themselves among the rest of "Existing". */
  initialEditId?: string | null;
};

/**
 * One generic "dedicated category page" (form + existing entries),
 * configured per category via homeCategoryConfig.ts instead of five
 * near-identical hand-written form files. Doubles as the edit form: tapping
 * an existing row prefills the same fields and switches the submit button
 * to "Update" instead of appending a new entry.
 */
export function HomeCategoryPage({
  title,
  fields,
  submitLabel,
  rows,
  emptyLabel,
  onBack,
  onSubmit,
  onDelete,
  getEditValues,
  initialEditId,
}: HomeCategoryPageProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [datePickerFor, setDatePickerFor] = useState<string | null>(null);

  const isFieldVisible = (field: HomeCategoryField) =>
    !field.showWhen || values[field.showWhen] === "true";

  const canSubmit = fields
    .filter((field) => field.required !== false && isFieldVisible(field))
    .every((field) => (values[field.key] || "").trim().length > 0);

  const reset = () => {
    setValues({});
    setEditingId(null);
  };

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(values, editingId ?? undefined);
    reset();
  };

  const startEdit = (id: string | number) => {
    setEditingId(String(id));
    setValues(getEditValues(String(id)));
  };

  const openedInitialEditRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialEditId) return;
    if (openedInitialEditRef.current === initialEditId) return;
    openedInitialEditRef.current = initialEditId;
    startEdit(initialEditId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditId]);

  const remove = async (id: string | number) => {
    const confirmed = await confirmAction(
      "Delete entry",
      "Are you sure you want to delete this? This can't be undone.",
      { confirmLabel: "Delete", destructive: true },
    );
    if (!confirmed) return;

    if (editingId === String(id)) reset();
    onDelete(String(id));
  };

  return (
    <>
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 150 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
        }}
      >
        <Pressable
          testID="category-back"
          onPress={onBack}
          hitSlop={10}
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <Text style={{ ...typography.title, color: colors.onSurface }}>
          {title}
        </Text>
      </View>

      <View
        style={{
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
          padding: spacing.lg,
          gap: spacing.sm,
          marginBottom: spacing.xl,
        }}
      >
        {fields.filter(isFieldVisible).map((field) => (
          <View key={field.key}>
            {field.type !== "toggle" ? (
              <Text
                style={{
                  ...typography.label,
                  color: colors.onSurfaceTertiary,
                  marginBottom: 4,
                  textTransform: "uppercase",
                }}
              >
                {field.label}
                {field.required !== false ? <Text style={{ color: colors.error }}> *</Text> : null}
              </Text>
            ) : null}

            {field.type === "toggle" ? (
              <Pressable
                testID={`category-field-${field.key}`}
                onPress={() =>
                  setValues((current) => ({
                    ...current,
                    [field.key]: current[field.key] === "true" ? "false" : "true",
                  }))
                }
                accessibilityRole="button"
                accessibilityState={{ selected: values[field.key] === "true" }}
                style={{
                  height: 44,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.sm,
                  backgroundColor: values[field.key] === "true" ? colors.onSurface : colors.surface,
                  borderWidth: 1,
                  borderColor: values[field.key] === "true" ? colors.onSurface : colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: values[field.key] === "true" ? colors.surface : colors.onSurface,
                  }}
                >
                  {field.placeholder || field.label}
                </Text>
                <Ionicons
                  name={values[field.key] === "true" ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={values[field.key] === "true" ? colors.surface : colors.onSurfaceTertiary}
                />
              </Pressable>
            ) : field.type === "date" ? (
              <Pressable
                testID={`category-field-${field.key}`}
                onPress={() => setDatePickerFor(field.key)}
                style={{
                  height: 44,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontSize: 14, color: values[field.key] ? colors.onSurface : colors.onSurfaceTertiary }}>
                  {values[field.key] ? formatFieldDate(values[field.key]) : "Set a date"}
                </Text>
                <Ionicons name="calendar-outline" size={16} color={colors.onSurfaceTertiary} />
              </Pressable>
            ) : field.type === "select" ? (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {(field.options || []).map((option) => {
                  const selected = (values[field.key] ?? field.defaultValue) === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      testID={`category-field-${field.key}-${option.value}`}
                      onPress={() => setValues((current) => ({ ...current, [field.key]: option.value }))}
                      style={{
                        flex: 1,
                        height: 40,
                        borderRadius: radius.sm,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: selected ? colors.onSurface : colors.surface,
                        borderWidth: 1,
                        borderColor: selected ? colors.onSurface : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: "700", color: selected ? colors.surface : colors.onSurfaceTertiary }}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextInput
                testID={`category-field-${field.key}`}
                value={values[field.key] || ""}
                onChangeText={(text) => setValues((current) => ({ ...current, [field.key]: text }))}
                placeholder={field.placeholder}
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType={field.keyboardType === "numeric" ? "numeric" : "default"}
                style={{
                  height: 44,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.onSurface,
                  fontSize: 14,
                }}
              />
            )}
          </View>
        ))}

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
          <Pressable
            testID="category-submit"
            onPress={submit}
            disabled={!canSubmit}
            style={{
              flex: 1,
              height: 46,
              borderRadius: radius.sm,
              backgroundColor: colors.onSurface,
              alignItems: "center",
              justifyContent: "center",
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.surface }}>
              {editingId ? `Update ${title.replace(/s$/, "")}` : submitLabel}
            </Text>
          </Pressable>

          {editingId ? (
            <Pressable
              testID="category-cancel-edit"
              onPress={reset}
              style={{
                height: 46,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                Cancel
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <HomeCategorySection
        title="Existing"
        rows={rows}
        emptyLabel={emptyLabel}
        onRowPress={startEdit}
        onRowDelete={remove}
      />
    </ScrollView>

    {datePickerFor ? (
      <HomeDatePickerSheet
        value={values[datePickerFor]}
        onCancel={() => setDatePickerFor(null)}
        onSelect={(dateIso) => {
          setValues((current) => ({ ...current, [datePickerFor]: dateIso || "" }));
          setDatePickerFor(null);
        }}
      />
    ) : null}
    </>
  );
}
