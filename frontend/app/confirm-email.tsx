import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth";

/** Opened from the link in ConfirmEmailChangeNotification --
 * ?token=...&email=... (see backend/app/Notifications/ConfirmEmailChangeNotification.php).
 * Reachable regardless of login state (see app/_layout.tsx's AuthGuard) --
 * the token itself is the proof, not a session. Confirms automatically on
 * open rather than waiting for a tap: there's no second field to fill in
 * here (unlike reset-password, which still needs a new password typed),
 * so there's nothing a confirm button would add except an extra step. If
 * this browser also happens to be logged in as the account being changed,
 * updateUser() keeps that session's local state in sync immediately. */
export default function ConfirmEmail() {
  const { colors, spacing, radius } = useTheme();
  const { user, updateUser } = useAuth();
  const { token, email } = useLocalSearchParams<{ token?: string; email?: string }>();
  const [status, setStatus] = useState<"pending" | "done" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  const linkValid = !!token && !!email;

  useEffect(() => {
    if (!linkValid) {
      setStatus("error");
      return;
    }

    (async () => {
      try {
        const res = await api.confirmEmailChange(email!, token!);
        if (user) updateUser({ email: res.email });
        setStatus("done");
      } catch (err: any) {
        setError(err?.message || "Something went wrong.");
        setStatus("error");
      }
    })();
    // Runs once against the params this screen was opened with -- there's
    // no scenario where token/email change under a mounted instance of
    // this screen (a new link means a fresh navigation, not a re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="confirm-email-screen">
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>
            Confirmă email
          </Text>

          {status === "pending" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <ActivityIndicator color={colors.onSurfaceTertiary} />
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>Se confirmă...</Text>
            </View>
          ) : status === "done" ? (
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
                Email actualizat
              </Text>
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20 }}>
                De acum poți folosi „{email}" pentru autentificare.
              </Text>
            </View>
          ) : (
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
                Acest link nu este valid
              </Text>
              <Text testID="confirm-email-error" style={{ fontSize: 14, color: colors.onSurfaceTertiary, lineHeight: 20 }}>
                {error || "Deschide din nou linkul din email, sau cere o schimbare nouă din Setări."}
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
