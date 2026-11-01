// Must run before anything renders: makes IBM Plex the default font.
import "@/lib/globalFont";
// Languages: initialized synchronously before any screen renders.
import "@/lib/i18n";
import React from "react";
import { Stack, Redirect, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { LogBox, Platform, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import {
  useFonts,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from "@expo-google-fonts/ibm-plex-sans";

import { ThemeProvider, useTheme } from "@/lib/theme";import { ConfirmHost } from "@/lib/confirmHost";
import { HelpHost } from "@/components/ui/HelpHost";
import { TourHost } from "@/components/ui/TourHost";
import { AuthProvider, useAuth } from "@/providers/auth";
import { AppModeProvider } from "@/lib/appMode";
import { UpgradeSheetHost } from "@/components/simple/UpgradeSheet";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Error monitoring only -- matches the same choice made in Sentry's own
// onboarding for the backend project (tracing/profiling/metrics all
// deliberately skipped there too). No sendDefaultPii, same reasoning as
// the backend: no privacy policy/consent flow exists yet, so no
// request/user PII goes to Sentry until one does.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? "development" : "production",
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0,
});

if (Platform.OS === "web") {
  const RNTextInput = TextInput as any;

  if (!RNTextInput.State) {
    RNTextInput.State = {
      currentlyFocusedInput: () =>
        typeof document !== "undefined" ? document.activeElement : null,

      currentlyFocusedField: () =>
        typeof document !== "undefined" ? document.activeElement : null,

      focusTextInput: (node: any) => {
        try {
          node?.focus?.();
        } catch {}
      },

      blurTextInput: (node: any) => {
        try {
          node?.blur?.();
        } catch {}
      },
    };
  }
}

function AuthGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();

  if (loading) {
    return null;
  }

  const inAuthGroup = segments[0] === "(auth)";
  // Opened from an email link (the backend's /open/<screen> page redirects
  // to exp://<host>/--/<screen>?token&email in Expo Go, orgos://<screen>
  // in an own build; the (auth) group is invisible in the URL, so
  // "/reset-password" is app/(auth)/reset-password.tsx). The link can
  // open on a device that's logged out, or logged in -- possibly as a
  // DIFFERENT account -- and the screen only needs the token in the URL,
  // so these render regardless of auth state instead of bouncing to
  // /login or /home. forgot-password is included so reset-password's
  // "cere un link nou" works while logged in too.
  const screen = inAuthGroup ? segments[1] : segments[0];
  // auth-callback = Google/Facebook sign-in landing (?code / ?error, see
  // lib/socialAuth.ts); it signs in itself, so it must render logged out.
  const isPublicRoute =
    screen === "auth-callback" ||
    screen === "confirm-email" ||
    screen === "verify-email" ||
    (inAuthGroup && (screen === "reset-password" || screen === "forgot-password"));

  if (!user && !inAuthGroup && !isPublicRoute) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user && inAuthGroup && !isPublicRoute) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

// Follows the chosen theme (Settings > Temă), not the phone's setting --
// "auto" would put dark icons on Grafit when the phone is in light mode.
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

function RootLayout() {
  // Every themed text style names one of these files (see lib/theme.tsx's
  // fw()), so hold the first render until they're registered -- the
  // splash screen stays up meanwhile. A load failure falls through to the
  // system font rather than a blank app.
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
  });
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            {/* Simplu / full app mode (lib/appMode.tsx). */}
            <AppModeProvider>
            <BottomSheetModalProvider>
              <ThemedStatusBar />
              <AuthGuard />
              <HelpHost />
              {/* First-use tours (lib/tours.ts); renders nothing unless one runs. */}
              <TourHost />
              {/* orgOS Complet upgrade sheet (Simplu mode teasers). */}
              <UpgradeSheetHost />
              <ConfirmHost />
            </BottomSheetModalProvider>
            </AppModeProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);