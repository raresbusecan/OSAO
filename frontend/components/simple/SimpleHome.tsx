import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, DeviceEventEmitter } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "@/app/(tabs)/_layout";
import { motion } from "@/lib/motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailBanner";
import { VerifiedBadge, emailVerifiedState } from "@/components/auth/VerifiedBadge";
import { EditSpaceModal } from "@/components/spaces/EditSpaceModal";
import { CarProfileForm } from "@/components/spaces/car/CarProfileForm";
import { HomeProfileForm } from "@/components/spaces/home/HomeProfileForm";
import { TeaserRow } from "@/components/simple/Teaser";
import { StartPicker, type StartTemplate } from "@/components/simple/home/StartPicker";
import { UpcomingCard } from "@/components/simple/home/UpcomingCard";
import { SpacesGrid, type GridSpace } from "@/components/simple/home/SpacesGrid";
import { dueBySpace, type SpaceDue } from "@/lib/dashboard/spaceDue";
import { prefetchQuickAdd } from "@/lib/quickAddCache";
import { guardSimpleSpaceCreate } from "@/lib/simpleLimits";
import { capitalize, roNumber } from "@/lib/format";
import {
  detectSpaceType,
  profileFromSpace,
  SPACE_IDENTITY_COLORS,
  SPACE_KIND_LABEL,
  type SpaceKind,
} from "@/lib/spaces/spaceProfile";

/** Same greeting as the full Acasă (app/(tabs)/home.tsx). */
function greeting(name?: string) {
  const h = new Date().getHours();
  const t = h < 5 ? "Noapte bună" : h < 12 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara";
  return name ? `${t}, ${name.split(" ")[0]}` : t;
}

/** monthlyExpenses.sources[].spaceName is the KIND's English label. */
const SOURCE_KIND: Record<string, SpaceKind> = { Car: "car", Home: "home", Grocery: "grocery", Expenses: "expenses" };

type SpaceLite = GridSpace;

/**
 * orgOS Simplu's Acasă (mockups Main.dc.html / AcasaDate.dc.html). No
 * spaces yet: pick the first one (the existing create flows). With
 * spaces (mockup "Acasă A · Spațiile sus"): the spaces grid first -- with
 * an "Adaugă" tile per kind still missing --, then "Urmează" (next 7
 * days, checkable) and this month's spend by kind with the one Complet
 * teaser.
 */
export function SimpleHome() {
  const { colors, spacing, radius, typography } = useTheme();
  const { user } = useAuth();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<any>(null);
  const [spaces, setSpaces] = useState<SpaceLite[]>([]);
  // Per-space to-do counts -- the tile's status, same rule as the Spații grid.
  const [dueMap, setDueMap] = useState<Map<string, SpaceDue>>(new Map());
  const [loading, setLoading] = useState(true);
  // A failed load must not read as "no spaces yet" (stale tunnel URL):
  // that would invite an existing user to create duplicate spaces.
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The create flows -- same components/props as app/(tabs)/spaces.tsx.
  const [carOpen, setCarOpen] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  const [namedCreate, setNamedCreate] = useState<{ name: string; icon: string; color: string; type: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, spacesRes] = await Promise.all([api.dashboard(), api.listSpaces()]);
      setDashboard(d);
      setDueMap(dueBySpace([...(d?.overdue || []), ...(d?.today || []), ...(d?.upcoming || [])]));
      setFailed(false);
      setSpaces(
        (spacesRes.spaces || []).map((s: any) => ({
          id: String(s.id),
          name: s.name,
          icon: s.icon ?? null,
          odometer: s.odometer ?? null,
          monthUpcoming: s.month_upcoming ?? null,
          groceryLists: s.grocery_lists ?? null,
          expenseRecords: s.expense_records ?? null,
          color: s.color ?? null,
          type: s.type ?? null,
          kind: detectSpaceType(s, profileFromSpace(s)),
        })),
      );
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => load());
    return () => sub.remove();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const startCreate = (t: StartTemplate) => {
    // One space per kind in Simplu (lib/simpleLimits.ts). The grid only
    // offers missing kinds, but its list can be a step behind.
    if (!guardSimpleSpaceCreate(t.kind, spaces.map((s) => s.kind))) return;
    if (t.kind === "car") return setCarOpen(true);
    if (t.kind === "home") return setHomeOpen(true);
    setNamedCreate({ name: t.name, icon: t.icon, color: t.color, type: t.kind });
  };

  // A new space: refresh, then open it (the Simplu space screen).
  const onCreated = (created: any) => {
    load();
    prefetchQuickAdd(); // so its first "+" opens instantly too

    if (created?.id != null) router.push(`/${String(created.id)}` as any);
  };

  const now = new Date();
  const muted = colors.onSurfaceTertiary;
  const hasSpaces = spaces.length > 0;
  const initial = (user?.name ?? "?").trim().charAt(0).toUpperCase();

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13, color: muted }}>{capitalize(now.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" }))}</Text>
        <Text style={{ ...typography.title, color: colors.onSurface }}>{loading || failed || hasSpaces ? greeting(user?.name) : "Bun venit"}</Text>
      </View>
      <PressableScale
        onPress={() => router.push("/settings")}
        testID="simple-home-settings-link"
        accessibilityRole="button"
        accessibilityLabel={`Profil și setări${emailVerifiedState(user) === "unverified" ? ", email neconfirmat" : ""}`}
        scaleTo={motion.scale.control}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{initial}</Text>
        <VerifiedBadge user={user} avatarSize={44} />
      </PressableScale>
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="simple-home-screen">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={muted} />}
      >
        {header}
        <VerifyEmailBanner testID="simple-home-verify-banner" />
        {loading ? (
          <ActivityIndicator color={muted} style={{ marginTop: spacing.xl }} />
        ) : failed && !hasSpaces ? (
          <View testID="simple-home-load-error" style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg }}>
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary }}>Nu am putut încărca datele. Trage în jos ca să încerci din nou.</Text>
          </View>
        ) : !hasSpaces ? (
          <StartPicker onPick={startCreate} />
        ) : (
          <>
            <SpendCard monthly={dashboard?.monthlyExpenses} />
            <SpacesGrid
              spaces={spaces}
              dueMap={dueMap}
              toBuy={dashboard?.toBuy || {}}
              onOpen={(id) => router.push(`/${id}` as any)}
              onAdd={startCreate}
            />
            <UpcomingCard dashboard={dashboard} spaces={spaces} onChanged={load} />
          </>
        )}
      </ScrollView>

      <CarProfileForm
        visible={carOpen}
        mode="create"
        space={null}
        initialProfile={null}
        onClose={() => setCarOpen(false)}
        onSaved={(created) => { setCarOpen(false); onCreated(created); }}
      />
      <HomeProfileForm
        visible={homeOpen}
        mode="create"
        space={null}
        initialProfile={null}
        onClose={() => setHomeOpen(false)}
        onSaved={(created) => { setHomeOpen(false); onCreated(created); }}
      />
      <EditSpaceModal
        visible={!!namedCreate}
        mode="create"
        space={namedCreate}
        onClose={() => setNamedCreate(null)}
        onSaved={(created) => { setNamedCreate(null); onCreated(created); }}
      />
    </SafeAreaView>
  );
}

type MonthlySpend = {
  total: number;
  sources: { spaceName: string; amount: number }[];
  /** Casă bills marked paid this month -- outside `total` (Complet counts
   * bills as a monthly commitment), added here: in Simplu a paid bill is
   * money spent, like a shopping trip. */
  billsPaid?: number;
  /** Bills still unpaid up to the end of the month -- "de plătit", never
   * inside the spent total. */
  billsDue?: number;
};

/** "Cheltuit în {lună}", first on Acasă: everything paid this month in
 * every space (shopping finished with a price, Casă purchases / visits /
 * paid bills, car, Cheltuieli), split by KIND, then the bills still to pay.
 * Same records Complet reads -- nothing to move when switching modes. */
function SpendCard({ monthly }: { monthly?: MonthlySpend }) {
  const { colors, spacing, radius } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const now = new Date();
  const billsPaid = Number(monthly?.billsPaid ?? 0) || 0;
  const billsDue = Number(monthly?.billsDue ?? 0) || 0;
  const total = Number(monthly?.total ?? 0) + billsPaid;
  const monthName = now.toLocaleDateString("ro-RO", { month: "long" });
  const sources = [...(monthly?.sources ?? [])];
  if (billsPaid > 0) sources.push({ spaceName: "Home", amount: billsPaid });
  const byKind = new Map<string, number>();
  for (const s of sources) byKind.set(s.spaceName, (byKind.get(s.spaceName) ?? 0) + (Number(s.amount) || 0));
  const segments = [...byKind]
    .map(([name, amount]) => {
      const kind = SOURCE_KIND[name] ?? "other";
      return { key: name, label: SPACE_KIND_LABEL[kind] ?? name, amount, color: SPACE_IDENTITY_COLORS[kind] ?? muted };
    })
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return (
    <View testID="simple-home-spend" style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md }}>
      {total > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
          <Text style={{ flex: 1, fontSize: 13, color: muted }}>Cheltuit în {monthName}</Text>
          <Text style={{ fontSize: 22, fontWeight: "600", letterSpacing: -0.3, color: colors.onSurface }}>
            {roNumber(total)} <Text style={{ fontSize: 14, fontWeight: "500", letterSpacing: 0, color: muted }}>lei</Text>
          </Text>
        </View>
      ) : (
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 13, color: muted }}>Cheltuit în {monthName}</Text>
          <Text style={{ fontSize: 15, color: colors.onSurfaceSecondary, marginTop: 2 }}>Nimic cheltuit încă luna asta.</Text>
        </View>
      )}
      {total > 0 && segments.length > 0 ? (
        <>
          <View
            accessible
            accessibilityLabel={segments.map((s) => `${s.label} ${roNumber(s.amount)} lei`).join(", ")}
            style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 }}
          >
            {segments.map((s) => (
              <View key={s.key} style={{ flex: s.amount / total, backgroundColor: s.color }} />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 }}>
            {segments.map((s) => (
              <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                <Text style={{ fontSize: 13, color: colors.onSurfaceSecondary }}>{s.label} {roNumber(s.amount)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {billsDue > 0 ? (
        <Text testID="simple-home-bills-due" style={{ fontSize: 13, color: muted }}>
          + {roNumber(billsDue)} lei facturi de plătit până la final de lună
        </Text>
      ) : null}
      <TeaserRow text="Cât îți rămâne din venit până la final de lună?" testID="simple-home-teaser" />
    </View>
  );
}
