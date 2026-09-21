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
  /** "edit" (the default -- every existing call site) renames an
   * already-saved space. "create" collects just a name for a NEW space
   * before it exists at all -- same modal, same UX as Car/Home's own
   * "fill in details, then Create" forms, for the 2 kinds (Grocery,
   * Expenses) that have no dedicated profile form of their own. */
  mode?: "edit" | "create";
  /** In "edit" mode: the existing space (id required). In "create"
   * mode: the template's own icon/color/type, carried straight through
   * to api.createSpace once the user confirms a name -- id is never
   * read here. */
  space: { id?: string | number; name: string; icon?: string; color?: string; type?: string } | null;
  onClose: () => void;
  onSaved: (updated: any) => void;
};

/**
 * Renaming for any space type with no dedicated form of its own (Grocery,
 * Expenses, a custom space) -- name only, deliberately not the same
 * name+icon editor Car/Home's own dedicated forms use (see
 * CarProfileForm.tsx/HomeProfileForm.tsx) -- changing icon/type here
 * would let a space impersonate a different one, which those forms
 * exist to prevent. In "create" mode this doubles as the pre-creation
 * naming step those 2 kinds were missing -- a space no longer gets
 * created with a generic template name (then only renameable
 * afterward); the user names it before it's created at all.
 */
export function EditSpaceModal({ visible, mode = "edit", space, onClose, onSaved }: EditSpaceModalProps) {
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
      if (mode === "create") {
        const result = await api.createSpace({
          name: name.trim(),
          icon: space.icon,
          color: space.color,
          type: space.type,
        });
        onSaved(result?.space ?? result);
      } else {
        const result = await api.updateSpace(space.id!, { name: name.trim() });
        onSaved(result?.space ?? { ...space, name: name.trim() });
      }
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
            {mode === "create" ? "New Space" : "Rename Space"}
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
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.onSurface,
              borderRadius: radius.sm,
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
              borderRadius: radius.sm,
              alignItems: "center",
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 }}>
                {mode === "create" ? "Create" : "Save Changes"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
