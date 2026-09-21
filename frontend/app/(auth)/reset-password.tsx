import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

/** Opened from the link in ResetPasswordNotification's email --
 * ?token=...&email=... (see backend/app/Notifications/ResetPasswordNotification.php).
 * Missing/malformed params are handled as "this link is broken" rather
 * than crashing on a null token, since it's an email link a user could
 * plausibly forward, truncate by copy-pasting, or open days later. */
export default function ResetPassword() {
  const { colors, spacing, radius } = useTheme();
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
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don't match.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await api.resetPassword(email!, token!, password);
      setDone(true);
    } catch (e: any) {
      // Expired/already-used/invalid token all land here with the
      // backend's own specific message (e.g. "This password reset
      // token is invalid.") -- surfaced as-is rather than a generic
      // fallback, since it's the one piece of information that tells
      // the user whether to just request a new link.
      setErr(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="reset-password-screen">
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 28, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>
                Set a new password
              </Text>
              {email ? (
                <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>{email}</Text>
              ) : null}
            </View>

            {!linkValid ? (
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
                  This link isn't valid
                </Text>
                <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20 }}>
                  Open the reset link from your email again, or request a new one.
                </Text>
              </View>
            ) : done ? (
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
                  Password changed
                </Text>
                <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20 }}>
                  You can sign in with your new password now. You've been signed out everywhere else, just in case.
                </Text>
              </View>
            ) : (
              <>
                <TextInput
                  testID="reset-password-new-input"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="New password"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  accessibilityLabel="New password"
                  secureTextEntry
                  style={{
                    backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface,
                    borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16,
                  }}
                />
                <TextInput
                  testID="reset-password-confirm-input"
                  value={confirm}
                  onChangeText={setConfirm}
                  onSubmitEditing={submit}
                  returnKeyType="done"
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  accessibilityLabel="Confirm new password"
                  secureTextEntry
                  style={{
                    backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, color: colors.onSurface,
                    borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16,
                  }}
                />
                {err ? (
                  <Text testID="reset-password-error" style={{ color: colors.error, fontSize: 13 }}>{err}</Text>
                ) : null}

                <Pressable
                  testID="reset-password-submit-button"
                  onPress={submit}
                  disabled={busy || !canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel="Set new password"
                  accessibilityState={{ busy, disabled: busy || !canSubmit }}
                  style={{
                    backgroundColor: colors.brandPrimary,
                    opacity: busy || !canSubmit ? 0.5 : 1,
                    paddingVertical: 16, borderRadius: radius.sm, alignItems: "center",
                  }}
                >
                  {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                    <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 }}>Set new password</Text>
                  )}
                </Pressable>
              </>
            )}

            <Link href="/(auth)/login" asChild>
              <Pressable
                testID="reset-password-goto-login"
                onPress={() => router.replace("/(auth)/login")}
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
