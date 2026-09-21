import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

/** Asks for an email, then always shows the same generic "if an
 * account exists" confirmation regardless of whether it actually
 * matched one -- matches the backend's own forgotPassword, which
 * never reveals that either (see AuthController). Once sent, the
 * screen stays put showing that confirmation rather than navigating
 * anywhere; the actual next step happens when the user opens the
 * email themselves. */
export default function ForgotPassword() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="forgot-password-screen">
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              testID="forgot-password-back"
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
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>

            <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 28, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>
                Reset your password
              </Text>
              <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>
                Enter your email and we'll send you a link to set a new one.
              </Text>
            </View>

            {sent ? (
              <View
                style={{
                  padding: spacing.lg,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: spacing.sm,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface }}>
                  Check your email
                </Text>
                <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20 }}>
                  If an account exists for "{email.trim()}", we've sent a link to reset the password. It expires in 60 minutes.
                </Text>
              </View>
            ) : (
              <>
                <TextInput
                  testID="forgot-password-email-input"
                  value={email}
                  onChangeText={setEmail}
                  onSubmitEditing={submit}
                  returnKeyType="done"
                  placeholder="Email"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  accessibilityLabel="Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface,
                    borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16,
                  }}
                />
                {err ? (
                  <Text testID="forgot-password-error" style={{ color: colors.error, fontSize: 13 }}>{err}</Text>
                ) : null}

                <Pressable
                  testID="forgot-password-submit-button"
                  onPress={submit}
                  disabled={busy || !email.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Send reset link"
                  accessibilityState={{ busy, disabled: busy || !email.trim() }}
                  style={{
                    backgroundColor: colors.brandPrimary,
                    opacity: busy || !email.trim() ? 0.5 : 1,
                    paddingVertical: 16, borderRadius: radius.sm, alignItems: "center",
                  }}
                >
                  {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                    <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 }}>Send reset link</Text>
                  )}
                </Pressable>
              </>
            )}

            <Link href="/(auth)/login" asChild>
              <Pressable
                testID="forgot-password-goto-login"
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
                style={{ alignItems: "center", paddingVertical: spacing.md }}
              >
                <Text style={{ color: colors.onSurfaceTertiary, fontSize: 14 }}>
                  Back to <Text style={{ color: colors.onSurface, fontWeight: "600" }}>sign in</Text>
                </Text>
              </Pressable>
            </Link>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
