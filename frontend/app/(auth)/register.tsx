import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { Button, Field } from "@/components/ui/primitives";
import { AuthShell, AuthSwitch, PasswordField } from "@/components/auth/AuthShell";

export default function Register() {
  const { spacing } = useTheme();
  const { signUp } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Matches the backend's own rule (AuthController::register, min:8).
  const disabled = !email.trim() || password.length < 8 || !name.trim();

  const submit = async () => {
    if (disabled) return;
    setErr(null);
    setBusy(true);
    try {
      await signUp(email.trim(), password, name.trim());
    } catch (e: any) {
      setErr(e?.message || "Nu am putut crea contul. Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell testID="register-screen" title="Cont nou" subtitle="Un loc pentru mașină, casă, cumpărături și cheltuieli.">
      <View style={{ gap: 14 }}>
        <Field
          testID="register-name-input"
          label="Nume"
          value={name}
          onChangeText={setName}
          placeholder="Cum să-ți spunem"
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          returnKeyType="next"
        />
        <Field
          testID="register-email-input"
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="nume@exemplu.ro"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          returnKeyType="next"
        />
        <PasswordField
          testID="register-password-input"
          label="Parolă"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={err}
          hint="Cel puțin 8 caractere."
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button testID="register-submit-button" label="Creează contul" onPress={submit} loading={busy} disabled={disabled} />
        <AuthSwitch testID="register-goto-login" prompt="Ai deja cont?" action="Intră în cont" onPress={() => router.replace("/(auth)/login")} />
      </View>
    </AuthShell>
  );
}
