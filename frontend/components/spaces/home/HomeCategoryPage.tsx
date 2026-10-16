import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useTheme } from "@/lib/theme";
import type { HelpKey } from "@/lib/help";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { HomeCategorySection, type HomeCategoryRow } from "./HomeCategorySection";
import { parseLeadingNumber, type HomeCategoryField } from "./homeCategoryConfig";
import { HomeDatePickerSheet } from "./HomeDatePickerSheet";
import { confirmAction } from "@/lib/confirm";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { TopBar, CircleButton, Identity, Field, FieldButton, Segmented, Button, ToggleRow } from "@/components/ui/primitives";
import { roCount, roDate } from "@/lib/format";
import { GuiltFreeToggle } from "@/components/dashboard/GuiltFree";
import type { HomeIcon } from "./home.ui.types";


export type HomeCategoryPageProps = {
  title: string;
  /** "ⓘ" on the page title and the form: how this category works. */
  info?: HelpKey;
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
  /** "Editează" from the record sheet while this page is open -- opens
   * the form for that row; a new nonce reopens it even for the same id. */
  editRequest?: { id: string; n: number } | null;
  /** Tap on a row: the record preview (instead of the edit form). */
  onRowPreview?: (id: string) => void;
  /** Long press on a row: the record's action sheet. */
  onRowActions?: (id: string) => void;
  /** Opened from Casă's quick-add buttons -- start with the add form up. */
  startWithForm?: boolean;
  /** Only the form sheet, over whatever screen is behind (Casă's main
   * view) -- closing or saving it calls onBack. */
  formOnly?: boolean;
  /** false = rows have no swipe actions. */
  swipeable?: boolean;
  /** Documents: swipe right = the renewal pop-up. */
  onRenew?: (id: string) => void;
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
  startWithForm,
  swipeable,
  onRenew,
  info,
  editRequest,
  onRowPreview,
  onRowActions,
  formOnly,
}: HomeCategoryPageProps) {
  const { spacing } = useTheme();
  const homeColors = useSpaceColors("home");
  const HOME = homeColors.color;
  const [values, setValues] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [datePickerFor, setDatePickerFor] = useState<string | null>(null);
  // The form (add or edit) opens as a bottom sheet, triggered either by
  // the "+ Add X" row or by tapping an existing entry to edit it.
  const [formExpanded, setFormExpanded] = useState(!!startWithForm || !!formOnly);

  const isFieldVisible = (field: HomeCategoryField) =>
    !field.showWhen || values[field.showWhen] === "true";

  // A nonNegativeNumber field only actually blocks submit once it has
  // something typed into it -- an empty required field is already
  // caught by the plain non-empty check below, and re-flagging it as
  // "invalid number" too would just show two contradictory reasons for
  // the same disabled button.
  const isFieldInvalid = (field: HomeCategoryField) => {
    if (field.notBefore) {
      const v = values[field.key];
      const other = values[field.notBefore];
      return !!v && !!other && new Date(v).getTime() < new Date(other).getTime();
    }
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
    if (formOnly) onBack();
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

  // A new edit request (its nonce changed) opens the form for that row --
  // adjusted during render rather than in an effect.
  const [seenEditRequest, setSeenEditRequest] = useState(editRequest?.n);
  if (editRequest && editRequest.n !== seenEditRequest) {
    setSeenEditRequest(editRequest.n);
    setEditingId(editRequest.id);
    setValues(getEditValues(editRequest.id));
    setFormExpanded(true);
  }

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

  const formSheet = (
    <Sheet
      visible={formExpanded}
      onClose={closeForm}
      // "Adaugă factura" -> "Editează factura" (singular, from the category's own label).
      title={editingId ? submitLabel.replace(/^Adaugă/, "Editează") : submitLabel}
      icon={icon}
      tone={HOME}
      testID="category-form"
      info={info}
      footer={
        <>
          <Button testID="category-submit" label={editingId ? "Salvează" : submitLabel} tone={homeColors.fill} onPress={submit} disabled={!canSubmit} />
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
          suffix={field.suffix?.(values)}
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
  );

  if (formOnly) return formSheet;

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

      <Identity color={HOME} kicker="Casă" title={title} info={info} subtitle={rows.length > 0 ? roCount(rows.length, "înregistrare", "înregistrări") : null} />

      <HomeCategorySection
        title="Toate"
        rows={rows}
        emptyLabel={`${emptyLabel} Adaugă una cu „+”.`}
        onRowPress={onRowPreview ? (id) => onRowPreview(String(id)) : startEdit}
        onRowLongPress={onRowActions ? (id) => onRowActions(String(id)) : undefined}
        // No swipe on documents: they're renewed/edited, not swiped away.
        onRowDelete={swipeable === false ? undefined : remove}
        // Same guard as `remove`: never leave the form open on a row that
        // was just resolved (a later Save would build from a stale entry).
        onRowResolve={onResolve ? (id) => { if (editingId === String(id)) closeForm(); onResolve(String(id)); } : undefined}
        onRowRenew={onRenew ? (id) => onRenew(String(id)) : undefined}
      />

    </ScrollView>
    </SwipeBackView>

    {formSheet}
    </>
  );
}

/** One form field, by type: text/number, date, select, toggle. */
function CategoryField({
  field,
  value,
  suffix,
  invalid,
  onChange,
  onOpenDate,
}: {
  field: HomeCategoryField;
  value: string | undefined;
  suffix?: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onOpenDate: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const HOME = useSpaceColors("home").color;
  const optional = field.required === false;
  const label = optional && field.type !== "toggle" ? `${field.label} (opțional)` : field.label;

  if (field.type === "guiltFree") {
    return (
      <GuiltFreeToggle
        testID={`category-field-${field.key}`}
        value={value === "true"}
        onChange={(next) => onChange(next ? "true" : "false")}
        tone={HOME}
      />
    );
  }

  if (field.type === "toggle") {
    return (
      <ToggleRow
        testID={`category-field-${field.key}`}
        label={field.label}
        value={value === "true"}
        onChange={(next) => onChange(next ? "true" : "false")}
        tone={HOME}
      />
    );
  }

  if (field.type === "date") {
    return (
      <View style={{ gap: 6 }}>
        <FieldButton
          testID={`category-field-${field.key}`}
          label={label}
          value={value ? roDate(value, { withYear: true }) : null}
          placeholder="Alege o dată"
          onPress={onOpenDate}
        />
        {invalid ? <Text style={{ fontSize: 13, color: colors.error }}>Nu poate fi înaintea datei de emitere.</Text> : null}
      </View>
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
      suffix={suffix}
      tone={HOME}
      error={invalid ? "Introdu un număr valid, nu negativ." : null}
    />
  );
}
