import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, ActivityIndicator, DeviceEventEmitter, Dimensions, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { dueBySpace, dueStatus, type SpaceDue } from "@/lib/dashboard/spaceDue";
import { EditSpaceModal } from "@/components/spaces/EditSpaceModal";
import { CarProfileForm } from "@/components/spaces/car/CarProfileForm";
import { HomeProfileForm } from "@/components/spaces/home/HomeProfileForm";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { PageTitle, CircleButton, IconWell, InfoButton } from "@/components/ui/primitives";
import { motion } from "@/lib/motion";
import {
  profileFromSpace,
  detectSpaceType,
  SPACE_IDENTITY_COLORS,
  SPACE_BUTTON_FILL,
  SPACE_ON_FILL,
  SPACE_KIND_LABEL,
  spaceTextColor,
  type SpaceKind,
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
  { name: "Mașină", icon: "car-outline", color: SPACE_IDENTITY_COLORS.car!, kind: "car", hint: "Alimentări, service, documente, rate" },
  { name: "Casă", icon: "home-outline", color: SPACE_IDENTITY_COLORS.home!, kind: "home", hint: "Sarcini, facturi, provizii, rate" },
  { name: "Cumpărături", icon: "cart-outline", color: SPACE_IDENTITY_COLORS.grocery!, kind: "grocery", hint: "Liste partajate și rețete" },
  { name: "Cheltuieli", icon: "receipt-outline", color: SPACE_IDENTITY_COLORS.expenses!, kind: "expenses", hint: "Alte cheltuieli și credite" },
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
  const { colors, spacing, radius, isDark } = useTheme();
  const router = useRouter();
  // Two cards per row, minus the page's side padding and the gap.
  const cardWidth = (Dimensions.get("window").width - spacing.gutter * 2 - spacing.md) / 2;
  const [spaces, setSpaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, SpaceProfile | null>>({});
  // Per-space to-do counts (from the same dashboard endpoint Home uses)
  // -- the tile's one status line.
  const [dueMap, setDueMap] = useState<Map<string, SpaceDue>>(new Map());
  const [toBuy, setToBuy] = useState<Record<string, number>>({});
  // Edit mode (the pencil, or a long press on an EMPTY spot of the page --
  // a press on a card opens the card): a one-column list with a ☰ handle,
  // edit and delete per space. The order is a draft of ids, saved on
  // "Gata". It used to be a 2-column DraggableFlatList, which that library
  // doesn't support (it measures rows as one column), so cards jumped to
  // the wrong place mid-drag.
  const [editing, setEditing] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const startEditing = () => {
    setDraftOrder(spaces.map((x) => String(x.id)));
    setEditing(true);
  };

  type CarFormState = { visible: boolean; mode: "create" | "edit"; space: any | null; profile: CarProfile | null };
  type HomeFormState = { visible: boolean; mode: "create" | "edit"; space: any | null; profile: HomeProfile | null };

  const [carForm, setCarForm] = useState<CarFormState>({ visible: false, mode: "create", space: null, profile: null });
  const [homeForm, setHomeForm] = useState<HomeFormState>({ visible: false, mode: "create", space: null, profile: null });

  const load = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([api.listSpaces(), api.dashboard().catch(() => null)]);
      setSpaces(r.spaces);
      if (d) {
        setDueMap(dueBySpace([...(d.overdue || []), ...(d.today || []), ...(d.upcoming || [])]));
        setToBuy(d.toBuy || {});
      }

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
    if (t.kind === "car") {
      setCarForm({ visible: true, mode: "create", space: null, profile: null });
      return;
    }

    if (t.kind === "home") {
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
      `Ștergi „${spaceItem.name}”?`,
      "Tot ce e în el se șterge definitiv și nu se poate anula.",
      { confirmLabel: "Șterge", destructive: true },
    );

    if (!confirmed) return;

    setDeletingId(spaceItem.id);
    try {
      await api.deleteSpace(spaceItem.id);
      setDraftOrder((ids) => ids.filter((id) => id !== String(spaceItem.id)));
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

  const finishEditing = async () => {
    const current = spaces.map((x) => String(x.id));
    const order = draftOrder.filter((id) => current.includes(id));
    if (order.join(",") === current.join(",")) {
      setEditing(false);
      return;
    }
    setSavingOrder(true);
    try {
      await api.reorderSpaces(order);
      await load();
      setEditing(false);
    } catch (error: any) {
      notifyAction("Nu am putut salva ordinea", error?.message || "A apărut o eroare.");
    } finally {
      setSavingOrder(false);
    }
  };

  const spaceMeta = (s: any) => {
    const profile = profiles[s.id] ?? null;
    const kind = detectSpaceType(s, profile) as SpaceKind;
    return { profile, kind, fill: SPACE_IDENTITY_COLORS[kind] ?? colors.onSurfaceTertiary, tint: spaceTextColor(kind, isDark) ?? colors.onSurface };
  };

  const renderSpaceCard = (s: any) => {
    // Status line under the name: what needs doing here, else the
    // profile detail (Model for Car, County for Home), else the kind.
    const { profile, kind, fill, tint } = spaceMeta(s);
    const due = dueStatus(dueMap.get(String(s.id)));
    const detail =
      kind === "car"
        ? (profile as CarProfile | null)?.model
        : kind === "home"
          ? (profile as HomeProfile | null)?.city || (profile as HomeProfile | null)?.county
          : undefined;
    const buy = toBuy[String(s.id)] ?? 0;
    const status = due ? due.text : buy > 0 ? `${buy} de cumpărat` : detail || "La zi";

    return (
        <PressableScale
          key={s.id}
          testID={`space-card-${s.id}`}
          onPress={() => router.push(`/${s.id}` as any)}
          accessibilityRole="button"
          accessibilityLabel={`${s.name}, ${status}`}
          style={{
            width: cardWidth,
            minHeight: 150,
            backgroundColor: colors.surfaceSecondary,
            borderRadius: radius.lg,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <IconWell icon={(s.icon || "folder-outline") as any} color={fill} tint={tint} size={44} />
          </View>
          <View style={{ marginTop: "auto", gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{s.name}</Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{SPACE_KIND_LABEL[kind] ?? "Spațiu"}</Text>
            <Text style={{ fontSize: 13, color: due ? (due.tone === "error" ? colors.error : colors.warning) : colors.onSurfaceTertiary, marginTop: 4 }} numberOfLines={1}>{status}</Text>
          </View>
        </PressableScale>
    );
  };

  // One row of edit mode: ☰ drags right away, then edit and delete.
  const renderEditRow = ({ item: id, drag, isActive }: RenderItemParams<string>) => {
    const s = spaces.find((x) => String(x.id) === id);
    if (!s) return null;
    const { kind, fill, tint } = spaceMeta(s);
    return (
      <ScaleDecorator activeScale={1.03}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            paddingVertical: spacing.md,
            paddingRight: spacing.md,
            marginBottom: spacing.sm,
            borderRadius: radius.card,
            backgroundColor: isActive ? colors.surfaceTertiary : colors.surfaceSecondary,
          }}
        >
          <Pressable
            testID={`space-edit-drag-${s.id}`}
            onPressIn={drag}
            disabled={isActive}
            accessibilityRole="button"
            accessibilityLabel={`Mută ${s.name}`}
            hitSlop={6}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="reorder-three" size={24} color={colors.onSurfaceTertiary} />
          </Pressable>
          <IconWell icon={(s.icon || "folder-outline") as any} color={fill} tint={tint} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{s.name}</Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{SPACE_KIND_LABEL[kind] ?? "Spațiu"}</Text>
          </View>
          <CircleButton testID={`space-card-edit-${s.id}`} icon="create-outline" label={`Editează ${s.name}`} onPress={() => openEditForSpace(s)} />
          {deletingId === s.id ? (
            <View style={{ width: 44, alignItems: "center" }}><ActivityIndicator size="small" color={colors.onSurfaceTertiary} /></View>
          ) : (
            <CircleButton testID={`space-card-delete-${s.id}`} icon="trash-outline" label={`Șterge ${s.name}`} onPress={() => confirmDeleteSpace(s)} />
          )}
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="spaces-screen">
      <View style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.md }}>
        {editing ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Editezi spațiile</Text>
                <InfoButton topic="spaces.edit" />
              </View>
              <Text style={{ fontSize: 22, fontWeight: "600", color: colors.onSurface }}>Aranjează</Text>
            </View>
            <Pressable
              testID="spaces-edit-cancel"
              onPress={() => setEditing(false)}
              disabled={savingOrder}
              accessibilityRole="button"
              accessibilityLabel="Renunță la ordinea nouă"
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}
            >
              <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>Renunță</Text>
            </Pressable>
            <PressableScale
              testID="spaces-reorder-done"
              onPress={finishEditing}
              disabled={savingOrder}
              scaleTo={motion.scale.control}
              accessibilityRole="button"
              accessibilityLabel="Gata, salvează ordinea"
              style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.onSurface, alignItems: "center", justifyContent: "center", opacity: savingOrder ? 0.6 : 1 }}
            >
              {savingOrder ? <ActivityIndicator color={colors.surface} /> : <Text style={{ fontSize: 15, fontWeight: "600", color: colors.surface }}>Gata</Text>}
            </PressableScale>
          </View>
        ) : (
          <PageTitle
            info="spaces.page"
            right={
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {spaces.length > 0 ? (
                  <CircleButton testID="spaces-edit-open" icon="create-outline" label="Editează spațiile" onPress={startEditing} />
                ) : null}
                <CircleButton testID="space-add-tile" icon="add" label="Spațiu nou" tone={colors.onSurface} onPress={() => setTemplatePickerVisible(true)} />
              </View>
            }
          >
            Spații
          </PageTitle>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.onSurfaceTertiary} style={{ marginTop: spacing.xl }} />
      ) : spaces.length === 0 ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 140, gap: spacing.section }}>
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: "600", letterSpacing: -0.2, color: colors.onSurface }}>
              Creează primul tău spațiu
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary }}>
              Alege ce vrei să ții în ordine. Poți adăuga oricând altele.
            </Text>
          </View>
          <TemplateList onPick={createFromTemplate} />
        </ScrollView>
      ) : editing ? (
        <DraggableFlatList
          testID="space-edit-list"
          data={draftOrder}
          keyExtractor={(id) => id}
          onDragEnd={({ data }) => setDraftOrder(data)}
          renderItem={renderEditRow}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 140 }}
        />
      ) : (
        <ScrollView testID="space-card-list" contentContainerStyle={{ flexGrow: 1 }}>
          {/* The page itself is long-pressable: a press on a card opens
              that card (it's the inner responder); one on an empty spot
              opens edit mode -- same as Acasă. */}
          <Pressable
            testID="spaces-empty-longpress"
            onLongPress={startEditing}
            delayLongPress={450}
            accessible={false}
            style={{ flexGrow: 1, flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", gap: spacing.md, paddingHorizontal: spacing.gutter, paddingBottom: 140 }}
          >
            {spaces.map(renderSpaceCard)}
          </Pressable>
        </ScrollView>
      )}

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

      <Sheet
        visible={templatePickerVisible}
        onClose={() => setTemplatePickerVisible(false)}
        title="Spațiu nou"
        subtitle="Alege ce vrei să organizezi"
        info="spaces.page"
        testID="template-picker"
      >
        <TemplateList onPick={createFromTemplate} />
      </Sheet>

    </SafeAreaView>
  );
}

/** "#RRGGBB" + alpha -> rgba(), for the template tiles' identity tint. */
function withAlpha(hex: string, a: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** The 4 space types as a 2x2 grid of "create" cards -- used by the "+"
 * sheet and the empty state. Deliberately NOT an existing-space tile
 * (those are opaque surfaceSecondary + IconWell + status line): a
 * translucent identity tint, a dashed identity border ("not created
 * yet") and a filled "Creează" pill as the strongest element. The whole
 * card is the one tap target; the pill is visual only. */
function TemplateList({ onPick }: { onPick: (t: (typeof TEMPLATES)[number]) => void }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const rows = [TEMPLATES.slice(0, 2), TEMPLATES.slice(2, 4)];
  return (
    <View style={{ gap: spacing.md }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: spacing.md }}>
          {row.map((t) => {
            const kind = t.kind as SpaceKind;
            const tint = spaceTextColor(kind, isDark) ?? t.color;
            const fill = SPACE_BUTTON_FILL[kind] ?? t.color;
            const ink = SPACE_ON_FILL[kind] ?? "#FFFFFF";
            return (
              <PressableScale
                key={t.kind}
                testID={`template-quick-${t.kind}`}
                onPress={() => onPick(t)}
                scaleTo={motion.scale.tile}
                accessibilityRole="button"
                accessibilityLabel={`Creează spațiu ${t.name}. ${t.hint}`}
                style={{
                  flex: 1,
                  minHeight: 176,
                  padding: spacing.lg,
                  borderRadius: radius.card,
                  backgroundColor: withAlpha(t.color, isDark ? 0.12 : 0.08),
                  borderWidth: 1.5,
                  borderStyle: "dashed",
                  borderColor: withAlpha(t.color, isDark ? 0.55 : 0.5),
                }}
              >
                <Ionicons name={t.icon as any} size={26} color={tint} />
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface, marginTop: spacing.md }} numberOfLines={1}>{t.name}</Text>
                <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary, marginTop: 2, marginBottom: spacing.md }} numberOfLines={3}>{t.hint}</Text>
                <View
                  style={{
                    marginTop: "auto",
                    height: 44,
                    borderRadius: radius.control,
                    backgroundColor: fill,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons name="add" size={20} color={ink} />
                  <Text style={{ fontSize: 15, fontWeight: "600", color: ink }}>Creează</Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
}
