import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { confirmAction } from "@/lib/confirm";

import type { HomeTaskEntry } from "@/lib/spaces/home/home.types";
import { HomeDatePickerSheet } from "@/components/spaces/home/HomeDatePickerSheet";

type HomeTaskFormProps = {
  onCancel: () => void;
  onSave: (entry: HomeTaskEntry) => void;
  /** Pass an existing entry to edit it instead of creating a new one. */
  entry?: HomeTaskEntry;
  /** Only meaningful while editing -- deletes this entry entirely. */
  onDelete?: () => void;
};

export default function HomeTaskForm({
  onCancel,
  onSave,
  entry,
  onDelete,
}: HomeTaskFormProps) {
  const isEditing = entry !== undefined;

  const { colors, spacing, radius } = useTheme();

  const [title, setTitle] = useState(entry?.title ?? "");
  // Unlike Car's forms, a task's due date is optional -- not every task
  // needs a deadline, so this starts unset for a new task instead of
  // defaulting to today. Picked via HomeDatePickerSheet (a day grid, not
  // typed text), so this is already a valid ISO string or undefined --
  // no format parsing/validation needed for it anymore.
  const [dueDate, setDueDate] = useState<string | undefined>(entry?.dueDate);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [isPurchase, setIsPurchase] = useState(entry?.isPurchase ?? false);
  const [isRecurring, setIsRecurring] = useState(entry?.isRecurring ?? false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<HomeTaskEntry["recurrenceFrequency"]>(
    entry?.recurrenceFrequency,
  );
  const [notes, setNotes] = useState(entry?.notes ?? "");

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleSave = () => {
    setError("");

    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }

    if (isRecurring && !recurrenceFrequency) {
      setError("Alege cât de des se repetă task-ul.");
      return;
    }

    const entryToSave: HomeTaskEntry = {
      id: entry?.id ?? `task-${Date.now()}`,
      title: title.trim(),
      dueDate,
      completed: entry?.completed ?? false,
      completedAt: entry?.completedAt,
      isPurchase,
      // Price is only ever set from the resolve sheet, never here -- the
      // real cost usually isn't known until the task is actually done.
      price: entry?.price,
      isRecurring,
      recurrenceFrequency: isRecurring ? recurrenceFrequency : undefined,
      notes: notes.trim() || undefined,
      // Preserved, never derived from this form -- only resolveTask
      // appends to this (see HomeDashboard.tsx). An unrelated edit
      // (title, notes) must not wipe out every past resolve's price.
      spendHistory: entry?.spendHistory,
    };

    onSave(entryToSave);
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      "Delete task",
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.md,
                  // Same tinted-chip identity signal as the Space header
                  // avatar (HomeHeader.tsx) -- this form makes a Home
                  // entry, same identity, not a state/nav element.
                  backgroundColor: `${SPACE_IDENTITY_COLORS.home}1A`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={19} color={SPACE_IDENTITY_COLORS.home} />
              </View>

              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: colors.onSurface,
                  letterSpacing: -0.3,
                }}
              >
                {isEditing ? "Edit Task" : "Add Task"}
              </Text>
            </View>

            <Text style={{ marginTop: 6, fontSize: 13, color: colors.onSurfaceTertiary }}>
              {isEditing ? "Update this task" : "A quick thing to do around the house"}
            </Text>
          </View>

          <Pressable
            onPress={onCancel}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close task form"
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

        {/* Title */}

        <FormField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Scoate gunoiul"
          required
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="title"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {/* Due date -- optional, unlike every Car date field. A day-grid
            picker (HomeDatePickerSheet), not typed text -- no format to
            get wrong. */}

        <View style={{ marginBottom: spacing.xl }}>
          <Text style={{ marginBottom: spacing.sm, fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }}>
            Due date
          </Text>
          <Pressable
            onPress={() => setDatePickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Choose due date"
            style={{
              minHeight: 52,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceSecondary,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: spacing.md,
            }}
          >
            <Text style={{ fontSize: 15, color: dueDate ? colors.onSurface : colors.onSurfaceTertiary }}>
              {dueDate
                ? new Date(dueDate).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })
                : "Fără dată (opțional)"}
            </Text>
            <Ionicons name="calendar-outline" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        {datePickerVisible ? (
          <HomeDatePickerSheet
            value={dueDate}
            onCancel={() => setDatePickerVisible(false)}
            onSelect={(picked) => {
              setDueDate(picked);
              setDatePickerVisible(false);
            }}
          />
        ) : null}

        {/* Purchase toggle -- price itself is never asked here, only at
            resolution (HomeTaskResolveSheet), since the real cost usually
            isn't known yet. */}

        <View
          style={{
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1.5,
            borderColor: isPurchase ? colors.onSurface : colors.border,
            padding: spacing.md,
            marginBottom: spacing.xl,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceTertiary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="cart-outline" size={16} color={colors.onSurface} />
              </View>
              <Text style={{ fontSize: 14.5, fontWeight: "700", color: colors.onSurface }}>
                Implică o cumpărare
              </Text>
            </View>
            <Switch
              value={isPurchase}
              onValueChange={setIsPurchase}
              trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
            />
          </View>
          <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 16 }}>
            Vei putea introduce prețul când marchezi task-ul ca rezolvat — nu acum.
          </Text>
        </View>

        {/* Recurring toggle -- a recurring task never archives when
            resolved; it logs the occurrence and stays active, ready for
            next time. Only a non-recurring task archives on resolve. */}

        <View
          style={{
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1.5,
            borderColor: isRecurring ? colors.onSurface : colors.border,
            padding: spacing.md,
            marginBottom: spacing.xl,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceTertiary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="repeat-outline" size={16} color={colors.onSurface} />
              </View>
              <Text style={{ fontSize: 14.5, fontWeight: "700", color: colors.onSurface }}>
                Task recurent
              </Text>
            </View>
            <Switch
              value={isRecurring}
              onValueChange={setIsRecurring}
              trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
            />
          </View>
          <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 16 }}>
            {isRecurring
              ? "Nu se arhivează la rezolvare — rămâne activ, gata pentru data următoare."
              : "Se arhivează imediat ce e marcat ca rezolvat."}
          </Text>

          {isRecurring ? (
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              {(
                [
                  { key: "daily", label: "Zilnic" },
                  { key: "weekly", label: "Săptămânal" },
                  { key: "monthly", label: "Lunar" },
                ] as const
              ).map((option) => {
                const selected = recurrenceFrequency === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setRecurrenceFrequency(option.key)}
                    style={{
                      flex: 1,
                      minHeight: 40,
                      borderRadius: radius.pill,
                      backgroundColor: selected ? colors.onSurface : colors.surfaceTertiary,
                      borderWidth: 1,
                      borderColor: selected ? colors.onSurface : colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: selected ? colors.surface : colors.onSurface,
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* Notes */}

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

        {/* Error */}

        {error ? (
          <View
            style={{
              marginTop: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceSecondary,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 13, color: colors.onSurface }}>{error}</Text>
          </View>
        ) : null}

        {/* Save */}

        <Pressable
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save task"
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
            {isEditing ? "Save Changes" : "Save Task"}
          </Text>
        </Pressable>

        {/* Cancel */}

        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel task"
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
            accessibilityLabel="Delete task"
            style={{
              marginTop: spacing.sm,
              minHeight: 48,
              borderRadius: radius.md,
              alignItems: "center",
              justifyContent: "center",
            }}
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
          // "flex-start" left the TextInput sized to its own single-line
          // content (~20px) inside a visually 90px-tall box -- the rest
          // of the box was just empty padding, untappable and
          // untypeable. "stretch" makes the input actually fill the
          // whole box's height, so tapping anywhere in it focuses it.
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
