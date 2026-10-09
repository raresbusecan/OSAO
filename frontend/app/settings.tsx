import React, { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { api, apiErrorMessage } from "@/lib/api";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { TopBar, SectionHeader, Group, Row, IconWell, Button, Field } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { PasswordField } from "@/components/auth/AuthShell";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailBanner";
import { VerifiedBadge } from "@/components/auth/VerifiedBadge";
import { PROVIDER_LABEL, type SocialProvider } from "@/lib/socialAuth";
import { TOUR_LIST, clearSeenLocally, requestTour, tourExists, type TourKey } from "@/lib/tours";

const PROVIDER_ICON: Record<SocialProvider, keyof typeof Ionicons.glyphMap> = {
  apple: "logo-apple",
  google: "logo-google",
  facebook: "logo-facebook",
};

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
  const [settingPassword, setSettingPassword] = useState(false);
  const [toursOpen, setToursOpen] = useState(false);

  // Social-only account (signed up with Apple/Google/Facebook, no password
  // yet): both password-protected sheets would be dead ends, so "Parolă"
  // becomes "Setează o parolă" and Email asks for a password first.
  const noPassword = user?.has_password === false;
  const askPasswordFirst = async () => {
    const ok = await confirmAction(
      "Setează mai întâi o parolă",
      "Ca să schimbi emailul îți trebuie o parolă. Acum intri doar prin Apple, Google sau Facebook; după ce setezi o parolă, poți schimba și emailul.",
      { confirmLabel: "Setează o parolă" },
    );
    if (ok) setSettingPassword(true);
  };

  const account: SettingsRow[] = [
    { key: "name", icon: "person-outline", label: "Nume", value: user?.name, onPress: () => setEditingName(true) },
    { key: "email", icon: "mail-outline", label: "Email", value: user?.email, onPress: noPassword ? askPasswordFirst : () => setEditingEmail(true) },
    noPassword
      ? { key: "password", icon: "lock-closed-outline", label: "Setează o parolă", onPress: () => setSettingPassword(true) }
      : { key: "password", icon: "lock-closed-outline", label: "Parolă", onPress: () => setEditingPassword(true) },
  ];
  const app: SettingsRow[] = [
    { key: "language", icon: "language-outline", label: "Limbă", value: "Română" },
    { key: "colors", icon: "color-palette-outline", label: "Culori" },
    { key: "theme", icon: "contrast-outline", label: "Temă", value: "Automat" },
    { key: "tours", icon: "map-outline", label: "Revezi ghidurile", onPress: () => setToursOpen(true) },
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

  const linkedProviders = (user?.providers ?? []).filter((p): p is SocialProvider => p in PROVIDER_LABEL);

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
              <VerifiedBadge user={user} avatarSize={56} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{user?.name ?? "Setări"}</Text>
              {user?.email ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{user.email}</Text> : null}
            </View>
          </View>

          <VerifyEmailBanner testID="settings-verify-email-banner" />

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Cont" muted />
            <Group inset={62}>
              {account.map(renderRow)}
              {/* Read-only: social accounts linked to this user (lib/socialAuth.ts). */}
              {linkedProviders.map((p) => (
                <Row
                  key={`provider-${p}`}
                  testID={`settings-provider-${p}`}
                  leading={<IconWell icon={PROVIDER_ICON[p]} color={colors.onSurfaceTertiary} tint={colors.onSurfaceSecondary} size={34} />}
                  title={`Conectat cu ${PROVIDER_LABEL[p]}`}
                />
              ))}
            </Group>
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

      <SetPasswordModal
        visible={settingPassword}
        email={user?.email}
        onClose={() => setSettingPassword(false)}
        onSaved={() => {
          updateUser({ has_password: true });
          setSettingPassword(false);
        }}
      />

      <EditEmailModal visible={editingEmail} onClose={() => setEditingEmail(false)} />

      <ToursSheet
        visible={toursOpen}
        onClose={() => setToursOpen(false)}
        onStart={(key) => {
          setToursOpen(false);
          // Acasă's useAutoTour picks the request up once it's focused and
          // this screen (and the sheet's Modal) are gone.
          requestTour(key);
          router.dismissTo("/(tabs)/home");
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
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the current name every time the sheet opens -- it
  // should always start from what's actually saved, not whatever was
  // left typed from a previous open/cancel.
  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    if (name !== initialName) setName(initialName);
    if (error) setError(null);
  }
  wasVisible.current = visible;

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= 50 && trimmed !== initialName.trim();

  const handleSave = async () => {
    if (!canSave || saving) return;
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
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Numele tău"
      icon="person-outline"
      testID="settings-name-sheet"
      footer={<Button testID="settings-name-save" label="Salvează" onPress={handleSave} loading={saving} disabled={!canSave} />}
    >
      <Field
        testID="settings-name-input"
        label="Nume"
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError(null);
        }}
        onSubmitEditing={handleSave}
        returnKeyType="done"
        placeholder="Cum să-ți spunem"
        autoFocus
        maxLength={50}
        error={error}
      />
    </Sheet>
  );
}

function EditPasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password fields never pre-fill and never carry a draft across
  // opens -- every open starts from a clean slate.
  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }
  wasVisible.current = visible;

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const canSave = current.length > 0 && next.length >= 8 && next === confirm;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.updatePassword(current, next);
      onClose();
      notifyAction("Parola a fost schimbată", "De acum intri în cont cu parola nouă.");
    } catch (err: any) {
      setError(err?.message || "Nu am putut schimba parola.");
    } finally {
      setSaving(false);
    }
  };

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Schimbă parola"
      icon="lock-closed-outline"
      testID="settings-password-sheet"
      footer={<Button testID="settings-password-save" label="Schimbă parola" onPress={handleSave} loading={saving} disabled={!canSave} />}
    >
      <PasswordField
        testID="settings-password-current"
        label="Parola actuală"
        value={current}
        onChangeText={(t) => { setCurrent(t); clearError(); }}
        autoComplete="current-password"
        autoFocus
        error={error}
      />
      <PasswordField
        testID="settings-password-next"
        label="Parola nouă"
        value={next}
        onChangeText={(t) => { setNext(t); clearError(); }}
        autoComplete="new-password"
        hint="Cel puțin 8 caractere."
      />
      <PasswordField
        testID="settings-password-confirm"
        label="Repetă parola nouă"
        value={confirm}
        onChangeText={(t) => { setConfirm(t); clearError(); }}
        onSubmitEditing={handleSave}
        returnKeyType="done"
        autoComplete="new-password"
        error={mismatch ? "Parolele nu se potrivesc." : null}
      />
    </Sheet>
  );
}

/** First password for a social-only account (user.has_password === false):
 * no current password, POST /profile/password/set. */
function SetPasswordModal({ visible, email, onClose, onSaved }: { visible: boolean; email?: string | null; onClose: () => void; onSaved: () => void }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    setNext("");
    setConfirm("");
    setError(null);
  }
  wasVisible.current = visible;

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const canSave = next.length >= 8 && next === confirm;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.setPassword(next, confirm);
      onSaved();
      notifyAction(
        "Parola a fost setată",
        email ? `De acum poți intra și cu emailul (${email}) și parola, nu doar cu contul extern.` : "De acum poți intra și cu emailul și parola.",
      );
    } catch (err: any) {
      setError(apiErrorMessage(err, "Nu am putut seta parola.", "password"));
    } finally {
      setSaving(false);
    }
  };

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Setează o parolă"
      subtitle={email ? `Ca să intri și cu ${email}, pe lângă Apple, Google sau Facebook.` : "Ca să intri și cu emailul, pe lângă Apple, Google sau Facebook."}
      icon="lock-closed-outline"
      testID="settings-set-password-sheet"
      footer={<Button testID="settings-set-password-save" label="Setează parola" onPress={handleSave} loading={saving} disabled={!canSave} />}
    >
      <PasswordField
        testID="settings-set-password-next"
        label="Parola nouă"
        value={next}
        onChangeText={(t) => { setNext(t); clearError(); }}
        autoComplete="new-password"
        textContentType="newPassword"
        autoFocus
        hint="Cel puțin 8 caractere."
        error={error}
      />
      <PasswordField
        testID="settings-set-password-confirm"
        label="Repetă parola"
        value={confirm}
        onChangeText={(t) => { setConfirm(t); clearError(); }}
        onSubmitEditing={handleSave}
        returnKeyType="done"
        autoComplete="new-password"
        textContentType="newPassword"
        error={mismatch ? "Parolele nu se potrivesc." : null}
      />
    </Sheet>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EditEmailModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Unlike name/password, a successful request doesn't change anything
  // yet -- the new address only takes effect once its own link is
  // opened (see confirm-email.tsx).
  const [sentTo, setSentTo] = useState<string | null>(null);

  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    setEmail("");
    setPassword("");
    setError(null);
  }
  wasVisible.current = visible;

  const trimmedEmail = email.trim();
  const canSave = EMAIL_RE.test(trimmedEmail) && password.length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
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
    // Reopening the row should offer a fresh attempt, not a stale
    // confirmation from a previous request.
    setSentTo(null);
  };

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      title={sentTo ? "Verifică emailul nou" : "Schimbă emailul"}
      icon={sentTo ? "mail-unread-outline" : "mail-outline"}
      tone={sentTo ? colors.success : undefined}
      testID="settings-email-sheet"
      footer={
        sentTo
          ? <Button testID="settings-email-done" label="Am înțeles" onPress={handleClose} />
          : <Button testID="settings-email-save" label="Trimite linkul de confirmare" onPress={handleSave} loading={saving} disabled={!canSave} />
      }
    >
      {sentTo ? (
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.onSurfaceTertiary }}>
          Am trimis un link la {sentTo}. Emailul contului se schimbă doar după ce deschizi linkul. E valabil 60 de minute.
        </Text>
      ) : (
        <>
          <Field
            testID="settings-email-new"
            label="Emailul nou"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (error) setError(null);
            }}
            placeholder="nume@exemplu.ro"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            autoFocus
          />
          <PasswordField
            testID="settings-email-password"
            label="Parola actuală"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
            onSubmitEditing={handleSave}
            returnKeyType="done"
            autoComplete="current-password"
            hint="Ca să confirmăm că ești tu."
            error={error}
          />
        </>
      )}
    </Sheet>
  );
}

/** "Revezi ghidurile": every first-use tour (lib/tours.ts) with whether it
 * was seen, skipped or is still new; tap one to run it now. Tours that
 * don't exist yet are listed dimmed as "În curând". */
function ToursSheet({ visible, onClose, onStart }: { visible: boolean; onClose: () => void; onStart: (key: TourKey) => void }) {
  const { colors } = useTheme();
  const { user, updateUser } = useAuth();
  const [resetting, setResetting] = useState(false);

  const status = (key: TourKey) => {
    const s = user?.tours?.[key]?.status;
    return s === "done" ? "Văzut" : s === "skipped" ? "Sărit" : "Nou";
  };

  const resetAll = async () => {
    const ok = await confirmAction("Arăți din nou toate ghidurile?", "Fiecare ecran îți va arăta ghidul la următoarea vizită.", {
      confirmLabel: "Arată-le",
    });
    if (!ok) return;
    setResetting(true);
    try {
      await api.resetTours();
      clearSeenLocally();
      updateUser({ tours: null });
      onClose();
    } catch (err: any) {
      notifyAction("Nu am putut reseta ghidurile", err?.message || "A apărut o eroare.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Revezi ghidurile"
      subtitle="Atinge un ghid ca să-l pornești acum."
      icon="map-outline"
      testID="settings-tours-sheet"
      footer={<Button testID="settings-tours-reset" variant="secondary" label="Arată-le din nou pe toate" onPress={resetAll} loading={resetting} />}
    >
      <Group inset={62}>
        {TOUR_LIST.map((t) => {
          const exists = tourExists(t.key);
          return (
            <Row
              key={t.key}
              testID={`settings-tour-${t.key}`}
              leading={<IconWell icon={t.icon as keyof typeof Ionicons.glyphMap} color={colors.onSurfaceTertiary} tint={colors.onSurfaceSecondary} size={34} />}
              title={t.label}
              onPress={exists ? () => onStart(t.key) : undefined}
              dim={!exists}
              trailing={
                <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }} numberOfLines={1}>
                  {exists ? status(t.key) : "În curând"}
                </Text>
              }
              chevron={exists}
            />
          );
        })}
      </Group>
    </Sheet>
  );
}
