import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { HomeCategorySection, type HomeCategoryRow } from "./HomeCategorySection";
import type { HomeCategoryField } from "./homeCategoryConfig";

export type HomeCategoryPageProps = {
  title: string;
  fields: HomeCategoryField[];
  submitLabel: string;
  rows: HomeCategoryRow[];
  emptyLabel: string;
  onBack: () => void;
  onSubmit: (values: Record<string, string>) => void;
};

/**
 * One generic "dedicated category page" (form + existing entries),
 * configured per category via homeCategoryConfig.ts instead of five
 * near-identical hand-written form files.
 */
export function HomeCategoryPage({
  title,
  fields,
  submitLabel,
  rows,
  emptyLabel,
  onBack,
  onSubmit,
}: HomeCategoryPageProps) {
  const { colors, spacing, radius } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});

  const canSubmit = fields.every((field) => (values[field.key] || "").trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(values);
    setValues({});
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 150 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
        }}
      >
        <Pressable
          testID="category-back"
          onPress={onBack}
          hitSlop={10}
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSecondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 }}>
          {title}
        </Text>
      </View>

      <View
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderRadius: radius.lg,
          padding: spacing.lg,
          gap: spacing.sm,
          marginBottom: spacing.xl,
        }}
      >
        {fields.map((field) => (
          <View key={field.key}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.4,
                color: colors.onSurfaceTertiary,
                marginBottom: 4,
                textTransform: "uppercase",
              }}
            >
              {field.label}
              <Text style={{ color: colors.error }}> *</Text>
            </Text>

            <TextInput
              testID={`category-field-${field.key}`}
              value={values[field.key] || ""}
              onChangeText={(text) => setValues((current) => ({ ...current, [field.key]: text }))}
              placeholder={field.placeholder}
              placeholderTextColor={colors.onSurfaceTertiary}
              style={{
                height: 44,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.onSurface,
                fontSize: 14,
              }}
            />
          </View>
        ))}

        <Pressable
          testID="category-submit"
          onPress={submit}
          disabled={!canSubmit}
          style={{
            marginTop: 4,
            height: 46,
            borderRadius: radius.md,
            backgroundColor: colors.onSurface,
            alignItems: "center",
            justifyContent: "center",
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.surface }}>
            {submitLabel}
          </Text>
        </Pressable>
      </View>

      <HomeCategorySection title="Existing" rows={rows} emptyLabel={emptyLabel} />
    </ScrollView>
  );
}
