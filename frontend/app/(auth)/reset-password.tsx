import React, { useState } from "react";
import { View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { AuthShell, AuthSwitch, AuthNotice, PasswordField } from "@/components/auth/AuthShell";

/** Opened from the link in ResetPasswordNotification's email --
 * ?token=...&email=... (see backend/app/Notifications/ResetPasswordNotification.php).
 * Missing/malformed params are handled as "this link is broken" rather
 * than crashing on a null token, since it's an email link a user could
 * plausibly forward, truncate by copy-pasting, or open days later. */
export default function ResetPassword() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { token, email } = useLocalSearchParams<{ token?: string; email?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const linkValid = !!token && !!email;
  const canSubmit = linkValid && password.length >= 8 && password === confirm;

  const submit = async () => {
    if (!linkValid) return;
    if (password.length < 8) {
      setErr("Parola trebuie să aibă cel puțin 8 caractere.");
      return;
    }
    if (password !== confirm) {
      setErr("Parolele nu se potrivesc.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await api.resetPassword(email!, token!, password);
      setDone(true);
    } catch (e: any) {
      // Expired/already-used/invalid token all land here with the
      // backend's own specific message -- surfaced as-is, since it's
      // what tells the user whether to just request a new link.
      setErr(e?.message || "Nu am putut schimba parola. Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell testID="reset-password-screen" title="Setează parola" subtitle={email ?? null}>
      {!linkValid ? (
        <AuthNotice
          icon="alert-circle-outline"
          tone={colors.error}
          title="Linkul nu e valid"
          message="Deschide din nou linkul din email sau cere unul nou."
        />
      ) : done ? (
        <AuthNotice
          icon="checkmark-circle-outline"
          tone={colors.success}
          title="Parola a fost schimbată"
          message="Intră în cont cu parola nouă. Din motive de siguranță, ai fost deconectat de pe celelalte dispozitive."
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <PasswordField
            testID="reset-password-new-input"
            label="Parola nouă"
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            hint="Cel puțin 8 caractere."
          />
          <PasswordField
            testID="reset-password-confirm-input"
            label="Repetă parola"
            value={confirm}
            onChangeText={setConfirm}
            onSubmitEditing={submit}
            returnKeyType="done"
            autoComplete="new-password"
            error={err}
          />
          <Button testID="reset-password-submit-button" label="Salvează parola" onPress={submit} loading={busy} disabled={!canSubmit} />
        </View>
      )}

      <AuthSwitch testID="reset-password-goto-login" prompt={done ? "Gata?" : "Te-ai răzgândit?"} action="Intră în cont" onPress={() => router.replace("/(auth)/login")} />
    </AuthShell>
  );
}
