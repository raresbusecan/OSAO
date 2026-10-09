import React, { useState } from "react";
import { View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/auth";
import { Button } from "@/components/ui/primitives";
import { AuthShell, AuthSwitch, AuthNotice, PasswordField, linkEmail } from "@/components/auth/AuthShell";

/** Opened from the link in ResetPasswordNotification's email --
 * ?token=...&email=... (see backend/app/Notifications/ResetPasswordNotification.php).
 * Missing/malformed params are handled as "this link is broken" rather
 * than crashing on a null token, since it's an email link a user could
 * plausibly forward, truncate by copy-pasting, or open days later.
 * Reached through the backend's /open/reset-password page, which
 * redirects to exp://<host>/--/reset-password (Expo Go) or
 * orgos://reset-password. Public in AuthGuard: it opens whether or not
 * this device is logged in. A successful reset revokes EVERY token of
 * that account server-side, so if this device was logged in as it, the
 * local session is ended too (signOut tolerates the now-401 logout). */
export default function ResetPassword() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { token, email: rawEmail } = useLocalSearchParams<{ token?: string; email?: string }>();
  const email = linkEmail(rawEmail);
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
      if (user && user.email.toLowerCase() === String(email).toLowerCase()) await signOut();
      setDone(true);
    } catch (e: any) {
      // Expired/already-used/invalid token all land here with the
      // backend's own specific message -- surfaced as-is, since it's
      // what tells the user whether to just request a new link.
      setErr(apiErrorMessage(e, "Nu am putut schimba parola. Încearcă din nou.", "email"));
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
        <View style={{ gap: spacing.lg }}>
          <AuthNotice
            testID="reset-password-done"
            icon="checkmark-circle-outline"
            tone={colors.success}
            title="Parola a fost schimbată"
            message="Intră în cont cu parola nouă. Din motive de siguranță, ai fost deconectat de pe toate dispozitivele."
          />
          {/* Still logged in here only as a DIFFERENT account than the
              one just reset -- that session wasn't touched. */}
          <Button
            testID="reset-password-done-button"
            label={user ? "Înapoi în aplicație" : "Intră în cont"}
            onPress={() => router.replace(user ? "/(tabs)/home" : "/(auth)/login")}
          />
        </View>
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

      {done ? null : !linkValid || err ? (
        <AuthSwitch testID="reset-password-goto-forgot" prompt="Linkul nu merge?" action="Cere unul nou" onPress={() => router.replace("/(auth)/forgot-password")} />
      ) : (
        <AuthSwitch
          testID="reset-password-goto-login"
          prompt="Te-ai răzgândit?"
          action={user ? "Înapoi în aplicație" : "Intră în cont"}
          onPress={() => router.replace(user ? "/(tabs)/home" : "/(auth)/login")}
        />
      )}
    </AuthShell>
  );
}
