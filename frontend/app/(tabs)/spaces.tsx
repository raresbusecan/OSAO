import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, ActivityIndicator, DeviceEventEmitter, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { EditSpaceModal } from "@/components/spaces/EditSpaceModal";
import { CarProfileForm } from "@/components/spaces/car/CarProfileForm";
import { HomeProfileForm } from "@/components/spaces/home/HomeProfileForm";
import { PressableScale } from "@/components/ui/PressableScale";
import { Sheet } from "@/components/ui/Sheet";
import { PageTitle, CircleButton, Group, Row, IconWell, Button, EmptyState } from "@/components/ui/primitives";
import { motion } from "@/lib/motion";
import {
  profileFromSpace,
  detectSpaceType,
  SPACE_IDENTITY_COLORS,
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
  { name: "Mașină", icon: "car-outline", color: SPACE_IDENTITY_COLORS.car!, kind: "car", hint: "Alimentări, service, documente" },
  { name: "Casă", icon: "home-outline", color: SPACE_IDENTITY_COLORS.home!, kind: "home", hint: "Task-uri, facturi, provizii" },
  { name: "Cumpărături", icon: "cart-outline", color: SPACE_IDENTITY_COLORS.grocery!, kind: "grocery", hint: "Liste, rețete, împărțite" },
  { name: "Cheltuieli", icon: "receipt-outline", color: SPACE_IDENTITY_COLORS.expenses!, kind: "expenses", hint: "Orice cumperi, pe luni" },
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
  // A fixed pixel width, not "48%" -- DraggableFlatList's ScaleDecorator
  // wraps every cell (and the ListHeaderComponent sits in that same grid
  // row slot) in an Animated.View with no width/flex styling of its own,
  // so a percentage width on the card inside it has no correctly-sized
  // ancestor to resolve against and collapses to something far smaller
  // than intended -- confirmed on a real device (severely truncated card
  // titles). Two cards per row, minus the page's own side padding
  // (spacing.gutter each side) and the gap between them (spacing.md).
  const cardWidth = (Dimensions.get("window").width - spacing.gutter * 2 - spacing.md) / 2;
  const [spaces, setSpaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, SpaceProfile | null>>({});
  // Per-space to-do counts (from the same dashboard endpoint Home uses)
  // -- the tile's one status line.
  const [todoCounts, setTodoCounts] = useState<Record<string, number>>({});
  // Long-press opens this space's action sheet (edit / reorder / delete);
  // "Reordonează" switches the grid into drag mode until "Gata".
  const [actionSpace, setActionSpace] = useState<any | null>(null);
  const [reordering, setReordering] = useState(false);

  type CarFormState = { visible: boolean; mode: "create" | "edit"; space: any | null; profile: CarProfile | null };
  type HomeFormState = { visible: boolean; mode: "create" | "edit"; space: any | null; profile: HomeProfile | null };

  const [carForm, setCarForm] = useState<CarFormState>({ visible: false, mode: "create", space: null, profile: null });
  const [homeForm, setHomeForm] = useState<HomeFormState>({ visible: false, mode: "create", space: null, profile: null });

  const load = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([api.listSpaces(), api.dashboard().catch(() => null)]);
      setSpaces(r.spaces);
      if (d) {
        const counts: Record<string, number> = {};
        [...(d.overdue || []), ...(d.today || []), ...(d.upcoming || [])].forEach((it: any) => {
          if (it.space) counts[String(it.space.id)] = (counts[String(it.space.id)] ?? 0) + 1;
        });
        setTodoCounts(counts);
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

  // Long-press-to-drag (see renderSpaceCard's onLongPress={drag}) reorders
  // the grid immediately, on-screen -- DraggableFlatList already gives us
  // the final array in the callback, so this is applied optimistically
  // (setSpaces first) and only rolled back if the server call fails, same
  // pattern every other save-then-revert flow in this app uses.
  const handleReorderSpaces = async (newOrder: any[]) => {
    const previous = spaces;
    setSpaces(newOrder);
    try {
      await api.reorderSpaces(newOrder.map((s) => s.id));
    } catch (error: any) {
      setSpaces(previous);
      notifyAction("Nu am putut salva ordinea", error?.message || "A apărut o eroare.");
    }
  };

  const renderSpaceCard = ({ item: s, drag, isActive }: RenderItemParams<any>) => {
    // Status line under the name: what needs doing here, else the
    // profile detail (Model for Car, County for Home), else the kind.
    const profile = profiles[s.id] ?? null;
    const kind = detectSpaceType(s, profile) as SpaceKind;
    const fill = SPACE_IDENTITY_COLORS[kind] ?? colors.onSurfaceTertiary;
    const tint = spaceTextColor(kind, isDark) ?? colors.onSurface;
    const todos = todoCounts[String(s.id)] ?? 0;
    const detail =
      kind === "car"
        ? (profile as CarProfile | null)?.model
        : kind === "home"
          ? (profile as HomeProfile | null)?.city || (profile as HomeProfile | null)?.county
          : undefined;
    const status = todos > 0 ? `${todos} de făcut` : detail || "La zi";

    return (
      <ScaleDecorator activeScale={1.04}>
        <PressableScale
          key={s.id}
          testID={`space-card-${s.id}`}
          onPress={() => (reordering ? undefined : router.push(`/${s.id}` as any))}
          onLongPress={reordering ? drag : () => setActionSpace(s)}
          delayLongPress={reordering ? 120 : 400}
          disabled={isActive}
          accessibilityRole="button"
          accessibilityLabel={`${s.name}, ${status}`}
          accessibilityHint={reordering ? "Ține apăsat și trage ca să muți" : "Ține apăsat pentru opțiuni"}
          style={{
            width: cardWidth,
            minHeight: 150,
            backgroundColor: colors.surfaceSecondary,
            borderRadius: radius.lg,
            padding: spacing.lg,
            gap: spacing.md,
            borderWidth: reordering ? 1.5 : 0,
            borderStyle: "dashed",
            borderColor: colors.borderStrong,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <IconWell icon={(s.icon || "folder-outline") as any} color={fill} tint={tint} size={44} />
            {reordering ? <Ionicons name="reorder-two" size={20} color={colors.onSurfaceTertiary} /> : null}
          </View>
          <View style={{ marginTop: "auto", gap: 2 }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{s.name}</Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{SPACE_KIND_LABEL[kind] ?? "Spațiu"}</Text>
            <Text style={{ fontSize: 13, color: todos > 0 ? tint : colors.onSurfaceTertiary, marginTop: 4 }} numberOfLines={1}>{status}</Text>
          </View>
        </PressableScale>
      </ScaleDecorator>
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="spaces-screen">
      <View style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.md }}>
        <PageTitle
          right={
            reordering ? (
              <Button compact label="Gata" onPress={() => setReordering(false)} testID="spaces-reorder-done" />
            ) : (
              <CircleButton testID="space-add-tile" icon="add" label="Spațiu nou" tone={colors.onSurface} onPress={() => setTemplatePickerVisible(true)} />
            )
          }
        >
          {reordering ? "Mută spațiile" : "Spații"}
        </PageTitle>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.onSurfaceTertiary} style={{ marginTop: spacing.xl }} />
      ) : spaces.length === 0 ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 140, gap: spacing.lg }}>
          <EmptyState
            icon="grid-outline"
            title="Creează primul tău spațiu"
            message="Un spațiu e o parte din viața ta pe care vrei s-o ții în ordine: mașina, casa, cumpărăturile sau cheltuielile."
          />
          <TemplateList onPick={createFromTemplate} />
        </ScrollView>
      ) : (
        <DraggableFlatList
          testID="space-card-list"
          data={spaces}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          onDragEnd={({ data }) => handleReorderSpaces(data)}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingBottom: 140, gap: spacing.md }}
          renderItem={renderSpaceCard}
          ListFooterComponent={
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: spacing.md }}>
              {reordering ? "Ține apăsat un spațiu și trage-l unde vrei." : "Ține apăsat un spațiu ca să-l muți, editezi sau ștergi."}
            </Text>
          }
        />
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
        testID="template-picker"
      >
        <TemplateList onPick={createFromTemplate} />
      </Sheet>

      {/* Long-press actions for one space. */}
      <Sheet
        visible={!!actionSpace}
        onClose={() => setActionSpace(null)}
        title={actionSpace?.name}
        subtitle={actionSpace ? SPACE_KIND_LABEL[detectSpaceType(actionSpace, profiles[actionSpace.id] ?? null) as SpaceKind] : undefined}
      >
        <Group inset={62}>
          <Row
            testID={actionSpace ? `space-card-edit-${actionSpace.id}` : undefined}
            leading={<IconWell icon="create-outline" color={colors.onSurfaceTertiary} tint={colors.onSurfaceSecondary} size={34} />}
            title="Editează"
            onPress={() => {
              const target = actionSpace;
              setActionSpace(null);
              if (target) openEditForSpace(target);
            }}
          />
          <Row
            leading={<IconWell icon="reorder-three-outline" color={colors.onSurfaceTertiary} tint={colors.onSurfaceSecondary} size={34} />}
            title="Mută spațiile"
            subtitle="Schimbă ordinea în grilă"
            onPress={() => {
              setActionSpace(null);
              setReordering(true);
            }}
          />
          <Row
            testID={actionSpace ? `space-card-delete-${actionSpace.id}` : undefined}
            leading={<IconWell icon="trash-outline" color={colors.error} size={34} />}
            title="Șterge spațiul"
            onPress={() => {
              const target = actionSpace;
              setActionSpace(null);
              if (target) confirmDeleteSpace(target);
            }}
            trailing={deletingId === actionSpace?.id ? <ActivityIndicator size="small" color={colors.onSurfaceTertiary} /> : null}
          />
        </Group>
      </Sheet>
    </SafeAreaView>
  );
}

/** The 4 space types as large rows -- used by the "+" sheet and the
 * empty state. */
function TemplateList({ onPick }: { onPick: (t: (typeof TEMPLATES)[number]) => void }) {
  const { colors, spacing, isDark } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {TEMPLATES.map((t) => (
        <PressableScale
          key={t.kind}
          testID={`template-quick-${t.kind}`}
          onPress={() => onPick(t)}
          scaleTo={motion.scale.card}
          accessibilityRole="button"
          accessibilityLabel={t.name}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md + 2, borderRadius: 16, backgroundColor: colors.surfaceTertiary }}
        >
          <IconWell icon={t.icon as any} color={t.color} tint={spaceTextColor(t.kind as SpaceKind, isDark)} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>{t.name}</Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{t.hint}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
        </PressableScale>
      ))}
    </View>
  );
}
