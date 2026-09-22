import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { api } from "@/lib/api";

type SettingsRow = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  /** Undefined for a row whose own task hasn't landed yet -- shown but
   * inert, rather than hidden, so the full shape of Settings is visible
   * from the first pass (see Task #9's ordered subtask list). */
  onPress?: () => void;
};

/**
 * Reached by tapping the "Bună ziua" greeting on Home. Each row below
 * is its own subtask (name, password, email, language, colors, theme)
 * built one at a time -- wire a row's onPress up when its subtask
 * actually lands, don't get ahead of the current one.
 */
export default function Settings() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [editingName, setEditingName] = useState(false);

  const rows: SettingsRow[] = [
    { key: "name", icon: "person-outline", label: "Nume", value: user?.name, onPress: () => setEditingName(true) },
    { key: "password", icon: "lock-closed-outline", label: "Parolă" },
    { key: "email", icon: "mail-outline", label: "Email", value: user?.email },
    { key: "language", icon: "language-outline", label: "Limbă" },
    { key: "colors", icon: "color-palette-outline", label: "Culori" },
    { key: "theme", icon: "sparkles-outline", label: "Temă" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="settings-screen">
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
          }}
        >
          <Pressable
            testID="settings-back"
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
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
          <Text style={{ ...typography.title, color: colors.onSurface }}>Setări</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.sm }}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              testID={`settings-row-${row.key}`}
              onPress={row.onPress}
              disabled={!row.onPress}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                minHeight: 56,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: "transparent",
                opacity: row.onPress ? 1 : 0.5,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={row.icon} size={16} color={colors.onSurface} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.body, color: colors.onSurface }}>{row.label}</Text>
                {row.value ? (
                  <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary, marginTop: 2 }} numberOfLines={1}>
                    {row.value}
                  </Text>
                ) : null}
              </View>

              {row.onPress ? (
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              ) : (
                <Text style={{ ...typography.micro, color: colors.onSurfaceTertiary }}>În curând</Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      <EditNameModal
        visible={editingName}
        initialName={user?.name ?? ""}
        onClose={() => setEditingName(false)}
        onSaved={(name) => {
          updateUser({ name });
          setEditingName(false);
        }}
      />
    </View>
  );
}

function EditNameModal({
  visible,
  initialName,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the current name every time the modal opens -- same
  // reason GroceryRecipeDetailModal snapshots on open rather than
  // reading the live prop: it should always start from what's actually
  // saved, not whatever was left typed from a previous open/cancel.
  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    if (name !== initialName) setName(initialName);
    if (error) setError(null);
  }
  wasVisible.current = visible;

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= 50 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateName(trimmed);
      onSaved(res.user.name);
    } catch (err: any) {
      setError(err?.message || "Nu am putut actualiza numele.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={onClose} style={{ ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" }} />

        <View
          style={{
            width: "100%",
            maxWidth: 380,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            padding: spacing.xl,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.lg }}>
            Schimbă numele
          </Text>

          <TextInput
            testID="settings-name-input"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            onSubmitEditing={handleSave}
            returnKeyType="done"
            placeholder="Numele tău"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoFocus
            maxLength={50}
            style={{
              minHeight: 48,
              paddingHorizontal: spacing.md,
              borderRadius: radius.sm,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.onSurface,
              fontSize: 14,
              marginBottom: spacing.sm,
            }}
          />

          {error ? <Text style={{ fontSize: 12, color: colors.error, marginBottom: spacing.sm }}>{error}</Text> : null}

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable
              testID="settings-name-cancel"
              onPress={onClose}
              disabled={saving}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>Anulează</Text>
            </Pressable>

            <Pressable
              testID="settings-name-save"
              onPress={handleSave}
              disabled={!canSave}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: radius.sm,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
                opacity: canSave ? 1 : 0.5,
              }}
            >
              {saving ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>Salvează</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
