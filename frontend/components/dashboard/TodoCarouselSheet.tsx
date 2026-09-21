import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, useWindowDimensions, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme, type ThemeColors } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";
import { severityColor } from "@/lib/statusColors";
import { CUSTOM_EVENT_COLOR } from "@/lib/spaces/spaceProfile";

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
  /** Called after a card is marked resolved or the sheet is closed, so
   * the caller (Home) can refetch and the widget's count stays in sync. */
  onChanged: () => void;
};

// Same overdue/today/upcoming -> critical/warning/safe tiers Home's "De
// făcut" widget colors its per-space counts with (see lib/statusColors.ts)
// -- this carousel opens from that exact card, so a card's own border
// should read as the same urgency, not a separate black/gray scale.
function statusFor(item: TodoItem, colors: ThemeColors): { label: string; color: string } {
  const due = new Date(item.due_at).getTime();
  const now = Date.now();
  const days = Math.round((due - now) / 86400000);
  if (days < 0) return { label: `Restant de ${Math.abs(days)} ${Math.abs(days) === 1 ? "zi" : "zile"}`, color: severityColor("critical", colors) };
  if (days === 0) return { label: "Azi", color: severityColor("warning", colors) };
  return { label: `Peste ${days} ${days === 1 ? "zi" : "zile"}`, color: severityColor("safe", colors) };
}

/**
 * Opened by tapping Home's "De făcut" widget -- one card per real
 * to-do (overdue first, then today, then upcoming), swiped through
 * like a carousel instead of a bare count. "Deschide" sends you to
 * wherever that specific item actually gets resolved: the space it
 * belongs to (car_document -> Car, home_task/home_recurring -> Home),
 * or Calendar for a custom_event, which has no space of its own.
 * "Rezolvat" marks it completed right here, no navigation needed for
 * the common case of just checking something off.
 */
export function TodoCarouselSheet({ visible, onClose, overdue, today, upcoming, onChanged }: TodoCarouselSheetProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | number | null>(null);

  const items = [...overdue, ...today, ...upcoming];
  const cardWidth = windowWidth - spacing.xl * 2;

  const openTarget = (item: TodoItem) => {
    onClose();
    if (item.space) {
      // Deep-links straight into the sub-view where this specific item
      // is actually resolved (CarDashboard's document form, Home's
      // Tasks page / recurring / maintenance category) instead of just
      // landing on the space's own dashboard -- see [id].tsx's
      // itemId/itemType handling.
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
      onChanged();
      if (items.length <= 1) {
        onClose();
      } else if (index >= items.length - 1) {
        setIndex(Math.max(0, items.length - 2));
      }
    } catch (error: any) {
      notifyAction("Nu am putut rezolva itemul", error?.message || "A apărut o eroare.");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }} />
        <View style={{ backgroundColor: colors.surface, paddingTop: spacing.lg, paddingBottom: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl }}>
            <Text style={{ ...typography.subtitle, color: colors.onSurface }}>De făcut</Text>
            <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, fontWeight: "700" }}>
              {items.length > 0 ? `${index + 1} din ${items.length}` : ""}
            </Text>
          </View>

          {items.length === 0 ? (
            <View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.xl, alignItems: "center", gap: spacing.sm }}>
              <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>Totul e rezolvat.</Text>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={(e) => {
                  const i = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
                  if (i !== index) setIndex(i);
                }}
                scrollEventThrottle={32}
                contentOffset={{ x: index * cardWidth, y: 0 }}
              >
                {items.map((item) => {
                  const status = statusFor(item, colors);
                  const isCustom = !item.space;
                  const iconColor = isCustom ? CUSTOM_EVENT_COLOR : colors.onSurface;
                  const resolving = resolvingId === item.id;
                  return (
                    <View key={item.id} style={{ width: cardWidth, paddingHorizontal: spacing.xl }}>
                      <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg, gap: spacing.md }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name={isCustom ? "sparkles-outline" : ((item.space?.icon as any) || "ellipse-outline")} size={16} color={iconColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.onSurface }} numberOfLines={2}>{item.title}</Text>
                            <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 1 }}>
                              {isCustom ? "Eveniment custom" : item.space!.name}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ fontSize: 12.5, fontWeight: "700", color: status.color }}>{status.label}</Text>

                        <View style={{ flexDirection: "row", gap: spacing.sm }}>
                          <Pressable
                            testID={`todo-resolve-${item.id}`}
                            onPress={() => markResolved(item)}
                            disabled={resolving}
                            accessibilityRole="button"
                            accessibilityLabel="Mark resolved"
                            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: radius.sm, backgroundColor: colors.success, opacity: resolving ? 0.6 : 1 }}
                          >
                            {resolving ? <ActivityIndicator color="#FFFFFF" /> : (
                              <>
                                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                                <Text style={{ fontSize: 13.5, fontWeight: "700", color: "#FFFFFF" }}>Rezolvat</Text>
                              </>
                            )}
                          </Pressable>
                          <Pressable
                            testID={`todo-open-${item.id}`}
                            onPress={() => openTarget(item)}
                            accessibilityRole="button"
                            accessibilityLabel="Open"
                            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: radius.sm, backgroundColor: colors.onSurface }}
                          >
                            <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.surface }}>Deschide</Text>
                            <Ionicons name="arrow-forward" size={15} color={colors.surface} />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
                {items.map((item, i) => (
                  <View
                    key={item.id}
                    style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.onSurface : colors.surfaceTertiary }}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
