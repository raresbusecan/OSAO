import React from "react";
import { Stack, Redirect, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { LogBox, Platform, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";

import { ThemeProvider } from "@/lib/theme";
import { ConfirmHost } from "@/lib/confirmHost";
import { AuthProvider, useAuth } from "@/providers/auth";

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

  if (!user && !inAuthGroup) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user && inAuthGroup) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <BottomSheetModalProvider>
              <StatusBar style="auto" />
              <AuthGuard />
              <ConfirmHost />
            </BottomSheetModalProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);