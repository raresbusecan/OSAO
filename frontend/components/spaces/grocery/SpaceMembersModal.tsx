import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, KeyboardAvoidingView, Platform, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { Avatar } from "@/components/Avatar";
import type { SpaceMember } from "@/lib/spaces/grocery/grocery.types";

export type SpaceMembersModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Only the space's owner can invite/remove -- enforced server-side
   * too (see ItemController::addMember/removeMember), this just hides
   * controls a non-owner can't use instead of showing them and failing
   * on tap. */
  isOwner: boolean;
  owner: SpaceMember | null;
  members: SpaceMember[];
  onAdd: (email: string) => Promise<void>;
  /** removeItems: false keeps their products on the list with the tag
   * cleared; true deletes those products along with them (see the
   * confirmation this "x" opens, and ItemController::removeMember). */
  onRemove: (userId: string, removeItems: boolean) => Promise<void>;
};

/**
 * The sheet behind the Grocery header's avatar stack -- shows everyone
 * who can see and edit the ACTIVE list (GroceryDashboard reloads
 * owner/members whenever the tab changes), and (owner-only) an email
 * field to add another registered account plus an "x" to remove one.
 * Sharing is strictly per-list: someone added here sees only this one
 * list, never the space's other lists (see ItemController::canAccessList
 * on the backend) -- there's also no invite-by-link/email-notification
 * flow yet, adding someone requires they already have an account under
 * that email, so a "no such account" reply is a real possibility, not a
 * bug.
 */
export function SpaceMembersModal({ visible, onClose, isOwner, owner, members, onAdd, onRemove }: SpaceMembersModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The "x" doesn't remove right away -- it opens this, asking what
  // happens to whatever the person added on this list (see onRemove's
  // removeItems). Holds the member so the confirmation can show their
  // name; null means the confirmation is closed.
  const [pendingRemoval, setPendingRemoval] = useState<SpaceMember | null>(null);

  const handleAdd = async () => {
    const trimmed = email.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError(null);

    try {
      await onAdd(trimmed);
      setEmail("");
    } catch (err: any) {
      setError(err?.message || "Nu am putut adăuga acest membru.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (userId: string, removeItems: boolean) => {
    setPendingRemoval(null);
    setRemovingId(userId);
    try {
      await onRemove(userId, removeItems);
    } finally {
      setRemovingId(null);
    }
  };

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
            maxWidth: 380,
            maxHeight: "80%",
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            padding: spacing.xl,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface }}>People</Text>

            <Pressable
              testID="space-members-close"
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

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
            {owner ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm }}>
                <Avatar id={owner.id} name={owner.name} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>{owner.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{owner.email}</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: colors.onSurfaceTertiary, textTransform: "uppercase" }}>
                  Owner
                </Text>
              </View>
            ) : null}

            {members.map((member) => (
              <View
                key={member.id}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm }}
              >
                <Avatar id={member.id} name={member.name} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurface }}>{member.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{member.email}</Text>
                </View>

                {isOwner ? (
                  <Pressable
                    testID={`space-members-remove-${member.id}`}
                    onPress={() => setPendingRemoval(member)}
                    disabled={removingId === member.id}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${member.name}`}
                    style={{ opacity: removingId === member.id ? 0.4 : 1 }}
                  >
                    <Ionicons name="close-circle-outline" size={20} color={colors.error} />
                  </Pressable>
                ) : null}
              </View>
            ))}

            {members.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, paddingVertical: spacing.sm }}>
                No one else has been added yet.
              </Text>
            ) : null}
          </ScrollView>

          {isOwner ? (
            <>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TextInput
                  testID="space-members-email-input"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={handleAdd}
                  returnKeyType="done"
                  placeholder="Their email"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={{
                    flex: 1,
                    minHeight: 48,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.sm,
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: colors.border,
                    color: colors.onSurface,
                    fontSize: 14,
                  }}
                />

                <Pressable
                  testID="space-members-add"
                  onPress={handleAdd}
                  disabled={saving || !email.trim()}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: radius.sm,
                    backgroundColor: colors.onSurface,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: saving || !email.trim() ? 0.5 : 1,
                  }}
                >
                  <Ionicons name="add" size={22} color={colors.surface} />
                </Pressable>
              </View>

              {error ? (
                <Text style={{ marginTop: spacing.sm, fontSize: 12, color: colors.error }}>{error}</Text>
              ) : (
                <Text style={{ marginTop: spacing.sm, fontSize: 12, color: colors.onSurfaceTertiary }}>
                  They need an existing account under that email.
                </Text>
              )}
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {/* REMOVE CONFIRMATION -- its own popup on top of everything
          above, same nesting pattern as GroceryProductModal's "new
          category" popup. Three ways out, not the usual confirm/cancel:
          what happens to this person's own products on the list is a
          real choice, not a detail to bury in a single "Remove" button. */}
      <Modal
        visible={!!pendingRemoval}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingRemoval(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            onPress={() => setPendingRemoval(null)}
            style={{ ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" }}
          />

          <View
            style={{
              width: "100%",
              maxWidth: 360,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              padding: spacing.xl,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm }}>
              Remove {pendingRemoval?.name}?
            </Text>
            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, marginBottom: spacing.lg, lineHeight: 20 }}>
              They won&apos;t see this list anymore. What about the products they already added to it?
            </Text>

            <Pressable
              testID="space-members-remove-keep-items"
              onPress={() => pendingRemoval && handleRemove(pendingRemoval.id, false)}
              style={{
                minHeight: 52,
                borderRadius: radius.sm,
                backgroundColor: colors.onSurface,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.error }}>Remove person, keep products</Text>
            </Pressable>

            <Pressable
              testID="space-members-remove-and-items"
              onPress={() => pendingRemoval && handleRemove(pendingRemoval.id, true)}
              style={{
                minHeight: 52,
                borderRadius: radius.sm,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.error }}>Remove person and their products</Text>
            </Pressable>

            <Pressable
              testID="space-members-remove-cancel"
              onPress={() => setPendingRemoval(null)}
              style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
}
