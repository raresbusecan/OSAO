import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { Button } from "@/components/ui/primitives";
import { AuthShell, AuthNotice } from "@/components/auth/AuthShell";
import { confirmAction } from "@/lib/confirm";
import { api } from "@/lib/api";
import { consumePendingWebFlow, exchangeSocialCode, isCancelCode, isKnownSocialCode, socialErrorMessage } from "@/lib/socialAuth";

// Web: closes the popup that openAuthSessionAsync opened and hands the
// URL back to the opener. No-op on native.
WebBrowser.maybeCompleteAuthSession();

// One question per code, even if the effect runs twice (dev remount).
const switchAnswers = new Map<string, Promise<boolean>>();
function askSwitchOnce(code: string, currentEmail?: string | null): Promise<boolean> {
  let p = switchAnswers.get(code);
  if (!p) {
    p = confirmAction(
      "Te conectezi cu alt cont?",
      `Ai deschis un link de autentificare pe care nu l-ai pornit din aplicație. Dacă continui, ieși din contul curent${currentEmail ? ` (${currentEmail})` : ""} și intri în contul din link. Continuă doar dacă tu ai cerut autentificarea.`,
      { confirmLabel: "Continuă", cancelLabel: "Rămân aici" },
    );
    switchAnswers.set(code, p);
  }
  return p;
}

/**
 * Where the backend's Google/Facebook callback sends the browser:
 * `<app deep link>/auth-callback?code=...` or `?error=...`. Normally the
 * auth session in lib/socialAuth.ts catches that URL itself; this route is
 * for when the OS opens the deep link in the app directly. Both paths share
 * one exchange per code (exchangeSocialCode), so a code reaching the app
 * twice still signs in once. PUBLIC in AuthGuard (opens logged in or out).
 */
export default function AuthCallback() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { user, signInWithToken } = useAuth();
  const params = useLocalSearchParams<{ code?: string | string[]; error?: string | string[]; provider?: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error;
  const providerParam = Array.isArray(params.provider) ? params.provider[0] : params.provider;
  const provider = providerParam === "google" || providerParam === "facebook" || providerParam === "apple" ? providerParam : null;
  // Cancel is silent everywhere (same as the in-app flow): back, no message.
  const cancelled = isCancelCode(errorCode);
  const [err, setErr] = useState<string | null>(errorCode && !cancelled ? socialErrorMessage(errorCode, provider) : null);

  useEffect(() => {
    if (errorCode && !cancelled) return;
    if (!code || cancelled) {
      router.replace(user ? "/(tabs)/home" : "/(auth)/login");
      return;
    }
    let alive = true;
    (async () => {
      try {
        // Login-CSRF guard: a code this app didn't ask for (no recent
        // Google/Facebook flow started here) must not silently replace the
        // signed-in account -- someone could send a link that logs this
        // phone into THEIR account. Logged out = nothing to replace.
        const trusted = isKnownSocialCode(code) || consumePendingWebFlow();
        if (!trusted && user) {
          const ok = await askSwitchOnce(code, user.email);
          if (!ok) {
            if (alive) router.replace("/(tabs)/home");
            return;
          }
        }
        const session = await exchangeSocialCode(code);
        // Switching accounts: revoke the old session's token server-side
        // (api.logout also clears it locally) before storing the new one.
        if (user && !trusted) {
          try { await api.logout(); } catch {}
        }
        await signInWithToken(session.user, session.token);
        if (alive) router.replace("/(tabs)/home");
      } catch (e: any) {
        if (alive) setErr(e?.message || socialErrorMessage(null, provider));
      }
    })();
    return () => { alive = false; };
    // Runs once per code; user changes (our own sign-in) must not re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, errorCode]);

  if (!err) {
    return (
      <View testID="auth-callback-screen" style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.onSurfaceTertiary} />
      </View>
    );
  }

  return (
    <AuthShell testID="auth-callback-screen" title="Autentificare" subtitle={null}>
      <AuthNotice testID="auth-callback-error" icon="alert-circle-outline" tone={colors.error} title="Nu te-am putut conecta" message={err} />
      <View style={{ gap: spacing.sm }}>
        <Button
          testID="auth-callback-back"
          label={user ? "Mergi la Acasă" : "Înapoi la autentificare"}
          onPress={() => router.replace(user ? "/(tabs)/home" : "/(auth)/login")}
        />
      </View>
    </AuthShell>
  );
}
