import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS } from "@/lib/spaces/spaceProfile";
import { CircleButton, Field } from "@/components/ui/primitives";

/**
 * The frame every signed-out screen shares (login, register, password
 * reset, email confirmation): the four Space colors as the mark, a
 * title and one line under it, then the screen's own fields. Vertically
 * centered, keyboard-aware.
 */
export function AuthShell({
  title,
  subtitle,
  onBack,
  testID,
  children,
}: {
  title: string;
  subtitle?: string | null;
  onBack?: () => void;
  testID?: string;
  children: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const marks = [SPACE_IDENTITY_COLORS.car, SPACE_IDENTITY_COLORS.home, SPACE_IDENTITY_COLORS.grocery, SPACE_IDENTITY_COLORS.expenses];
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID={testID}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xl, gap: 28 }}
            keyboardShouldPersistTaps="handled"
          >
            {onBack ? (
              <View style={{ position: "absolute", top: spacing.md, left: 24 }}>
                <CircleButton testID={testID ? `${testID.replace(/-screen$/, "")}-back` : undefined} icon="chevron-back" label="Înapoi" onPress={onBack} />
              </View>
            ) : null}
            <View style={{ gap: 18 }}>
              <View style={{ flexDirection: "row", gap: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {marks.map((c) => <View key={c} style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: c }} />)}
              </View>
              <View style={{ gap: 6 }}>
                <Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: "600", letterSpacing: -0.6, color: colors.onSurface }}>{title}</Text>
                {subtitle ? <Text style={{ fontSize: 16, lineHeight: 23, color: colors.onSurfaceTertiary }}>{subtitle}</Text> : null}
              </View>
            </View>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** Password Field with a show/hide eye at its end. */
export function PasswordField(props: TextInputProps & { label?: string; error?: string | null; hint?: string | null }) {
  const { colors } = useTheme();
  const [shown, setShown] = useState(false);
  return (
    <Field
      {...props}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      right={
        <Pressable
          onPress={() => setShown((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={shown ? "Ascunde parola" : "Arată parola"}
          hitSlop={10}
          style={{ marginLeft: 8, height: 44, justifyContent: "center" }}
        >
          <Ionicons name={shown ? "eye-off-outline" : "eye-outline"} size={19} color={colors.onSurfaceTertiary} />
        </Pressable>
      }
    />
  );
}

/** "Nu ai cont? Creează unul" -- a quiet sentence with one live part. */
export function AuthSwitch({ prompt, action, onPress, testID }: { prompt: string; action: string; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={action} style={{ alignItems: "center", minHeight: 44, justifyContent: "center" }}>
      <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
        {prompt} <Text style={{ color: colors.onSurface, fontWeight: "500" }}>{action}</Text>
      </Text>
    </Pressable>
  );
}

/** A filled message card for a finished/failed step ("Verifică emailul"). */
export function AuthNotice({ icon, tone, title, message, testID }: { icon: keyof typeof Ionicons.glyphMap; tone: string; title: string; message: string; testID?: string }) {
  const { card, colors, spacing, radius } = useTheme();
  return (
    <View style={{ ...card, borderRadius: radius.card, padding: spacing.lg, flexDirection: "row", gap: spacing.md }}>
      <Ionicons name={icon} size={22} color={tone} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{title}</Text>
        <Text testID={testID} style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary }}>{message}</Text>
      </View>
    </View>
  );
}

/** The ?email= of an auth-email deep link. Expo Router parses the query
 * with URLSearchParams, which turns a "+" into a space -- so a
 * plus-addressed email (nume+orgos@gmail.com) arrives as "nume orgos@..."
 * even when the link encoded it as %2B. An email never contains a space,
 * so putting the "+" back is safe. */
export function linkEmail(raw?: string | string[]): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v ? v.trim().replace(/ /g, "+") : undefined;
}
