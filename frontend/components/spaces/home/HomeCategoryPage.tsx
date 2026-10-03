import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { HomeCategorySection, type HomeCategoryRow } from "./HomeCategorySection";
import { parseLeadingNumber, type HomeCategoryField } from "./homeCategoryConfig";
import { HomeDatePickerSheet } from "./HomeDatePickerSheet";
import { confirmAction } from "@/lib/confirm";
import { SPACE_IDENTITY_COLORS, SPACE_BUTTON_FILL } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import { TopBar, CircleButton, Identity, Field, FieldButton, Segmented, Button } from "@/components/ui/primitives";
import { roDate } from "@/lib/format";
import type { HomeIcon } from "./home.ui.types";

const HOME = SPACE_IDENTITY_COLORS.home!;

export type HomeCategoryPageProps = {
  title: string;
  /** Shown as a tinted identity-color chip next to the title -- same
   * glyph each category's own rows already use (see
   * homeCategoryConfig.ts's `icon`), so the page you land on visually
   * matches the rows inside it instead of a bare, icon-less title. */
  icon: HomeIcon;
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
  /** The "Resolved" checkmark on a row -- only passed for a category
   * that actually has one (see homeCategoryConfig.ts's resolveEntry).
   * Omitted entirely for every other category. */
  onResolve?: (id: string) => void;
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
  icon,
  fields,
  submitLabel,
  rows,
  emptyLabel,
  onBack,
  onSubmit,
  onDelete,
  onResolve,
  getEditValues,
  initialEditId,
}: HomeCategoryPageProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [datePickerFor, setDatePickerFor] = useState<string | null>(null);
  // The form (add or edit) opens as a bottom sheet, triggered either by
  // the "+ Add X" row or by tapping an existing entry to edit it.
  const [formExpanded, setFormExpanded] = useState(false);

  const isFieldVisible = (field: HomeCategoryField) =>
    !field.showWhen || values[field.showWhen] === "true";

  // A nonNegativeNumber field only actually blocks submit once it has
  // something typed into it -- an empty required field is already
  // caught by the plain non-empty check below, and re-flagging it as
  // "invalid number" too would just show two contradictory reasons for
  // the same disabled button.
  const isFieldInvalid = (field: HomeCategoryField) => {
    if (!field.nonNegativeNumber) return false;
    const raw = values[field.key] || "";
    if (!raw.trim()) return false;
    const n = parseLeadingNumber(raw);
    return n === null || n < 0;
  };

  const canSubmit = fields
    .filter((field) => isFieldVisible(field))
    .every((field) => {
      if (field.required !== false && !(values[field.key] || "").trim().length) return false;
      if (isFieldInvalid(field)) return false;
      return true;
    });

  const reset = () => {
    setValues({});
    setEditingId(null);
  };

  const closeForm = () => {
    reset();
    setFormExpanded(false);
  };

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(values, editingId ?? undefined);
    closeForm();
  };

  const startEdit = (id: string | number) => {
    setEditingId(String(id));
    setValues(getEditValues(String(id)));
    setFormExpanded(true);
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
      "Ștergi înregistrarea?",
      "Nu se poate anula.",
      { confirmLabel: "Șterge", destructive: true },
    );
    if (!confirmed) return;

    if (editingId === String(id)) closeForm();
    onDelete(String(id));
  };

  // Only ever shown while editing an existing row (never on the "add
  // new" form) of a category that actually has a resolve concept
  // (currently just Maintenance) -- lives in the form itself, right
  // next to Update/Cancel, instead of on the row in the list below.
  const resolve = () => {
    if (!editingId || !onResolve) return;
    onResolve(editingId);
    closeForm();
  };

  return (
    <>
    <SwipeBackView onBack={onBack}>
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="category-back">
        <CircleButton testID="category-add-row" icon="add" label={submitLabel} tone={HOME} onPress={() => setFormExpanded(true)} />
      </TopBar>

      <Identity color={HOME} kicker="Casă" title={title} subtitle={rows.length > 0 ? `${rows.length} ${rows.length === 1 ? "înregistrare" : "înregistrări"}` : null} />

      <HomeCategorySection
        title="Toate"
        rows={rows}
        emptyLabel={`${emptyLabel} Adaugă una cu „+”.`}
        onRowPress={startEdit}
        onRowDelete={remove}
        onRowResolve={onResolve ? (id) => onResolve(String(id)) : undefined}
      />

      {rows.length > 0 ? (
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, textAlign: "center" }}>
          {onResolve ? "Glisează dreapta ca să rezolvi, stânga ca să ștergi." : "Glisează spre stânga ca să ștergi."}
        </Text>
      ) : null}
    </ScrollView>
    </SwipeBackView>

    <Sheet
      visible={formExpanded}
      onClose={closeForm}
      title={editingId ? `Editează: ${title.toLowerCase()}` : submitLabel}
      icon={icon}
      tone={HOME}
      testID="category-form"
      footer={
        <>
          <Button testID="category-submit" label={editingId ? "Salvează" : submitLabel} tone={SPACE_BUTTON_FILL.home} onPress={submit} disabled={!canSubmit} />
          {editingId && onResolve ? (
            <Button testID="category-resolve" variant="secondary" icon="checkmark-circle-outline" label="Rezolvă" onPress={resolve} />
          ) : null}
          {editingId ? (
            <Button testID="category-delete" variant="ghost" icon="trash-outline" label="Șterge" onPress={() => remove(editingId)} />
          ) : null}
        </>
      }
    >
      {fields.filter(isFieldVisible).map((field) => (
        <CategoryField
          key={field.key}
          field={field}
          value={values[field.key]}
          invalid={isFieldInvalid(field)}
          onChange={(v) => setValues((current) => ({ ...current, [field.key]: v }))}
          onOpenDate={() => setDatePickerFor(field.key)}
        />
      ))}

      {/* Rendered INSIDE the form sheet (a nested Modal), not as a sibling
          -- a second sibling Modal can fail to appear on iOS. */}
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
    </Sheet>
    </>
  );
}

/** One form field, by type: text/number, date, select, toggle. */
function CategoryField({
  field,
  value,
  invalid,
  onChange,
  onOpenDate,
}: {
  field: HomeCategoryField;
  value: string | undefined;
  invalid: boolean;
  onChange: (value: string) => void;
  onOpenDate: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const optional = field.required === false;
  const label = optional && field.type !== "toggle" ? `${field.label} (opțional)` : field.label;

  if (field.type === "toggle") {
    const on = value === "true";
    return (
      <Pressable
        testID={`category-field-${field.key}`}
        onPress={() => onChange(on ? "false" : "true")}
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel={field.label}
        style={{
          minHeight: 52,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceTertiary,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 15, color: colors.onSurface }}>{field.label}</Text>
        <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: on ? HOME : colors.control, alignItems: on ? "flex-end" : "flex-start" }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" }} />
        </View>
      </Pressable>
    );
  }

  if (field.type === "date") {
    return (
      <FieldButton
        testID={`category-field-${field.key}`}
        label={label}
        value={value ? roDate(value, { withYear: true }) : null}
        placeholder="Alege o dată"
        onPress={onOpenDate}
      />
    );
  }

  if (field.type === "select") {
    const current = (value ?? field.defaultValue ?? "") as string;
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{label}</Text>
        <Segmented
          testIDPrefix={`category-field-${field.key}`}
          options={(field.options || []).map((o) => ({ key: o.value, label: o.label }))}
          value={current}
          onChange={onChange}
        />
      </View>
    );
  }

  return (
    <Field
      testID={`category-field-${field.key}`}
      label={label}
      value={value || ""}
      onChangeText={onChange}
      placeholder={field.placeholder}
      keyboardType={field.keyboardType === "numeric" || field.nonNegativeNumber ? "decimal-pad" : "default"}
      tone={HOME}
      error={invalid ? "Introdu un număr valid, nu negativ." : null}
    />
  );
}
