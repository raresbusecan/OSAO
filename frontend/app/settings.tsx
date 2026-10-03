import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { api } from "@/lib/api";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { TopBar, SectionHeader, Group, Row, IconWell, Button } from "@/components/ui/primitives";

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
 * Reached from the avatar in Home's header. Each row below
 * is its own subtask (name, password, email, language, colors, theme)
 * built one at a time -- wire a row's onPress up when its subtask
 * actually lands, don't get ahead of the current one.
 */
export default function Settings() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { user, updateUser, signOut } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);

  const account: SettingsRow[] = [
    { key: "name", icon: "person-outline", label: "Nume", value: user?.name, onPress: () => setEditingName(true) },
    { key: "email", icon: "mail-outline", label: "Email", value: user?.email, onPress: () => setEditingEmail(true) },
    { key: "password", icon: "lock-closed-outline", label: "Parolă", onPress: () => setEditingPassword(true) },
  ];
  const app: SettingsRow[] = [
    { key: "language", icon: "language-outline", label: "Limbă", value: "Română" },
    { key: "colors", icon: "color-palette-outline", label: "Culori" },
    { key: "theme", icon: "contrast-outline", label: "Temă", value: "Automat" },
  ];

  // Sign-out lives here, behind a confirmation -- it used to be a
  // one-tap icon in Home's header, easy to hit by accident.
  const handleSignOut = async () => {
    const ok = await confirmAction("Ieși din cont?", "Va trebui să te autentifici din nou ca să-ți vezi datele.", {
      confirmLabel: "Ieși",
      destructive: true,
    });
    if (ok) signOut();
  };

  const initial = (user?.name ?? "?").trim().charAt(0).toUpperCase();

  const renderRow = (row: SettingsRow) => (
    <Row
      key={row.key}
      testID={`settings-row-${row.key}`}
      leading={<IconWell icon={row.icon} color={colors.onSurfaceTertiary} tint={colors.onSurfaceSecondary} size={34} />}
      title={row.label}
      onPress={row.onPress}
      dim={!row.onPress}
      trailing={
        <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, maxWidth: 170 }} numberOfLines={1}>
          {row.onPress ? row.value ?? "" : row.value ?? "În curând"}
        </Text>
      }
      chevron={!!row.onPress}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="settings-screen">
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.section }}>
          <TopBar onBack={() => router.back()} backTestID="settings-back" />

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md + 2 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface }}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{user?.name ?? "Setări"}</Text>
              {user?.email ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{user.email}</Text> : null}
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Cont" muted />
            <Group inset={62}>{account.map(renderRow)}</Group>
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Aplicație" muted />
            <Group inset={62}>{app.map(renderRow)}</Group>
          </View>

          <Button testID="settings-signout" variant="destructive" icon="log-out-outline" label="Ieși din cont" onPress={handleSignOut} />
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

      <EditPasswordModal visible={editingPassword} onClose={() => setEditingPassword(false)} />

      <EditEmailModal visible={editingEmail} onClose={() => setEditingEmail(false)} />
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
                borderColor: colors.error,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Anulează</Text>
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

function EditPasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password fields never pre-fill and never carry a draft across
  // opens (unlike EditNameModal's name, which has a real current
  // value worth showing) -- every open starts from a clean slate.
  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }
  wasVisible.current = visible;

  const canSave = current.length > 0 && next.length >= 8 && next === confirm && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await api.updatePassword(current, next);
      onClose();
      notifyAction("Parolă schimbată", "Parola ta a fost actualizată cu succes.");
    } catch (err: any) {
      setError(err?.message || "Nu am putut schimba parola.");
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
            Schimbă parola
          </Text>

          <View style={{ gap: spacing.sm }}>
            <TextInput
              testID="settings-password-current"
              value={current}
              onChangeText={(text) => {
                setCurrent(text);
                if (error) setError(null);
              }}
              placeholder="Parola actuală"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              autoFocus
              style={{
                minHeight: 48,
                paddingHorizontal: spacing.md,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.onSurface,
                fontSize: 14,
              }}
            />

            <TextInput
              testID="settings-password-next"
              value={next}
              onChangeText={(text) => {
                setNext(text);
                if (error) setError(null);
              }}
              placeholder="Parola nouă (minim 8 caractere)"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              style={{
                minHeight: 48,
                paddingHorizontal: spacing.md,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.onSurface,
                fontSize: 14,
              }}
            />

            <TextInput
              testID="settings-password-confirm"
              value={confirm}
              onChangeText={(text) => {
                setConfirm(text);
                if (error) setError(null);
              }}
              onSubmitEditing={handleSave}
              returnKeyType="done"
              placeholder="Confirmă parola nouă"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              style={{
                minHeight: 48,
                paddingHorizontal: spacing.md,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.onSurface,
                fontSize: 14,
              }}
            />
          </View>

          {next.length > 0 && confirm.length > 0 && next !== confirm ? (
            <Text style={{ fontSize: 12, color: colors.error, marginTop: spacing.sm }}>Parolele nu coincid.</Text>
          ) : null}
          {error ? <Text style={{ fontSize: 12, color: colors.error, marginTop: spacing.sm }}>{error}</Text> : null}

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
            <Pressable
              testID="settings-password-cancel"
              onPress={onClose}
              disabled={saving}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.error,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Anulează</Text>
            </Pressable>

            <Pressable
              testID="settings-password-save"
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EditEmailModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Unlike name/password, a successful request doesn't change anything
  // yet -- the new address only takes effect once its own link is
  // opened (see confirm-email.tsx). This stays true after the modal
  // closes and reopens, until the user explicitly asks to start over.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    setEmail("");
    setPassword("");
    setError(null);
  }
  wasVisible.current = visible;

  const trimmedEmail = email.trim();
  const canSave = EMAIL_RE.test(trimmedEmail) && password.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await api.requestEmailChange(trimmedEmail, password);
      setSentTo(trimmedEmail);
    } catch (err: any) {
      setError(err?.message || "Nu am putut trimite cererea.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset the "sent" confirmation only after the close animation would
    // have started -- reopening the row should offer a fresh attempt,
    // not show a stale confirmation from a previous request.
    setSentTo(null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={handleClose} style={{ ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" }} />

        <View
          style={{
            width: "100%",
            maxWidth: 380,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            padding: spacing.xl,
          }}
        >
          {sentTo ? (
            <>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm }}>
                Verifică email-ul nou
              </Text>
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20, marginBottom: spacing.lg }}>
                Am trimis un link de confirmare la „{sentTo}". Emailul contului tău se schimbă abia după ce deschizi acel link -- expiră în 60 de minute.
              </Text>
              <Pressable
                testID="settings-email-done"
                onPress={handleClose}
                style={{
                  minHeight: 48,
                  borderRadius: radius.sm,
                  backgroundColor: colors.onSurface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>Am înțeles</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.lg }}>
                Schimbă emailul
              </Text>

              <View style={{ gap: spacing.sm }}>
                <TextInput
                  testID="settings-email-new"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError(null);
                  }}
                  placeholder="Emailul nou"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoFocus
                  style={{
                    minHeight: 48,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.sm,
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: colors.border,
                    color: colors.onSurface,
                    fontSize: 14,
                  }}
                />

                <TextInput
                  testID="settings-email-password"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={handleSave}
                  returnKeyType="done"
                  placeholder="Parola actuală"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  secureTextEntry
                  style={{
                    minHeight: 48,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.sm,
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: colors.border,
                    color: colors.onSurface,
                    fontSize: 14,
                  }}
                />
              </View>

              {error ? <Text style={{ fontSize: 12, color: colors.error, marginTop: spacing.sm }}>{error}</Text> : null}

              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
                <Pressable
                  testID="settings-email-cancel"
                  onPress={handleClose}
                  disabled={saving}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.error,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Anulează</Text>
                </Pressable>

                <Pressable
                  testID="settings-email-save"
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
                    <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>Trimite link</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
