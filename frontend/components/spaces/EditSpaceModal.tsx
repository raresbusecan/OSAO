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

export type EditSpaceModalProps = {
  visible: boolean;
  space: { id: string | number; name: string; icon?: string } | null;
  onClose: () => void;
  onSaved: (updated: any) => void;
};

/**
 * Renaming for any space type with no dedicated form of its own (Grocery,
 * Expenses, a custom space) -- name only, deliberately not the same
 * name+icon editor the "New Space" creation flow uses. Car/Home don't use
 * this at all anymore (see CarProfileForm.tsx/HomeProfileForm.tsx) --
 * changing icon/type here would let a space impersonate a different one,
 * which is exactly what those dedicated forms exist to prevent.
 */
export function EditSpaceModal({ visible, space, onClose, onSaved }: EditSpaceModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (space) {
      setName(space.name || "");
    }
  }, [space]);

  const save = async () => {
    if (!space || !name.trim()) return;

    setBusy(true);
    try {
      const result = await api.updateSpace(space.id, { name: name.trim() });
      onSaved(result?.space ?? { ...space, name: name.trim() });
      onClose();
    } catch (error: any) {
      notifyAction(
        "Nu am putut salva",
        error?.message || "A apărut o eroare.",
      );
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
        <Pressable
          onPress={onClose}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
        />

        <View
          style={{
            backgroundColor: colors.surface,
            padding: spacing.xl,
            gap: spacing.lg,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.onSurface }}>
            Rename Space
          </Text>

          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 0.4,
              color: colors.onSurfaceTertiary,
              marginBottom: -8,
              textTransform: "uppercase",
            }}
          >
            Name<Text style={{ color: colors.error }}> *</Text>
          </Text>

          <TextInput
            testID="edit-space-name"
            value={name}
            onChangeText={setName}
            placeholder="Space name"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoFocus
            style={{
              backgroundColor: colors.surfaceSecondary,
              color: colors.onSurface,
              borderRadius: radius.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: 14,
              fontSize: 16,
            }}
          />

          <Pressable
            testID="edit-space-save-button"
            onPress={save}
            disabled={busy || !name.trim()}
            style={{
              backgroundColor: colors.brandPrimary,
              opacity: busy || !name.trim() ? 0.5 : 1,
              paddingVertical: 14,
              borderRadius: radius.md,
              alignItems: "center",
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 }}>
                Save Changes
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
