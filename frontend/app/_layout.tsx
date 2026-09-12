import React from "react";
import { Stack, Redirect, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { LogBox, Platform, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/providers/auth";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <BottomSheetModalProvider>
              <StatusBar style="auto" />
              <AuthGuard />
            </BottomSheetModalProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}