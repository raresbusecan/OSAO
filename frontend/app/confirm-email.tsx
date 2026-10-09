import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth";
import { AuthShell, AuthNotice, linkEmail } from "@/components/auth/AuthShell";

/** Opened from the link in ConfirmEmailChangeNotification --
 * ?token=...&email=... (see backend/app/Notifications/ConfirmEmailChangeNotification.php).
 * Reachable regardless of login state (see app/_layout.tsx's AuthGuard) --
 * the token itself is the proof, not a session. Confirms automatically on
 * open rather than waiting for a tap: there's no second field to fill in
 * here, so a confirm button would only add a step. If this browser is
 * also logged in as the account being changed, refreshUser() keeps that
 * session's local state in sync immediately. */
export default function ConfirmEmail() {
  const { colors, spacing } = useTheme();
  const { user, refreshUser } = useAuth();
  const { token, email: rawEmail } = useLocalSearchParams<{ token?: string; email?: string }>();
  const email = linkEmail(rawEmail);
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
        // Re-read the session from the server: the link may belong to a
        // different account than the one logged in here.
        if (user) refreshUser().catch(() => {});
        setStatus("done");
      } catch (err: any) {
        setError(err?.message || null);
        setStatus("error");
      }
    })();
    // Runs once against the params this screen was opened with -- a new
    // link means a fresh navigation, not a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell testID="confirm-email-screen" title="Confirmă emailul">
      {status === "pending" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <ActivityIndicator color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>Se confirmă...</Text>
        </View>
      ) : status === "done" ? (
        <AuthNotice icon="checkmark-circle-outline" tone={colors.success} title="Emailul a fost schimbat" message={`De acum intri în cont cu ${email}.`} />
      ) : (
        <AuthNotice
          testID="confirm-email-error"
          icon="alert-circle-outline"
          tone={colors.error}
          title="Linkul nu e valid"
          message={error || "Deschide din nou linkul din email sau cere o schimbare nouă din Setări."}
        />
      )}
    </AuthShell>
  );
}
