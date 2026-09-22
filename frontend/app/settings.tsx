import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

type SettingsRow = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  /** Undefined for a row whose own task hasn't landed yet -- shown but
   * inert, rather than hidden, so the full shape of Settings is visible
   * from the first pass (see Task #9's ordered subtask list). */
  onPress?: () => void;
};

/**
 * Reached by tapping the "Bună ziua" greeting on Home. Each row below
 * is its own subtask (name, password, email, language, colors, theme)
 * built one at a time -- wire a row's onPress up when its subtask
 * actually lands, don't get ahead of the current one.
 */
export default function Settings() {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const rows: SettingsRow[] = [
    { key: "name", icon: "person-outline", label: "Nume", value: user?.name },
    { key: "password", icon: "lock-closed-outline", label: "Parolă" },
    { key: "email", icon: "mail-outline", label: "Email", value: user?.email },
    { key: "language", icon: "language-outline", label: "Limbă" },
    { key: "colors", icon: "color-palette-outline", label: "Culori" },
    { key: "theme", icon: "sparkles-outline", label: "Temă" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="settings-screen">
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
          }}
        >
          <Pressable
            testID="settings-back"
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.pill,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={{ ...typography.title, color: colors.onSurface }}>Setări</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.sm }}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              testID={`settings-row-${row.key}`}
              onPress={row.onPress}
              disabled={!row.onPress}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                minHeight: 56,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: "transparent",
                opacity: row.onPress ? 1 : 0.5,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={row.icon} size={16} color={colors.onSurface} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.body, color: colors.onSurface }}>{row.label}</Text>
                {row.value ? (
                  <Text style={{ ...typography.caption, color: colors.onSurfaceTertiary, marginTop: 2 }} numberOfLines={1}>
                    {row.value}
                  </Text>
                ) : null}
              </View>

              {row.onPress ? (
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              ) : (
                <Text style={{ ...typography.micro, color: colors.onSurfaceTertiary }}>În curând</Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
