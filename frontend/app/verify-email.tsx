import React, { useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/auth";
import { Button } from "@/components/ui/primitives";
import { AuthShell, AuthNotice, AuthSwitch, PasswordField, linkEmail } from "@/components/auth/AuthShell";
import { useResendVerification } from "@/components/auth/VerifyEmailBanner";

/** Mailbox proof establishes a password chosen by its owner and revokes
 * pre-verification sessions. Opening a link alone never changes credentials. */
export default function VerifyEmail() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { token, email: rawEmail } = useLocalSearchParams<{ token?: string; email?: string }>();
  const email = linkEmail(rawEmail);
  const linkValid = !!token && !!email;
  const sameAccount = !!user && !!email && user.email.toLowerCase() === email.toLowerCase();
  const [status, setStatus] = useState<"form" | "done" | "error">(
    sameAccount && user?.email_verified_at ? "done" : linkValid ? "form" : "error",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resend, busy, note, secondsLeft } = useResendVerification();
  const canSubmit = linkValid && password.length >= 8 && password === confirm && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await api.verifyEmail(email!, token!, password);
      if (sameAccount) {
        await signOut();
        router.replace("/(auth)/login");
        return;
      }
      setPassword("");
      setConfirm("");
      setStatus("done");
    } catch (e: any) {
      setError(apiErrorMessage(e, "Nu am putut confirma adresa. Încearcă din nou.", "password"));
      if (e?.body?.errors?.token) setStatus("error");
    } finally {
      setSaving(false);
    }
  };
  const goOn = () => router.replace(user ? "/(tabs)/home" : "/(auth)/login");

  return (
    <AuthShell testID="verify-email-screen" title="Confirmă adresa" subtitle={email ?? null}>
      {status === "form" ? (
        <View style={{ gap: spacing.lg }}>
          <Text style={{ color: colors.onSurfaceSecondary, lineHeight: 21 }}>Alege parola pentru contul tău. După confirmare, te vei conecta din nou cu această parolă.</Text>
          <PasswordField testID="verify-email-password" label="Parola" value={password} onChangeText={setPassword} autoComplete="new-password" textContentType="newPassword" hint="Cel puțin 8 caractere." />
          <PasswordField testID="verify-email-confirm-password" label="Repetă parola" value={confirm} onChangeText={setConfirm} autoComplete="new-password" onSubmitEditing={submit} error={error} />
          <Button testID="verify-email-submit" label="Confirmă adresa" onPress={submit} disabled={!canSubmit} loading={saving} />
        </View>
      ) : status === "done" ? (
        <View style={{ gap: spacing.lg }}>
          <AuthNotice testID="verify-email-done" icon="checkmark-circle-outline" tone={colors.success} title="Adresa de email a fost confirmată" message="Poți intra în cont folosind parola aleasă." />
          <Button testID="verify-email-continue" label={user ? "Mergi la Acasă" : "Intră în cont"} onPress={goOn} />
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          <AuthNotice testID="verify-email-error" icon="alert-circle-outline" tone={colors.error} title="Linkul nu e valid" message={error || "Deschide linkul din email sau cere unul nou din aplicație."} />
          {user && user.email_verified_at === null ? (
            <View style={{ gap: spacing.sm }}>
              {note ? <Text style={{ color: note.ok ? colors.success : colors.error }}>{note.text}</Text> : null}
              <Button testID="verify-email-resend" label={secondsLeft > 0 ? `Retrimite în ${secondsLeft} s` : "Retrimite emailul"} onPress={resend} loading={busy} disabled={secondsLeft > 0} />
            </View>
          ) : null}
          <AuthSwitch testID="verify-email-goto" prompt={user ? "Mai târziu?" : "Ai cont?"} action={user ? "Mergi la Acasă" : "Intră în cont"} onPress={goOn} />
        </View>
      )}
    </AuthShell>
  );
}
