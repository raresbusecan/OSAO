import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { Button, Field } from "@/components/ui/primitives";
import { AuthShell, AuthSwitch, AuthNotice } from "@/components/auth/AuthShell";

/** Asks for an email, then always shows the same generic "if an
 * account exists" confirmation regardless of whether it actually
 * matched one -- matches the backend's own forgotPassword, which
 * never reveals that either (see AuthController). Once sent, the
 * screen stays put showing that confirmation; the next step happens
 * when the user opens the email. */
export default function ForgotPassword() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setErr(null);
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (e: any) {
      setErr(e?.message || "Nu am putut trimite linkul. Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      testID="forgot-password-screen"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(auth)/login"))}
      title="Parolă nouă"
      subtitle="Scrie emailul contului și îți trimitem un link pentru o parolă nouă."
    >
      {sent ? (
        <AuthNotice
          icon="mail-unread-outline"
          tone={colors.success}
          title="Verifică emailul"
          message={`Dacă există un cont pentru ${email.trim()}, ai primit un link de resetare. Linkul e valabil 60 de minute.`}
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <Field
            testID="forgot-password-email-input"
            label="Email"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={submit}
            returnKeyType="send"
            placeholder="nume@exemplu.ro"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            error={err}
          />
          <Button testID="forgot-password-submit-button" label="Trimite linkul" onPress={submit} loading={busy} disabled={!email.trim()} />
        </View>
      )}

      <AuthSwitch testID="forgot-password-goto-login" prompt="Ți-ai amintit?" action="Intră în cont" onPress={() => router.replace("/(auth)/login")} />
    </AuthShell>
  );
}
