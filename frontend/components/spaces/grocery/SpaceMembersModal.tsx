import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { Avatar } from "@/components/Avatar";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Group, Row, Chip, Field, Button } from "@/components/ui/primitives";
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
  const { colors, spacing } = useTheme();
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

  const GROC = useSpaceColors("grocery").color;
  const people = [...(owner ? [{ ...owner, isOwner: true }] : []), ...members.map((m) => ({ ...m, isOwner: false }))];

  return (
    <>
      <Sheet info="grocery.members" visible={visible} onClose={onClose} title="Cine vede lista" icon="people-outline" tone={GROC}>
        <Group inset={62}>
          {people.map((person) => (
            <Row
              key={person.id}
              leading={<Avatar id={person.id} name={person.name} />}
              title={person.name}
              subtitle={person.email}
              trailing={
                person.isOwner ? (
                  <Chip label="Proprietar" color={colors.onSurfaceTertiary} filled={false} />
                ) : isOwner ? (
                  <Pressable
                    testID={`space-members-remove-${person.id}`}
                    onPress={() => setPendingRemoval(person)}
                    disabled={removingId === person.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Scoate-l pe ${person.name}`}
                    style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: removingId === person.id ? 0.4 : 1 }}
                  >
                    <Ionicons name="remove-circle-outline" size={22} color={colors.error} />
                  </Pressable>
                ) : null
              }
            />
          ))}
        </Group>
        {members.length === 0 ? <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>Nu ai adăugat pe nimeni încă.</Text> : null}

        {isOwner ? (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Field
                  testID="space-members-email-input"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={handleAdd}
                  placeholder="Emailul persoanei"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  tone={GROC}
                  error={error}
                  hint={error ? null : "Trebuie să aibă deja cont cu acest email."}
                />
              </View>
              <Button testID="space-members-add" label="Invită" tone={GROC} onPress={handleAdd} loading={saving} disabled={!email.trim()} />
            </View>
          </View>
        ) : null}
      </Sheet>

      <Sheet
        visible={!!pendingRemoval}
        onClose={() => setPendingRemoval(null)}
        centered
        icon="person-remove-outline"
        tone={colors.error}
        title={`Îl scoți pe ${pendingRemoval?.name ?? ""}?`}
        subtitle="Nu va mai vedea lista. Ce faci cu produsele pe care le-a adăugat?"
        footer={
          <>
            <Button testID="space-members-remove-keep-items" variant="destructive" label="Scoate persoana, păstrează produsele" onPress={() => pendingRemoval && handleRemove(pendingRemoval.id, false)} />
            <Button testID="space-members-remove-and-items" variant="destructive" label="Scoate persoana și produsele ei" onPress={() => pendingRemoval && handleRemove(pendingRemoval.id, true)} />
            <Button variant="ghost" label="Renunță" onPress={() => setPendingRemoval(null)} />
          </>
        }
      />
    </>
  );
}
