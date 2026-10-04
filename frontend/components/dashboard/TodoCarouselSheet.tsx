import React, { useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";
import { severityColor } from "@/lib/statusColors";
import { CUSTOM_EVENT_COLOR, SPACE_IDENTITY_COLORS, detectSpaceType } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import { Group, Row, Chip, SectionHeader, EmptyState, hexToRgba } from "@/components/ui/primitives";
import { PressableScale } from "@/components/ui/PressableScale";
import { motion } from "@/lib/motion";
import { roCount, roRelativeDays } from "@/lib/format";

type TodoItem = {
  id: number | string;
  type: string;
  title: string;
  due_at: string;
  space: { id: number | string; name: string; icon: string } | null;
};

export type TodoCarouselSheetProps = {
  visible: boolean;
  onClose: () => void;
  overdue: TodoItem[];
  today: TodoItem[];
  upcoming: TodoItem[];
  /** Called after an item is marked resolved, so the caller (Home) can
   * refetch and the widget's count stays in sync. */
  onChanged: () => void;
};

function daysFromToday(iso: string): number {
  const due = new Date(iso);
  const now = new Date();
  const a = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

// Same overdue/today/upcoming -> critical/warning/safe tiers Home's "De
// făcut" widget uses (lib/statusColors.ts), so a row reads with the
// same urgency as the card it was opened from.
function statusFor(item: TodoItem, colors: ThemeColors): { label: string; color: string } {
  const days = daysFromToday(item.due_at);
  if (days < 0) return { label: `Restant ${roCount(-days, "zi", "zile")}`, color: severityColor("critical", colors) };
  if (days === 0) return { label: "Azi", color: severityColor("warning", colors) };
  return { label: roRelativeDays(days), color: colors.onSurfaceTertiary };
}

/**
 * Opened from Home's "De făcut" -- every real to-do, grouped Restante /
 * Azi / Următoarele. Tapping a row opens it where it actually gets
 * resolved (its Space's sub-view, or Calendar for a custom event, which
 * has no space); the check button marks it done right here.
 * (Name kept from the earlier carousel version -- Home imports it.)
 */
export function TodoCarouselSheet({ visible, onClose, overdue, today, upcoming, onChanged }: TodoCarouselSheetProps) {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const [resolvingId, setResolvingId] = useState<string | number | null>(null);
  // Optimistically hidden right after "Rezolvat", before the refetch lands.
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const visibleOf = (list: TodoItem[]) => list.filter((it) => !resolved.has(String(it.id)));
  const groups = [
    { key: "overdue", title: "Restante", items: visibleOf(overdue) },
    { key: "today", title: "Azi", items: visibleOf(today) },
    { key: "upcoming", title: "Următoarele", items: visibleOf(upcoming) },
  ].filter((g) => g.items.length > 0);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const openTarget = (item: TodoItem) => {
    onClose();
    if (item.space) {
      // Deep-links straight into the sub-view where this item is
      // resolved -- see [id].tsx's itemId/itemType handling.
      router.push(`/${item.space.id}?itemId=${item.id}&itemType=${item.type}` as any);
    } else {
      const due = new Date(item.due_at);
      const dateParam = Number.isNaN(due.getTime())
        ? ""
        : `?date=${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
      router.push(`/calendar${dateParam}` as any);
    }
  };

  const markResolved = async (item: TodoItem) => {
    setResolvingId(item.id);
    try {
      await api.updateItem(item.id, { status: "completed", completed_at: new Date().toISOString() });
      setResolved((prev) => new Set(prev).add(String(item.id)));
      onChanged();
    } catch (error: any) {
      notifyAction("Nu am putut marca drept rezolvat", error?.message || "A apărut o eroare.");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setResolved(new Set());
        onClose();
      }}
      title="De făcut"
      subtitle={total > 0 ? roCount(total, "lucru", "lucruri") : undefined}
      icon="checkbox-outline"
      testID="todo-sheet"
    >
      {total === 0 ? (
        <View style={{ backgroundColor: colors.surfaceTertiary, borderRadius: radius.card }}>
          <EmptyState icon="checkmark-circle-outline" title="Totul e rezolvat" message="Nimic restant și nimic pentru azi." />
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: spacing.sm }}>
            <SectionHeader title={g.title} muted />
            <Group inset={20}>
              {g.items.map((item) => {
                const status = statusFor(item, colors);
                const color = item.space ? SPACE_IDENTITY_COLORS[detectSpaceType(item.space, null)] ?? colors.onSurfaceTertiary : CUSTOM_EVENT_COLOR;
                const resolving = resolvingId === item.id;
                return (
                  <Row
                    key={item.id}
                    testID={`todo-open-${item.id}`}
                    onPress={() => openTarget(item)}
                    leading={<View style={{ width: 4, alignSelf: "stretch", marginVertical: 10, borderRadius: 2, backgroundColor: color }} />}
                    title={item.title}
                    subtitle={item.space ? item.space.name : "Eveniment personal"}
                    trailing={
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                        <Chip label={status.label} color={status.color} filled={status.color !== colors.onSurfaceTertiary} />
                        <PressableScale
                          testID={`todo-resolve-${item.id}`}
                          onPress={() => markResolved(item)}
                          disabled={resolving}
                          scaleTo={motion.scale.control}
                          accessibilityRole="button"
                          accessibilityLabel={`Marchează rezolvat: ${item.title}`}
                          hitSlop={4}
                          style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(colors.success, 0.14) }}
                        >
                          {resolving ? <ActivityIndicator size="small" color={colors.success} /> : <Ionicons name="checkmark" size={20} color={colors.success} />}
                        </PressableScale>
                      </View>
                    }
                  />
                );
              })}
            </Group>
          </View>
        ))
      )}
    </Sheet>
  );
}
