import React from "react";
import { View, Text, TextInput, Pressable, Modal, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

export type GroceryNewListModalProps = {
  visible: boolean;
  name: string;
  onChangeName: (name: string) => void;
  onClose: () => void;
  onCreate: () => void;
  /** True while the create request is in flight -- disables Create so
   * a slow connection doesn't get double-submitted. Optional since
   * GroceryListsPage's own create isn't awaited from that page. */
  saving?: boolean;
};

/**
 * The one popup every "New list" entry point opens -- Lists/Smart
 * List/Recipes each render this the same way, driven by the same
 * shared `creatingList` state from GroceryDashboard. A simple, single
 * field: name, then Create; X in the corner to back out, same as
 * GroceryProductModal's "New category" popup.
 */
export function GroceryNewListModal({ visible, name, onChangeName, onClose, onCreate, saving }: GroceryNewListModalProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={onClose} style={{ ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" }} />

        <View
          style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            padding: spacing.xl,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface }}>New list</Text>

            <Pressable
              testID="grocery-new-list-close"
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.pill,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <TextInput
            testID="grocery-new-list-input"
            value={name}
            onChangeText={onChangeName}
            onSubmitEditing={onCreate}
            returnKeyType="done"
            autoFocus
            placeholder="e.g. Week 3"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={{
              minHeight: 48,
              paddingHorizontal: spacing.md,
              borderRadius: radius.sm,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.onSurface,
              fontSize: 15,
              marginBottom: spacing.lg,
            }}
          />

          <Pressable
            testID="grocery-new-list-create"
            onPress={onCreate}
            disabled={!!saving}
            style={{
              minHeight: 52,
              borderRadius: radius.md,
              backgroundColor: colors.onSurface,
              alignItems: "center",
              justifyContent: "center",
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>Create</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
