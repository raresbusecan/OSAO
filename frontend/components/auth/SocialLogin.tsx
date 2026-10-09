import React, { useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { Button } from "@/components/ui/primitives";
import {
  signInWithApple,
  signInWithWebProvider,
  useSocialProviders,
  type SocialProvider,
  type SocialSession,
} from "@/lib/socialAuth";

/**
 * "sau" divider + the social sign-in buttons, under the email form on
 * Login and Register (the same block on both -- the backend links or
 * creates the account, so there's no separate "sign up with Apple").
 * Renders nothing (not even the divider) when no provider is available:
 * Apple = iOS only, and only when the device supports it; Google/Facebook
 * = only when GET /auth/providers says the server has them configured.
 *
 * Apple uses Apple's own system button (required by Apple's guidelines):
 * black in the light theme, white in the dark one. Its colors can't be
 * restyled, only `buttonStyle` + `cornerRadius`.
 */
export function SocialLogin({ testID = "social" }: { testID?: string }) {
  const { colors, radius, spacing, isDark } = useTheme();
  const { signInWithToken } = useAuth();
  const router = useRouter();
  const providers = useSocialProviders();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!providers.apple && !providers.google && !providers.facebook) return null;

  const run = async (provider: SocialProvider, start: () => Promise<SocialSession | null>) => {
    if (busy) return;
    setErr(null);
    setBusy(provider);
    try {
      const session = await start();
      if (!session) return; // cancelled -- silent
      await signInWithToken(session.user, session.token);
      // New or existing account alike lands on Acasă; a new account's
      // first-use tour starts there by itself (user.tours is empty).
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(e?.message || "Nu te-am putut conecta. Încearcă din nou.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: spacing.md }} testID={`${testID}-login`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>sau</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      <View style={{ gap: spacing.sm }}>
        {providers.apple ? (
          // The native button can't show a spinner or a disabled state; while
          // any provider runs it is dimmed and stops taking touches instead.
          <View
            pointerEvents={busy ? "none" : "auto"}
            style={{ opacity: busy && busy !== "apple" ? 0.4 : 1 }}
            testID={`${testID}-apple`}
          >
            <AppleAuthentication.AppleAuthenticationButton
              // Remount on a theme switch -- the native style is set once.
              key={isDark ? "apple-white" : "apple-black"}
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.control}
              style={{ width: "100%", height: 52 }}
              onPress={() => run("apple", signInWithApple)}
            />
            {busy === "apple" ? (
              <View style={{ position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center" }}>
                <ActivityIndicator color={isDark ? "#000" : "#fff"} />
              </View>
            ) : null}
          </View>
        ) : null}
        {providers.google ? (
          <Button
            testID={`${testID}-google`}
            variant="secondary"
            icon="logo-google"
            label="Continuă cu Google"
            loading={busy === "google"}
            disabled={!!busy && busy !== "google"}
            onPress={() => run("google", () => signInWithWebProvider("google"))}
          />
        ) : null}
        {providers.facebook ? (
          <Button
            testID={`${testID}-facebook`}
            variant="secondary"
            icon="logo-facebook"
            label="Continuă cu Facebook"
            loading={busy === "facebook"}
            disabled={!!busy && busy !== "facebook"}
            onPress={() => run("facebook", () => signInWithWebProvider("facebook"))}
          />
        ) : null}
      </View>

      {err ? (
        <Text testID={`${testID}-error`} accessibilityLiveRegion="polite" style={{ fontSize: 14, lineHeight: 20, color: colors.error, textAlign: "center" }}>
          {err}
        </Text>
      ) : null}
    </View>
  );
}
