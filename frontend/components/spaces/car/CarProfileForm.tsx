import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";
import {
  carProfileName,
  carProfileToApiBody,
  carProfileFromApi,
  type CarProfile,
} from "@/lib/spaces/spaceProfile";

export type CarProfileFormProps = {
  visible: boolean;
  mode: "create" | "edit";
  space?: { id: string | number } | null;
  initialProfile?: CarProfile | null;
  onClose: () => void;
  onSaved: (space: any, profile: CarProfile) => void;
};


/**
 * The dedicated Car form -- Make, Model, Color (optional), Year, Purchase
 * price -- used both to create a new Car space and to edit an existing
 * one. The space's display name is derived from Make alone (e.g. "BMW"),
 * never typed directly -- Model is shown separately, as CarDashboard's
 * own gray subtitle under the name, the same way Home shows its county.
 */
export function CarProfileForm({
  visible,
  mode,
  space,
  initialProfile,
  onClose,
  onSaved,
}: CarProfileFormProps) {
  const { colors, spacing, radius } = useTheme();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [tankCapacity, setTankCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  // Only true after a real Save attempt -- the Tank capacity warning must
  // never appear just because the field happens to be empty while the
  // user hasn't tried to submit yet.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!visible) return;

    setSubmitAttempted(false);

    // Editing shows exactly what was last saved -- persisted until the
    // next edit, never reset. Creating starts every field genuinely
    // empty -- no defaults silently pre-filled (not even Year/Price).
    if (initialProfile) {
      setMake(initialProfile.make);
      setModel(initialProfile.model);
      setColor(initialProfile.color ?? "");
      setYear(String(initialProfile.year));
      setPurchasePrice(String(initialProfile.purchasePrice));
      setTankCapacity(
        initialProfile.tankCapacity ? String(initialProfile.tankCapacity) : "",
      );
    } else {
      setMake("");
      setModel("");
      setColor("");
      setYear("");
      setPurchasePrice("");
      setTankCapacity("");
    }
  }, [visible, initialProfile]);

  const tankCapacityMissing = tankCapacity.trim().length === 0;

  const canSubmit =
    make.trim().length > 0 && model.trim().length > 0 && !tankCapacityMissing;

  const submit = async () => {
    if (!canSubmit) {
      setSubmitAttempted(true);
      return;
    }

    const profile: CarProfile = {
      kind: "car",
      make: make.trim(),
      model: model.trim(),
      color: color.trim() || undefined,
      year: Number(year) || new Date().getFullYear(),
      purchasePrice: Number(purchasePrice.replace(",", ".")) || 0,
      tankCapacity: Number(tankCapacity.replace(",", ".")) || 0,
    };

    const derivedName = carProfileName(profile);

    setBusy(true);
    try {
      let targetSpace: any;

      if (mode === "create") {
        const created = await api.createSpace({
          name: derivedName,
          icon: "car-outline",
          color: "#111111",
        });
        targetSpace = created?.space ?? created;
      } else if (space) {
        const result = await api.updateSpace(space.id, { name: derivedName });
        targetSpace = result?.space ?? { ...space, name: derivedName };
      } else {
        return;
      }

      const profileResult = await api.saveCarProfile(
        targetSpace.id,
        carProfileToApiBody(profile),
      );
      const savedProfile = carProfileFromApi(profileResult?.profile) ?? profile;

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
            {mode === "create" ? "New Car" : "Edit Car"}
          </Text>

          <Field label="Make" value={make} onChangeText={setMake} placeholder="e.g. BMW" required colors={colors} spacing={spacing} radius={radius} />
          <Field label="Model" value={model} onChangeText={setModel} placeholder="e.g. 340D" required colors={colors} spacing={spacing} radius={radius} />
          <Field label="Color (optional)" value={color} onChangeText={setColor} placeholder="e.g. Black" colors={colors} spacing={spacing} radius={radius} />
          <Field label="Year" value={year} onChangeText={setYear} placeholder="e.g. 2020" keyboardType="number-pad" colors={colors} spacing={spacing} radius={radius} />
          <Field label="Purchase price (RON)" value={purchasePrice} onChangeText={setPurchasePrice} placeholder="0" keyboardType="decimal-pad" colors={colors} spacing={spacing} radius={radius} />
          <Field
            label="Tank capacity (L)"
            value={tankCapacity}
            onChangeText={setTankCapacity}
            placeholder="e.g. 57"
            keyboardType="decimal-pad"
            required
            warning={
              submitAttempted && tankCapacityMissing
                ? "We are calculating based on tank capacity!"
                : undefined
            }
            colors={colors}
            spacing={spacing}
            radius={radius}
          />

          <Pressable
            testID="car-profile-save"
            onPress={submit}
            disabled={busy}
            style={{
              marginTop: spacing.sm,
              backgroundColor: colors.brandPrimary,
              opacity: busy ? 0.5 : 1,
              paddingVertical: 14,
              borderRadius: radius.md,
              alignItems: "center",
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 }}>
                {mode === "create" ? "Create Car" : "Save Changes"}
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
  warning,
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
  /** Red text shown next to the label -- only while the field is actually
   * empty; disappears the moment the user enters a valid value. */
  warning?: string;
  colors: any;
  spacing: any;
  radius: any;
}) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 0.4,
            color: colors.onSurfaceTertiary,
            textTransform: "uppercase",
          }}
        >
          {label}
          {required ? <Text style={{ color: colors.error }}> *</Text> : null}
        </Text>

        {warning ? (
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.error }}>
            {warning}
          </Text>
        ) : null}
      </View>

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
