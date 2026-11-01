import React, { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { PressableScale } from "@/components/ui/PressableScale";
import { IconWell } from "@/components/ui/primitives";
import { daysFromToday, lei, roCount, roDate, roRelativeDays } from "@/lib/format";
import { overdueKmLabel, todoHref, todoTitle } from "@/lib/dashboard/spaceDue";
import { canEditRecord } from "@/components/simple/EditRecordSheet";
import { openEditRecord } from "@/lib/simpleSheets";
import { canSwipeResolve, resolveFromSummary, type ActionItem } from "@/lib/dashboard/itemActions";
import {
  CUSTOM_EVENT_COLOR,
  detectSpaceType,
  spaceColors,
  spaceTextColor,
  type SpaceKind,
} from "@/lib/spaces/spaceProfile";

/** Most rows the card lists; the rest are one tap away in Calendar. */
const MAX_ROWS = 5;

const KIND_ICON: Partial<Record<SpaceKind, React.ComponentProps<typeof Ionicons>["name"]>> = {
  car: "car-outline",
  home: "home-outline",
  grocery: "cart-outline",
  expenses: "receipt-outline",
};

type DashItem = ActionItem & {
  reminder?: boolean;
  space?: { id: number | string; name?: string; icon?: string; type?: string | null; color?: string | null } | null;
};

type SpaceLite = { id: string; name: string; color?: string | null; type?: string | null; kind: SpaceKind };

/**
 * Simplu Acasă's "Urmează": the dashboard's overdue + today + next-7-days
 * items in one short list (credit reminders left out, like the full
 * Acasă's to-dos), then open grocery lists if there's room. The circle
 * resolves exactly like a swipe-right in the full app (resolveFromSummary);
 * an item that can't be resolved from a summary gets a chevron to its
 * own record instead.
 */
export function UpcomingCard({ dashboard, spaces, onChanged }: { dashboard: any; spaces: SpaceLite[]; onChanged: () => void }) {
  const { card, colors, spacing, radius, isDark } = useTheme();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const muted = colors.onSurfaceTertiary;

  const dated = useMemo(() => {
    if (!dashboard) return [] as (DashItem & { days: number })[];
    return [...(dashboard.overdue ?? []), ...(dashboard.today ?? []), ...(dashboard.upcoming ?? [])]
      .filter((it: DashItem) => !it.reminder)
      .map((it: DashItem) => ({ ...it, days: daysFromToday(it.due_at) }))
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  }, [dashboard]);

  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  // Grocery lists with something still to buy -- after the dated rows, only
  // while there's room under MAX_ROWS.
  const lists = useMemo(() => {
    const room = Math.max(0, MAX_ROWS - dated.length);
    return ((dashboard?.toBuyLists ?? []) as any[])
      .filter((l) => spaceById.has(String(l.space_id)))
      .slice(0, room);
  }, [dashboard, dated.length, spaceById]);

  const shown = dated.slice(0, MAX_ROWS);

  const statusOf = (r: DashItem & { days: number }): { label: string; color: string } => {
    const km = overdueKmLabel(r);
    if (km) return { label: km, color: colors.error };
    if (r.type.endsWith("_document")) {
      const date = roDate(r.due_at, { short: true });
      if (r.days < 0) return { label: `Expirat pe ${date}`, color: colors.error };
      if (r.days === 0) return { label: "Expiră azi", color: colors.warning };
      if (r.days === 1) return { label: "Expiră mâine", color: muted };
      return { label: `Expiră pe ${date}`, color: muted };
    }
    if (r.days < 0) return { label: `Restant de ${roCount(-r.days, "zi", "zile")}`, color: colors.error };
    if (r.days === 0) return { label: "Azi", color: colors.warning };
    return { label: roRelativeDays(r.days), color: muted };
  };

  const resolve = async (item: DashItem) => {
    const id = String(item.id);
    if (busyId) return;
    setBusyId(id);
    try {
      if (await resolveFromSummary(item, (h) => router.navigate(h as any))) onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const wellFor = (space: DashItem["space"]) => {
    if (!space) return { icon: "calendar-outline" as const, color: CUSTOM_EVENT_COLOR, tint: spaceTextColor("custom", isDark) ?? CUSTOM_EVENT_COLOR };
    const known = spaceById.get(String(space.id));
    const kind = known?.kind ?? detectSpaceType(space, null);
    const c = spaceColors(known ?? space, isDark);
    return { icon: KIND_ICON[kind] ?? ("folder-outline" as const), color: c?.color ?? muted, tint: c?.tint ?? colors.onSurfaceSecondary };
  };

  const total = dated.length;

  return (
    <View testID="simple-home-upcoming" style={{ ...card, borderRadius: radius.lg, paddingTop: spacing.lg, paddingBottom: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", paddingHorizontal: spacing.lg, paddingBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "600", color: colors.onSurface }}>Urmează</Text>
        {total > 0 ? <Text style={{ fontSize: 13, color: muted }}>{total} de făcut</Text> : null}
      </View>

      {shown.length === 0 && lists.length === 0 ? (
        <Text testID="simple-home-upcoming-empty" style={{ fontSize: 14, color: muted, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          Nimic în următoarele 7 zile.
        </Text>
      ) : null}

      {shown.map((it) => {
        const title = todoTitle(it);
        const st = statusOf(it);
        const amount = Number(it.amount ?? 0);
        const well = wellFor(it.space);
        const checkable = canSwipeResolve(it);
        const open = () => {
          if (it.space_id != null || it.space?.id != null) {
            router.navigate(todoHref(it, "resolve") as any);
            return;
          }
          // The row opens the record's editor (the circle resolves it).
          if (canEditRecord(it.type)) openEditRecord(it.id);
          else if (!checkable || !it.space) router.push(todoHref(it, "resolve") as any);
          else router.push(`/${String(it.space.id)}` as any);
        };
        return (
          <PressableScale
            key={`${it.type}-${it.id}`}
            testID={`simple-home-upcoming-row-${it.id}`}
            onPress={open}
            scaleTo={1}
            pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${st.label}${amount > 0 ? `, ${lei(amount)}` : ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingVertical: 10, paddingLeft: spacing.lg, paddingRight: checkable ? 6 : spacing.lg }}
          >
            <IconWell icon={well.icon} color={well.color} tint={well.tint} size={36} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{title}</Text>
              <Text style={{ fontSize: 13, color: muted }} numberOfLines={1}>
                <Text style={{ color: st.color }}>{st.label}</Text>
                {amount > 0 ? ` · ${lei(amount)}` : ""}
              </Text>
            </View>
            {checkable ? (
              <Pressable
                testID={`simple-home-upcoming-check-${it.id}`}
                onPress={() => resolve(it)}
                disabled={busyId != null}
                accessibilityRole="button"
                accessibilityLabel={`Bifează: ${title}`}
                hitSlop={4}
                style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: busyId === String(it.id) ? 0.4 : 1 }}
              >
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.borderStrong }} />
              </Pressable>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={muted} />
            )}
          </PressableScale>
        );
      })}

      {lists.map((l) => {
        const space = spaceById.get(String(l.space_id))!;
        const c = spaceColors(space, isDark);
        return (
          <PressableScale
            key={`list-${l.list_id}`}
            testID={`simple-home-upcoming-list-${l.list_id}`}
            onPress={() => router.navigate(todoHref({ id: l.list_id, type: "grocery_list", space_id: l.space_id }) as any)}
            scaleTo={1}
            pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
            accessibilityRole="button"
            accessibilityLabel={`${l.title}, ${roCount(Number(l.count) || 0, "produs", "produse")} de cumpărat`}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingVertical: 10, paddingHorizontal: spacing.lg }}
          >
            <IconWell icon="cart-outline" color={c?.color ?? muted} tint={c?.tint ?? colors.onSurfaceSecondary} size={36} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{l.title}</Text>
              <Text style={{ fontSize: 13, color: muted }} numberOfLines={1}>{roCount(Number(l.count) || 0, "produs", "produse")} de cumpărat</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={muted} />
          </PressableScale>
        );
      })}

      <Pressable
        testID="simple-home-upcoming-calendar"
        onPress={() => router.navigate("/(tabs)/calendar" as any)}
        accessibilityRole="link"
        accessibilityLabel="Vezi tot în Calendar"
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs }}
      >
        <Text style={{ fontSize: 14, fontWeight: "500", color: colors.onSurfaceSecondary }}>Vezi tot în Calendar</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceSecondary} />
      </Pressable>
    </View>
  );
}
