import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";
import {
  homeProfileName,
  homeProfileToApiBody,
  homeProfileFromApi,
  type HomeProfile,
} from "@/lib/spaces/spaceProfile";

export type HomeProfileFormProps = {
  visible: boolean;
  mode: "create" | "edit";
  space?: { id: string | number } | null;
  initialProfile?: HomeProfile | null;
  onClose: () => void;
  onSaved: (space: any, profile: HomeProfile) => void;
};

/**
 * The dedicated Home form -- County, City/Village, and a Bought/Inherited
 * toggle that reveals a purchase-price field only when "Bought" is on.
 * The space's display name is derived from the city alone (e.g. "Băiuț"),
 * never typed directly.
 */
export function HomeProfileForm({
  visible,
  mode,
  space,
  initialProfile,
  onClose,
  onSaved,
}: HomeProfileFormProps) {
  const { colors, spacing, radius } = useTheme();
  const [county, setCounty] = useState("");
  const [city, setCity] = useState("");
  const [bought, setBought] = useState(true);
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;

    if (initialProfile) {
      setCounty(initialProfile.county);
      setCity(initialProfile.city);
      setBought(initialProfile.ownership === "bought");
      setPurchasePrice(String(initialProfile.purchasePrice ?? 0));
    } else {
      setCounty("");
      setCity("");
      setBought(true);
      setPurchasePrice("0");
    }
  }, [visible, initialProfile]);

  const canSubmit = county.trim().length > 0 && city.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;

    const profile: HomeProfile = {
      kind: "home",
      county: county.trim(),
      city: city.trim(),
      ownership: bought ? "bought" : "inherited",
      ...(bought ? { purchasePrice: Number(purchasePrice.replace(",", ".")) || 0 } : {}),
    };

    const derivedName = homeProfileName(profile);

    setBusy(true);
    try {
      let targetSpace: any;

      if (mode === "create") {
        const created = await api.createSpace({
          name: derivedName,
          icon: "home-outline",
          color: "#374151",
        });
        targetSpace = created?.space ?? created;
      } else if (space) {
        const result = await api.updateSpace(space.id, { name: derivedName });
        targetSpace = result?.space ?? { ...space, name: derivedName };
      } else {
        return;
      }

      const profileResult = await api.saveHomeProfile(
        targetSpace.id,
        homeProfileToApiBody(profile),
      );
      const savedProfile = homeProfileFromApi(profileResult?.profile) ?? profile;

      onSaved(targetSpace, savedProfile);
      onClose();
    } catch (error: any) {
      notifyAction("Nu am putut salva", error?.message || "A apărut o eroare.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />

        <View
          style={{
            backgroundColor: colors.surface,
            padding: spacing.xl,
            gap: spacing.md,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.onSurface }}>
            {mode === "create" ? "New Home" : "Edit Home"}
          </Text>

          <Field label="County (Județ)" value={county} onChangeText={setCounty} placeholder="e.g. Maramureș" required colors={colors} spacing={spacing} radius={radius} />
          <Field label="City / Village" value={city} onChangeText={setCity} placeholder="e.g. Băiuț" required colors={colors} spacing={spacing} radius={radius} />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}>
              Bought
            </Text>

            <Switch
              testID="home-profile-bought-toggle"
              value={bought}
              onValueChange={setBought}
              trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
            />
          </View>

          {bought ? (
            <Field
              label="Purchase price (RON)"
              value={purchasePrice}
              onChangeText={setPurchasePrice}
              placeholder="0"
              keyboardType="decimal-pad"
              colors={colors}
              spacing={spacing}
              radius={radius}
            />
          ) : null}

          <Pressable
            testID="home-profile-save"
            onPress={submit}
            disabled={busy || !canSubmit}
            style={{
              marginTop: spacing.sm,
              backgroundColor: colors.brandPrimary,
              opacity: busy || !canSubmit ? 0.5 : 1,
              paddingVertical: 14,
              borderRadius: radius.md,
              alignItems: "center",
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 }}>
                {mode === "create" ? "Create Home" : "Save Changes"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  required,
  colors,
  spacing,
  radius,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  /** Shows a red "*" next to the label. */
  required?: boolean;
  colors: any;
  spacing: any;
  radius: any;
}) {
  return (
    <View>
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
        {label}
        {required ? <Text style={{ color: colors.error }}> *</Text> : null}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceTertiary}
        keyboardType={keyboardType}
        style={{
          height: 44,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSecondary,
          color: colors.onSurface,
          fontSize: 14,
        }}
      />
    </View>
  );
}
