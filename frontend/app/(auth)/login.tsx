import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Keyboard, TouchableWithoutFeedback,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

const HERO_LIGHT = "https://images.unsplash.com/photo-1483366774565-c783b9f70e2c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwYWJzdHJhY3QlMjBhcmNoaXRlY3R1cmUlMjBjYWxtJTIwbGlnaHR8ZW58MHx8fHwxNzg2MzU0NzkxfDA&ixlib=rb-4.1.0&q=85";
const HERO_DARK = "https://images.unsplash.com/photo-1526289034009-0240ddb68ce3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwxfHxjYWxtJTIwbWluaW1hbCUyMGFic3RyYWN0JTIwYXJjaGl0ZWN0dXJlJTIwZGFya3xlbnwwfHx8fDE3ODYzNTQ4MDZ8MA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="login-screen">
      <View style={StyleSheet.absoluteFill}>
        <Image
          source={{ uri: isDark ? HERO_DARK : HERO_LIGHT }}
          style={{ width: "100%", height: "55%" }}
          contentFit="cover"
        />
        <LinearGradient
          colors={["transparent", colors.surface]}
          locations={[0.15, 0.55]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", padding: spacing.xl, gap: spacing.lg }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
                <Text style={{ fontSize: 34, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>
                  LifeOS
                </Text>
                <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>
                  Your personal command center. Capture anything.
                </Text>
              </View>

              <View style={{ gap: spacing.md }}>
                <TextInput
                  testID="login-email-input"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{
                    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
                    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16,
                  }}
                />
                <TextInput
                  testID="login-password-input"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  secureTextEntry
                  style={{
                    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
                    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16,
                  }}
                />
                {err ? (
                  <Text testID="login-error" style={{ color: colors.error, fontSize: 13 }}>{err}</Text>
                ) : null}
              </View>

              <Pressable
                testID="login-submit-button"
                onPress={submit}
                disabled={busy || !email || !password}
                style={{
                  backgroundColor: colors.brandPrimary,
                  opacity: busy || !email || !password ? 0.5 : 1,
                  paddingVertical: 16, borderRadius: radius.md, alignItems: "center",
                }}
              >
                {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                  <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 16 }}>Sign in</Text>
                )}
              </Pressable>

              <Link href="/(auth)/register" asChild>
                <Pressable testID="login-goto-register" style={{ alignItems: "center", paddingVertical: spacing.md }}>
                  <Text style={{ color: colors.onSurfaceTertiary, fontSize: 14 }}>
                    New here? <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Create an account</Text>
                  </Text>
                </Pressable>
              </Link>
            </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
