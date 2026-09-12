import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator, DeviceEventEmitter,
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
  type SpaceProfile,
  type CarProfile,
  type HomeProfile,
} from "@/lib/spaces/spaceProfile";

const TEMPLATES = [
  { name: "Car", icon: "car-outline", color: "#111111" },
  { name: "Home", icon: "home-outline", color: "#374151" },
  { name: "Grocery", icon: "cart-outline", color: "#4B5563" },
  { name: "Expenses", icon: "receipt-outline", color: "#111111" },
  // { name: "Study", icon: "school-outline", color: "#4B5563" },
  // { name: "Travel", icon: "airplane-outline", color: "#6B7280" },
  { name: "Finance", icon: "wallet-outline", color: "#111111" },
  // { name: "Fitness", icon: "barbell-outline", color: "#374151" },
  // { name: "Work", icon: "briefcase-outline", color: "#4B5563" },
  // { name: "Health", icon: "medkit-outline", color: "#6B7280" },
] as const;

export default function Spaces() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const [spaces, setSpaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("folder-outline");
  const [busy, setBusy] = useState(false);
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

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createSpace({ name: name.trim(), icon, color: "#111111" });
      setName(""); setIcon("folder-outline"); setCreating(false);
      await load();
    } catch { } finally { setBusy(false); }
  };

  const createFromTemplate = async (t: typeof TEMPLATES[number]) => {
    // Car and Home get a dedicated form (Make/Model/.../price;
    // County/City/ownership) instead of an instant, generically-named
    // space -- see spaceProfile.ts for why. Every other template keeps
    // the old instant-create behavior; no dedicated form was asked for
    // Grocery/Expenses/Finance.
    if (t.name === "Car") {
      setCarForm({ visible: true, mode: "create", space: null, profile: null });
      return;
    }

    if (t.name === "Home") {
      setHomeForm({ visible: true, mode: "create", space: null, profile: null });
      return;
    }

    setBusy(true);
    try {
      await api.createSpace({ name: t.name, icon: t.icon, color: t.color });
      await load();
    } catch { } finally { setBusy(false); }
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
    setEditingSpace(spaceItem);
  };

  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [editingSpace, setEditingSpace] = useState<any>(null);

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
      <View style={{ padding: spacing.xl, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>Spaces</Text>
        <Pressable
          testID="spaces-create-button"
          onPress={() => setCreating(true)}
          hitSlop={12}
          style={{ padding: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary }}
        >
          <Ionicons name="add" size={22} color={colors.onSurface} />
        </Pressable>
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
                  <Ionicons name={t.icon as any} size={14} color={colors.onSurface} />
                  <Text style={{ color: colors.onSurface, fontSize: 13, fontWeight: "600" }}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            {spaces.map((s) => {
              // Gray subtitle under the name, from the same per-space
              // profile the edit button already loads -- Model for Car,
              // County for Home. Nothing for a type with no profile.
              const profile = profiles[s.id] ?? null;
              const kind = detectSpaceType(s, profile);
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
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: radius.lg,
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
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceTertiary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="create-outline"
                    size={14}
                    color={colors.onSurfaceTertiary}
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
                    backgroundColor: colors.surfaceTertiary,
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
                      color={colors.onSurfaceTertiary}
                    />
                  )}
                </Pressable>

                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceTertiary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={(s.icon || "folder-outline") as any}
                    size={22}
                    color={colors.onSurface}
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
        )}

        {spaces.length > 0 && (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "700", letterSpacing: 0.4 }}>
              QUICK TEMPLATES
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {TEMPLATES.map((t) => (
                <Pressable
                  key={t.name}
                  testID={`template-quick-${t.name.toLowerCase()}`}
                  onPress={() => createFromTemplate(t)}
                  style={{
                    paddingHorizontal: spacing.md, paddingVertical: 8,
                    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
                    flexDirection: "row", alignItems: "center", gap: 6,
                  }}
                >
                  <Ionicons name={t.icon as any} size={12} color={colors.onSurface} />
                  <Text style={{ color: colors.onSurface, fontSize: 12 }}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={creating} animationType="slide" transparent onRequestClose={() => setCreating(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable onPress={() => setCreating(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />
          <View style={{ backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.onSurface }}>New Space</Text>
            <TextInput
              testID="new-space-name"
              value={name} onChangeText={setName}
              placeholder="e.g. Car, Home, Study"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoFocus
              style={{
                backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
                borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 16,
              }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {["folder-outline", "car-outline", "home-outline", "school-outline", "airplane-outline", "wallet-outline", "barbell-outline", "briefcase-outline", "medkit-outline", "paw-outline", "camera-outline", "cafe-outline"].map((ic) => (
                <Pressable
                  key={ic}
                  testID={`icon-pick-${ic}`}
                  onPress={() => setIcon(ic)}
                  style={{
                    width: 44, height: 44, borderRadius: radius.md,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: icon === ic ? colors.brandPrimary : colors.surfaceSecondary,
                  }}
                >
                  <Ionicons name={ic as any} size={20} color={icon === ic ? colors.onBrandPrimary : colors.onSurface} />
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              testID="new-space-create-button"
              onPress={create}
              disabled={busy || !name.trim()}
              style={{
                backgroundColor: colors.brandPrimary,
                opacity: busy || !name.trim() ? 0.5 : 1,
                paddingVertical: 14, borderRadius: radius.md, alignItems: "center",
              }}
            >
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15 }}>Create Space</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <EditSpaceModal
        visible={!!editingSpace}
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
    </SafeAreaView>
  );
}
