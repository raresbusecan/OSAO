import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

const HERO_LIGHT =
  "https://images.unsplash.com/photo-1483366774565-c783b9f70e2c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwYWJzdHJhY3QlMjBhcmNoaXRlY3R1cmUlMjBjYWxtJTIwbGlnaHR8ZW58MHx8fHwxNzg2MzU0NzkxfDA&ixlib=rb-4.1.0&q=85";

const HERO_DARK =
  "https://images.unsplash.com/photo-1526289034009-0240ddb68ce3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwxfHxjYWxtJTIwbWluaW1hbCUyMGFic3RyYWN0JTIwYXJjaGl0ZWN0dXJlJTIwZGFya3xlbnwwfHx8fDE3ODYzNTQ4MDZ8MA&ixlib=rb-4.1.0&q=85";

export default function Register() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setBusy(true);

    try {
      await signUp(email.trim(), password, name.trim());
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const disabled =
    busy ||
    !email.trim() ||
    !password ||
    password.length < 6 ||
    !name.trim();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
      }}
      testID="register-screen"
    >
      <Image
        source={{
          uri: isDark ? HERO_DARK : HERO_LIGHT,
        }}
        style={{
          width: "100%",
          height: "55%",
        }}
        contentFit="cover"
      />

      <LinearGradient
        pointerEvents="none"
        colors={["transparent", colors.surface]}
        locations={[0.15, 0.55]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView
        style={{ flex: 1 }}
        edges={["top", "bottom"]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "flex-end",
              padding: spacing.xl,
              gap: spacing.lg,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                gap: spacing.xs,
                marginBottom: spacing.lg,
              }}
            >
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: "800",
                  color: colors.onSurface,
                  letterSpacing: -0.5,
                }}
              >
                Create your LifeOS
              </Text>

              <Text
                style={{
                  fontSize: 15,
                  color: colors.onSurfaceTertiary,
                }}
              >
                One place for tasks, notes, expenses and the things you
                can't forget.
              </Text>
            </View>

            <View style={{ gap: spacing.md }}>
              <TextInput
                testID="register-name-input"
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="off"
                style={{
                  backgroundColor: colors.surfaceSecondary,
                  color: colors.onSurface,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 14,
                  fontSize: 16,
                }}
              />

              <TextInput
                testID="register-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                style={{
                  backgroundColor: colors.surfaceSecondary,
                  color: colors.onSurface,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 14,
                  fontSize: 16,
                }}
              />

              <TextInput
                testID="register-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="Password (min 8)"
                placeholderTextColor={colors.onSurfaceTertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                style={{
                  backgroundColor: colors.surfaceSecondary,
                  color: colors.onSurface,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 14,
                  fontSize: 16,
                }}
              />

              {err ? (
                <Text
                  testID="register-error"
                  style={{
                    color: colors.error,
                    fontSize: 13,
                  }}
                >
                  {err}
                </Text>
              ) : null}
            </View>

            <Pressable
              testID="register-submit-button"
              onPress={submit}
              disabled={disabled}
              style={{
                backgroundColor: colors.brandPrimary,
                opacity: disabled ? 0.5 : 1,
                paddingVertical: 16,
                borderRadius: radius.md,
                alignItems: "center",
              }}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text
                  style={{
                    color: colors.onBrandPrimary,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  Create account
                </Text>
              )}
            </Pressable>

            <Link href="/(auth)/login" asChild>
              <Pressable
                testID="register-goto-login"
                style={{
                  alignItems: "center",
                  paddingVertical: spacing.md,
                }}
              >
                <Text
                  style={{
                    color: colors.onSurfaceTertiary,
                    fontSize: 14,
                  }}
                >
                  Already have an account?{" "}
                  <Text
                    style={{
                      color: colors.onSurface,
                      fontWeight: "600",
                    }}
                  >
                    Sign in
                  </Text>
                </Text>
              </Pressable>
            </Link>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}