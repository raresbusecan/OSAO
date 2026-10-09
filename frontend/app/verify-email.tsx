import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/providers/auth";
import { Button } from "@/components/ui/primitives";
import { AuthShell, AuthNotice, AuthSwitch, linkEmail } from "@/components/auth/AuthShell";
import { useResendVerification } from "@/components/auth/VerifyEmailBanner";

/** Opened from the link in VerifyEmailNotification (registration) --
 * ?token=...&email=..., reached through the backend's /open/verify-email
 * page, which redirects to exp://<host>/--/verify-email (Expo Go) or
 * orgos://verify-email (own build). Public, like confirm-email.tsx (see
 * AuthGuard in app/_layout.tsx): the token is the proof, not a session.
 * Confirms automatically on open. If this device is logged in as that
 * same account, updateUser() hides the "Confirmă-ți adresa" banner right
 * away; logged in as someone else, their session is left alone. */
export default function VerifyEmail() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const { token, email: rawEmail } = useLocalSearchParams<{ token?: string; email?: string }>();
  const email = linkEmail(rawEmail);
  const [status, setStatus] = useState<"pending" | "done" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const { resend, busy, note, secondsLeft } = useResendVerification();

  const linkValid = !!token && !!email;
  const sameAccount = !!user && !!email && user.email.toLowerCase() === String(email).toLowerCase();

  useEffect(() => {
    if (!linkValid) {
      setStatus("error");
      return;
    }

    (async () => {
      try {
        const res = await api.verifyEmail(email!, token!);
        if (sameAccount) updateUser({ email_verified_at: res.email_verified_at ?? new Date().toISOString() });
        setStatus("done");
      } catch (e: any) {
        // Opened again after it already worked (the token is single use):
        // for that same, already-verified account, that's not an error.
        if (sameAccount && user?.email_verified_at) {
          setStatus("done");
          return;
        }
        setError(apiErrorMessage(e, "Nu am putut confirma adresa. Încearcă din nou.", "token"));
        setStatus("error");
      }
    })();
    // Runs once against the params this screen was opened with -- a new
    // link means a fresh navigation, not a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goOn = () => router.replace(user ? "/(tabs)/home" : "/(auth)/login");

  return (
    <AuthShell testID="verify-email-screen" title="Confirmă adresa" subtitle={email ?? null}>
      {status === "pending" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <ActivityIndicator color={colors.onSurfaceTertiary} />
          <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>Se confirmă...</Text>
        </View>
      ) : status === "done" ? (
        <View style={{ gap: spacing.lg }}>
          <AuthNotice
            testID="verify-email-done"
            icon="checkmark-circle-outline"
            tone={colors.success}
            title="Adresa de email a fost confirmată"
            message={user ? "Mulțumim! Poți continua în aplicație." : "Mulțumim! Intră în cont ca să continui."}
          />
          <Button testID="verify-email-continue" label={user ? "Mergi la Acasă" : "Intră în cont"} onPress={goOn} />
        </View>
      ) : (
        <View style={{ gap: spacing.lg }}>
          <AuthNotice
            testID="verify-email-error"
            icon="alert-circle-outline"
            tone={colors.error}
            title="Linkul nu e valid"
            message={error || "Deschide din nou linkul din email sau cere unul nou din aplicație."}
          />
          {/* A new link can only be requested with a session (the resend
              endpoint is auth'd and sends to the logged-in account), so
              logged out the way forward is to log in -- the banner on
              Acasă then offers "Retrimite emailul". */}
          {user && user.email_verified_at === null ? (
            <View style={{ gap: spacing.sm }}>
              {note ? (
                <Text testID="verify-email-resend-note" style={{ fontSize: 13, lineHeight: 18, color: note.ok ? colors.success : colors.error }}>{note.text}</Text>
              ) : null}
              <Button
                testID="verify-email-resend"
                label={secondsLeft > 0 ? `Retrimite în ${secondsLeft} s` : "Retrimite emailul"}
                onPress={resend}
                loading={busy}
                disabled={secondsLeft > 0}
              />
            </View>
          ) : null}
          <AuthSwitch
            testID="verify-email-goto"
            prompt={user ? "Mai târziu?" : "Ai cont?"}
            action={user ? "Mergi la Acasă" : "Intră în cont"}
            onPress={goOn}
          />
        </View>
      )}
    </AuthShell>
  );
}
