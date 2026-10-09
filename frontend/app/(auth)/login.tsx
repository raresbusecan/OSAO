import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { Button, Field } from "@/components/ui/primitives";
import { AuthShell, AuthSwitch, PasswordField } from "@/components/auth/AuthShell";
import { SocialLogin } from "@/components/auth/SocialLogin";

// The backend's validation messages are still English (Laravel's
// default locale); the one every user hits gets a Romanian line here.
function loginError(message?: string): string {
  if (!message) return "Nu te-am putut autentifica. Încearcă din nou.";
  if (/credentials are incorrect/i.test(message)) return "Emailul sau parola nu se potrivesc.";
  return message;
}

export default function Login() {
  const { colors, spacing } = useTheme();
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) return;
    setErr(null); setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(loginError(e?.message));
    } finally { setBusy(false); }
  };

  return (
    <AuthShell testID="login-screen" title="orgOS" subtitle="Mașina, casa, cumpărăturile și banii tăi, într-un singur loc.">
      <View style={{ gap: 14 }}>
        <Field
          testID="login-email-input"
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="nume@exemplu.ro"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <PasswordField
          testID="login-password-input"
          label="Parolă"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={err}
        />
        <Pressable
          testID="login-goto-forgot-password"
          onPress={() => router.push("/(auth)/forgot-password")}
          accessibilityRole="button"
          style={{ alignSelf: "flex-end", minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>Ai uitat parola?</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.lg }}>
        <Button testID="login-submit-button" label="Intră în cont" onPress={submit} loading={busy} disabled={!email || !password} />
        {/* "sau" + Apple / Google / Facebook -- renders nothing when none is available. */}
        <SocialLogin testID="login-social" />
        <AuthSwitch testID="login-goto-register" prompt="Nu ai cont?" action="Creează unul" onPress={() => router.push("/(auth)/register")} />
      </View>
    </AuthShell>
  );
}
