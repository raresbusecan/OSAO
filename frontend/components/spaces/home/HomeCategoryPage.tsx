import React, { useEffect, useRef, useState } from "react";
import { Animated, View, Text, TextInput, Pressable, ScrollView, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SwipeBackView } from "@/components/spaces/SwipeBackView";
import { HomeCategorySection, type HomeCategoryRow } from "./HomeCategorySection";
import { parseLeadingNumber, type HomeCategoryField } from "./homeCategoryConfig";
import { HomeDatePickerSheet } from "./HomeDatePickerSheet";
import { confirmAction } from "@/lib/confirm";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import type { HomeIcon } from "./home.ui.types";

// The add/edit form used to expand INLINE, right below the header,
// pushed there by a "+ Add X" row -- per explicit user request, it's
// now a bottom sheet instead (matching ExpenseEditModal/
// HomeSupplyRestockSheet), with the same drag-to-dismiss handle, built
// on the classic PanGestureHandler + React Native Animated (not
// react-native-reanimated's newer Gesture.Pan()/worklet system,
// confirmed live on a real device to do nothing in this project's Expo
// Go install).
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function formatFieldDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

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
      "Delete entry",
      "Are you sure you want to delete this? This can't be undone.",
      { confirmLabel: "Delete", destructive: true },
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

        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.md,
            backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={17} color={SPACE_IDENTITY_COLORS.home} />
        </View>

        <Text style={{ ...typography.title, color: colors.onSurface }}>
          {title}
        </Text>
      </View>

      <Pressable
        testID="category-add-row"
        onPress={() => setFormExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          height: 46,
          borderRadius: radius.sm,
          backgroundColor: colors.onSurface,
          marginBottom: spacing.xl,
        }}
      >
        <Ionicons name="add" size={15} color={colors.surface} />
        <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.surface }}>
          {submitLabel}
        </Text>
      </Pressable>

      <HomeCategorySection
        title="Existing"
        rows={rows}
        emptyLabel={emptyLabel}
        onRowPress={startEdit}
        onRowDelete={remove}
        onRowResolve={onResolve ? (id) => onResolve(String(id)) : undefined}
      />
    </ScrollView>
    </SwipeBackView>

    {formExpanded ? (
      <CategoryFormSheet
        fields={fields}
        values={values}
        setValues={setValues}
        isFieldVisible={isFieldVisible}
        isFieldInvalid={isFieldInvalid}
        canSubmit={canSubmit}
        editingId={editingId}
        submitLabel={submitLabel}
        onSubmit={submit}
        onCancel={closeForm}
        onResolve={onResolve ? resolve : undefined}
        onDatePickerOpen={setDatePickerFor}
      />
    ) : null}

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

function CategoryFormSheet({
  fields,
  values,
  setValues,
  isFieldVisible,
  isFieldInvalid,
  canSubmit,
  editingId,
  submitLabel,
  onSubmit,
  onCancel,
  onResolve,
  onDatePickerOpen,
}: {
  fields: HomeCategoryField[];
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isFieldVisible: (field: HomeCategoryField) => boolean;
  isFieldInvalid: (field: HomeCategoryField) => boolean;
  canSubmit: boolean;
  editingId: string | null;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  onResolve?: () => void;
  onDatePickerOpen: (fieldKey: string) => void;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  const translateY = useRef(new Animated.Value(0)).current;

  const onHandleGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: translateY } }],
    { useNativeDriver: true },
  );

  const onHandleStateChange = (event: {
    nativeEvent: { state: number; translationY: number; velocityY: number };
  }) => {
    const { state, translationY, velocityY } = event.nativeEvent;
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;

    const pastThreshold = translationY > DISMISS_DISTANCE || velocityY > DISMISS_VELOCITY;
    if (pastThreshold) {
      Animated.timing(translateY, {
        toValue: 600,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onCancel();
      });
    } else {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    }
  };

  // Clamped at 0 -- the handle can't be dragged UP past the sheet's own
  // resting position, only down to dismiss.
  const clampedTranslateY = translateY.interpolate({
    inputRange: [0, 600],
    outputRange: [0, 600],
    extrapolateLeft: "clamp",
  });

  // Backdrop fades out in step with the drag instead of staying flatly
  // opaque until the sheet's already gone.
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, DISMISS_DISTANCE],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <AnimatedPressable
          onPress={onCancel}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", opacity: backdropOpacity }}
        />
        <Animated.View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            maxHeight: "85%",
            transform: [{ translateY: clampedTranslateY }],
          }}
        >
          <PanGestureHandler
            activeOffsetY={10}
            failOffsetY={-10}
            onGestureEvent={onHandleGestureEvent}
            onHandlerStateChange={onHandleStateChange}
          >
            <Animated.View style={{ height: 56, alignItems: "center", justifyContent: "center" }}>
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                }}
              />
            </Animated.View>
          </PanGestureHandler>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.sm }}
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
                      backgroundColor: values[field.key] === "true" ? colors.onSurface : colors.surfaceSecondary,
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
                    onPress={() => onDatePickerOpen(field.key)}
                    style={{
                      height: 44,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.sm,
                      backgroundColor: colors.surfaceSecondary,
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
                          hitSlop={{ top: 4, bottom: 4 }}
                          style={{
                            flex: 1,
                            height: 40,
                            borderRadius: radius.sm,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: selected ? colors.onSurface : colors.surfaceSecondary,
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
                      backgroundColor: colors.surfaceSecondary,
                      borderWidth: 1,
                      borderColor: colors.border,
                      color: colors.onSurface,
                      fontSize: 14,
                    }}
                  />
                )}
                {isFieldInvalid(field) ? (
                  <Text style={{ fontSize: 12, color: colors.error, marginTop: 4 }}>
                    Enter a valid, non-negative number.
                  </Text>
                ) : null}
              </View>
            ))}

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
              <Pressable
                testID="category-submit"
                onPress={onSubmit}
                disabled={!canSubmit}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: radius.sm,
                  // Editing an existing row is a save, not a creation --
                  // green like the resolve button below it, distinct from
                  // the black "add new" fill. Per explicit user request.
                  backgroundColor: editingId ? colors.success : colors.onSurface,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: canSubmit ? 1 : 0.5,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.surface }}>
                  {editingId ? "Save" : submitLabel}
                </Text>
              </Pressable>

              <Pressable
                testID="category-cancel-edit"
                onPress={onCancel}
                style={{
                  height: 46,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.error,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>
                  Cancel
                </Text>
              </Pressable>
            </View>

            {/* Only while editing an existing row, for a category that has
                a resolve concept (Maintenance today) -- a separate,
                full-width row below Save/Cancel rather than crammed into
                the same row as a third button. */}
            {editingId && onResolve ? (
              <Pressable
                testID="category-resolve"
                onPress={onResolve}
                style={{
                  height: 46,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.success,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.success }}>
                  Rezolvă
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
