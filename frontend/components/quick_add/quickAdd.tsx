import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Keyboard, Platform } from "react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

export type QuickAddSheetRef = { present: () => void; dismiss: () => void };

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  task: "checkmark-circle-outline",
  reminder: "notifications-outline",
  note: "document-text-outline",
  expense: "cash-outline",
  event: "calendar-outline",
};

function formatDue(due: string | null) {
  if (!due) return null;
  try {
    const d = new Date(due);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return due;
  }
}

export const QuickAddSheet = forwardRef<QuickAddSheetRef, { onSaved?: () => void }>(({ onSaved }, ref) => {
  const { colors, spacing, radius, isDark } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    present: () => {
      setText(""); setPreview(null); setError(null);
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  const parse = useCallback(async () => {
    if (!text.trim()) return;
    Keyboard.dismiss();
    setParsing(true); setError(null);
    try {
      const r = await api.quickAdd(text);
      setPreview(r.preview);
    } catch (e: any) {
      setError(e?.message || "Could not parse");
    } finally {
      setParsing(false);
    }
  }, [text]);

  const save = useCallback(async () => {
    if (!preview) return;
    setSaving(true); setError(null);
    try {
      await api.createItem(preview);
      setPreview(null); setText("");
      onSaved?.();
      sheetRef.current?.dismiss();
    } catch (e: any) {
      setError(e?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }, [preview, onSaved]);

  const renderBackdrop = useCallback(
    (p: any) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />,
    [],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["55%", "90%"]}
      backdropComponent={renderBackdrop}
      keyboardBehavior={Platform.OS === "ios" ? "extend" : "interactive"}
      keyboardBlurBehavior="restore"
      handleIndicatorStyle={{ backgroundColor: colors.surfaceTertiary }}
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      <BottomSheetView style={{ padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.onSurface }}>Quick Add</Text>
          <View style={{ paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill }}>
            <Text style={{ fontSize: 11, color: colors.onSurfaceTertiary, fontWeight: "600" }}>AI</Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 18 }}>
          Type anything — a task, expense, reminder, note or event. LifeOS will organize it.
        </Text>

        <BottomSheetTextInput
          testID="quick-add-input"
          value={text}
          onChangeText={setText}
          placeholder='e.g. "Pay car insurance €450 on Sept 15" or "Study math tomorrow 7pm"'
          placeholderTextColor={colors.onSurfaceTertiary}
          multiline
          style={{
            minHeight: 90,
            fontSize: 17,
            color: colors.onSurface,
            padding: spacing.lg,
            backgroundColor: colors.surfaceSecondary,
            borderRadius: radius.md,
            textAlignVertical: "top",
          }}
        />

        {error && (
          <Text style={{ color: colors.error, fontSize: 13 }} testID="quick-add-error">{error}</Text>
        )}

        {preview ? (
          <View
            testID="quick-add-preview"
            style={{
              backgroundColor: colors.surfaceSecondary,
              borderRadius: radius.lg,
              padding: spacing.lg,
              gap: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Ionicons name={TYPE_ICONS[preview.type] || "sparkles-outline"} size={18} color={colors.onSurface} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.6 }}>
                {String(preview.type || "task").toUpperCase()}
              </Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.onSurface }}>{preview.title}</Text>
            {preview.notes ? (
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{preview.notes}</Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {preview.due_at ? (
                    <Chip
                    label={formatDue(preview.due_at) || ""}
                    icon="time-outline"
                    />
                ) : null}

                {preview.amount != null ? (
                    <Chip
                    label={`${preview.currency || "EUR"} ${Number(preview.amount).toFixed(2)}`}
                    icon="cash-outline"
                    />
                ) : null}

                {preview.recurrence ? (
                    <Chip label={`↻ ${preview.recurrence}`} />
                ) : null}

                {preview.category ? (
                    <Chip label={preview.category} />
                ) : null}

                {preview.priority ? (
                    <Chip label={preview.priority} />
                ) : null}
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {!preview ? (
            <Pressable
            testID="quick-add-interpret-button"              
            onPress={parse}
              disabled={!text.trim() || parsing}
              style={{
                flex: 1,
                backgroundColor: colors.brandPrimary,
                opacity: !text.trim() || parsing ? 0.5 : 1,
                paddingVertical: 14,
                borderRadius: radius.md,
                alignItems: "center",
              }}
            >
              {parsing ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 }}>Interpret</Text>
              )}
            </Pressable>
          ) : (
            <>
              <Pressable
                testID="quick-add-redo-button"
                onPress={() => setPreview(null)}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.onSurface, fontWeight: "600", fontSize: 15 }}>Edit</Text>
              </Pressable>
              <Pressable
                testID="quick-add-save-button"
                onPress={save}
                disabled={saving}
                style={{
                  flex: 1,
                  backgroundColor: colors.brandPrimary,
                  opacity: saving ? 0.5 : 1,
                  paddingVertical: 14,
                  borderRadius: radius.md,
                  alignItems: "center",
                }}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 }}>Save</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

QuickAddSheet.displayName = "QuickAddSheet";

function Chip({ label, icon }: { label: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {icon ? <Ionicons name={icon} size={12} color={colors.onSurfaceTertiary} /> : null}
      <Text style={{ fontSize: 12, color: colors.onSurface, fontWeight: "500" }}>{label}</Text>
    </View>
  );
}