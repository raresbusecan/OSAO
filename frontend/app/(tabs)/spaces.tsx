import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, DeviceEventEmitter, Modal, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { EditSpaceModal } from "@/components/spaces/EditSpaceModal";
import { CarProfileForm } from "@/components/spaces/car/CarProfileForm";
import { HomeProfileForm } from "@/components/spaces/home/HomeProfileForm";
import {
  profileFromSpace,
  detectSpaceType,
  SPACE_IDENTITY_COLORS,
  type SpaceProfile,
  type CarProfile,
  type HomeProfile,
} from "@/lib/spaces/spaceProfile";

// Same identity colors used everywhere a Car/Home/Grocery/Expenses space
// shows up (Budget, Calendar, Home, the per-space headers) -- previously a
// separate set of near-black grays here, so a newly created space's own
// picker card never matched what that space would actually look like
// everywhere else.
// `kind` is sent as the new space's `type` on creation (see
// api.createSpace) -- a permanent, rename-proof marker so "Expenses
// Rares" is still recognized as an Expenses space forever, the same way
// Car/Home already were via their profile row's existence.
const TEMPLATES = [
  { name: "Car", icon: "car-outline", color: SPACE_IDENTITY_COLORS.car!, kind: "car" },
  { name: "Home", icon: "home-outline", color: SPACE_IDENTITY_COLORS.home!, kind: "home" },
  { name: "Grocery", icon: "cart-outline", color: SPACE_IDENTITY_COLORS.grocery!, kind: "grocery" },
  { name: "Expenses", icon: "receipt-outline", color: SPACE_IDENTITY_COLORS.expenses!, kind: "expenses" },
  // { name: "Study", icon: "school-outline", color: "#4B5563" },
  // { name: "Travel", icon: "airplane-outline", color: "#6B7280" },
  // "Finance" hidden deliberately (2026-09-20) -- real accounts/investments
  // tracking is a much bigger feature than a generic items-table category
  // can fake convincingly, unlike Car/Home/Grocery/Expenses. Re-add here
  // (with a real identity color and dashboard) once that's actually built.
  // { name: "Finance", icon: "wallet-outline", color: "#111111" },
  // { name: "Fitness", icon: "barbell-outline", color: "#374151" },
  // { name: "Work", icon: "briefcase-outline", color: "#4B5563" },
  // { name: "Health", icon: "medkit-outline", color: "#6B7280" },
] as const;

export default function Spaces() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const [spaces, setSpaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, SpaceProfile | null>>({});

  type CarFormState = { visible: boolean; mode: "create" | "edit"; space: any | null; profile: CarProfile | null };
  type HomeFormState = { visible: boolean; mode: "create" | "edit"; space: any | null; profile: HomeProfile | null };

  const [carForm, setCarForm] = useState<CarFormState>({ visible: false, mode: "create", space: null, profile: null });
  const [homeForm, setHomeForm] = useState<HomeFormState>({ visible: false, mode: "create", space: null, profile: null });

  const load = useCallback(async () => {
    try {
      const r = await api.listSpaces();
      setSpaces(r.spaces);

      // api.listSpaces eager-loads car_profile/home_profile on every
      // space now -- one request, no more per-space async reads.
      const entries = r.spaces.map((s: any) => [s.id, profileFromSpace(s)] as const);
      setProfiles(Object.fromEntries(entries));
    } catch { }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => load());
    return () => sub.remove();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const createFromTemplate = (t: typeof TEMPLATES[number]) => {
    // Closes the picker unconditionally, whichever form/modal opens next
    // -- called from both the empty-state pills and the "+ Add Space"
    // picker below, but only the latter has anything to close.
    setTemplatePickerVisible(false);

    // Car and Home get their own dedicated form (Make/Model/.../price;
    // County/City/ownership) -- see spaceProfile.ts for why. Every other
    // template (Grocery, Expenses, ...) gets the same "name it before
    // it's created" step via EditSpaceModal's create mode instead of the
    // old instant, generically-named creation -- that's what let two
    // Grocery spaces both end up just called "Grocery".
    if (t.name === "Car") {
      setCarForm({ visible: true, mode: "create", space: null, profile: null });
      return;
    }

    if (t.name === "Home") {
      setHomeForm({ visible: true, mode: "create", space: null, profile: null });
      return;
    }

    setEditSpaceMode("create");
    setEditingSpace({ name: t.name, icon: t.icon, color: t.color, type: t.kind });
  };

  const openEditForSpace = (spaceItem: any) => {
    const profile = profiles[spaceItem.id] ?? null;
    const kind = detectSpaceType(spaceItem, profile);

    if (kind === "car") {
      setCarForm({ visible: true, mode: "edit", space: spaceItem, profile: profile as CarProfile | null });
      return;
    }

    if (kind === "home") {
      setHomeForm({ visible: true, mode: "edit", space: spaceItem, profile: profile as HomeProfile | null });
      return;
    }

    // No dedicated form for this type (Grocery/Expenses/custom) -- the
    // generic name+icon editor is the right fallback here, since there's
    // nothing type-specific to protect.
    setEditSpaceMode("edit");
    setEditingSpace(spaceItem);
  };

  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [editingSpace, setEditingSpace] = useState<any>(null);
  const [editSpaceMode, setEditSpaceMode] = useState<"edit" | "create">("edit");
  // Templates used to sit in an always-visible carousel above the grid --
  // once every type already had a real space, that carousel just repeated
  // the same 4 icons a second time right above the actual cards. Now
  // behind one "+ Add Space" tile instead, opened on demand.
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);

  const confirmDeleteSpace = async (spaceItem: any) => {
    const confirmed = await confirmAction(
      "Ștergere spațiu",
      "Sunteți sigur că vreți să ștergeți acest spațiu? Toate datele vor fi pierdute definitiv.",
      { confirmLabel: "Șterge", destructive: true },
    );

    if (!confirmed) return;

    setDeletingId(spaceItem.id);
    try {
      await api.deleteSpace(spaceItem.id);
      await load();
    } catch (error: any) {
      notifyAction(
        "Nu am putut șterge spațiul",
        error?.message || "A apărut o eroare.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="spaces-screen">
      <View style={{ padding: spacing.xl, paddingBottom: spacing.md }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>Spaces</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 140, gap: spacing.md }}>
        {loading ? (
          <ActivityIndicator color={colors.onSurfaceTertiary} />
        ) : spaces.length === 0 ? (
          <View style={{ paddingVertical: spacing["3xl"], alignItems: "center", gap: spacing.lg }}>
            <Ionicons name="grid-outline" size={36} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.onSurface }}>Create your first Space</Text>
            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center", maxWidth: 300 }}>
              A Space is any part of your life you want to keep organized — Car, Home, Study, Travel or anything you invent.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" }}>
              {TEMPLATES.slice(0, 6).map((t) => (
                <Pressable
                  key={t.name}
                  testID={`template-${t.name.toLowerCase()}`}
                  onPress={() => createFromTemplate(t)}
                  style={{
                    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
                    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
                    flexDirection: "row", alignItems: "center", gap: 6,
                  }}
                >
                  <Ionicons name={t.icon as any} size={14} color={t.color} />
                  <Text style={{ color: colors.onSurface, fontSize: 13, fontWeight: "600" }}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {/* "+ Add Space" -- same dashed-border "add" affordance
                already used elsewhere (e.g. Grocery's Invite pill), sized
                to match the real space cards beside it instead of a
                separate always-visible template carousel that repeated
                the same 4 icons a second time once every type already
                had a real space. */}
            <Pressable
              testID="space-add-tile"
              onPress={() => setTemplatePickerVisible(true)}
              style={{
                width: "48%",
                minHeight: 140,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: colors.border,
                borderRadius: radius.sm,
                padding: spacing.lg,
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.md,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: radius.md,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="add" size={26} color={colors.onSurfaceTertiary} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSurfaceTertiary }}>
                Add Space
              </Text>
            </Pressable>
            {spaces.map((s) => {
              // Gray subtitle under the name, from the same per-space
              // profile the edit button already loads -- Model for Car,
              // County for Home. Nothing for a type with no profile.
              const profile = profiles[s.id] ?? null;
              const kind = detectSpaceType(s, profile);
              const identityColor = SPACE_IDENTITY_COLORS[kind] ?? colors.onSurface;
              const cardSubtitle =
                kind === "car"
                  ? (profile as CarProfile | null)?.model
                  : kind === "home"
                    ? (profile as HomeProfile | null)?.county
                    : undefined;

              return (
              <Pressable
                key={s.id}
                testID={`space-card-${s.id}`}
                onPress={() => router.push(`/${s.id}` as any)}
                style={{
                  width: "48%",
                  minHeight: 140,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.sm,
                  padding: spacing.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: spacing.md,
                  position: "relative",
                }}
              >
                <Pressable
                  testID={`space-card-edit-${s.id}`}
                  onPress={(event) => {
                    event.stopPropagation();
                    openEditForSpace(s);
                  }}
                  hitSlop={10}
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    width: 28,
                    height: 28,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="create-outline"
                    size={14}
                    color={colors.caution}
                  />
                </Pressable>

                <Pressable
                  testID={`space-card-delete-${s.id}`}
                  onPress={(event) => {
                    event.stopPropagation();
                    confirmDeleteSpace(s);
                  }}
                  hitSlop={10}
                  disabled={deletingId === s.id}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 28,
                    height: 28,
                    borderRadius: radius.pill,
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: deletingId === s.id ? 0.5 : 1,
                  }}
                >
                  {deletingId === s.id ? (
                    <ActivityIndicator size="small" color={colors.onSurfaceTertiary} />
                  ) : (
                    <Ionicons
                      name="trash-outline"
                      size={14}
                      color={colors.error}
                    />
                  )}
                </Pressable>

                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: radius.md,
                    backgroundColor: `${identityColor}1A`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={(s.icon || "folder-outline") as any}
                    size={22}
                    color={identityColor}
                  />
                </View>

                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: colors.onSurface,
                    textAlign: "center",
                  }}
                  numberOfLines={1}
                >
                  {s.name}
                </Text>

                {cardSubtitle ? (
                  <Text
                    style={{
                      marginTop: -8,
                      fontSize: 12,
                      color: colors.onSurfaceTertiary,
                      textAlign: "center",
                    }}
                    numberOfLines={1}
                  >
                    {cardSubtitle}
                  </Text>
                ) : null}
              </Pressable>
              );
            })}
            </View>
          </>
        )}
      </ScrollView>

      <EditSpaceModal
        visible={!!editingSpace}
        mode={editSpaceMode}
        space={editingSpace}
        onClose={() => setEditingSpace(null)}
        onSaved={() => load()}
      />

      <CarProfileForm
        visible={carForm.visible}
        mode={carForm.mode}
        space={carForm.space}
        initialProfile={carForm.profile}
        onClose={() => setCarForm((f) => ({ ...f, visible: false }))}
        onSaved={() => load()}
      />

      <HomeProfileForm
        visible={homeForm.visible}
        mode={homeForm.mode}
        space={homeForm.space}
        initialProfile={homeForm.profile}
        onClose={() => setHomeForm((f) => ({ ...f, visible: false }))}
        onSaved={() => load()}
      />

      <Modal visible={templatePickerVisible} transparent animationType="fade" onRequestClose={() => setTemplatePickerVisible(false)}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
          <Pressable
            onPress={() => setTemplatePickerVisible(false)}
            style={{ ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" }}
          />

          <View
            style={{
              width: "100%",
              maxWidth: 380,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              padding: spacing.xl,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.lg }}>
              Add a Space
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {TEMPLATES.map((t) => (
                <Pressable
                  key={t.name}
                  testID={`template-quick-${t.name.toLowerCase()}`}
                  onPress={() => createFromTemplate(t)}
                  style={{
                    flexGrow: 1,
                    flexBasis: "46%",
                    minHeight: 84,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: spacing.sm,
                  }}
                >
                  <Ionicons name={t.icon as any} size={20} color={t.color} />
                  <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "700" }}>{t.name}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              testID="template-picker-cancel"
              onPress={() => setTemplatePickerVisible(false)}
              style={{ marginTop: spacing.lg, minHeight: 48, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
