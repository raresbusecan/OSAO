import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, DeviceEventEmitter, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { useFocusEffect } from "expo-router";
import { MonthlyExpensesCard } from "@/components/dashboard/MonthlyExpensesCard";

type Item = any;

function formatTime(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

function TypeIcon({ type, color }: { type: string; color: string }) {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    task: "checkmark-circle-outline",
    reminder: "notifications-outline",
    note: "document-text-outline",
    expense: "cash-outline",
    event: "calendar-outline",
  };
  return <Ionicons name={map[type] || "ellipse-outline"} size={18} color={color} />;
}

function greeting(name?: string) {
  const h = new Date().getHours();
  const t = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${t}, ${name.split(" ")[0]}` : t;
}

export default function Home() {
  const { colors, spacing, radius } = useTheme();
  const { user, signOut } = useAuth();
  const [data, setData] = useState<{ today: Item[]; upcoming: Item[]; overdue: Item[]; payments: Item[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.dashboard();
      setData(d);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => load());
    return () => sub.remove();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggleDone = async (it: Item) => {
    try {
      await api.updateItem(it.id, { completed: !it.completed });
      await load();
    } catch {}
  };

  const total = data ? data.today.length + data.upcoming.length + data.overdue.length : 0;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="home-screen">
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140, gap: spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.onSurfaceTertiary} />}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, letterSpacing: 0.4, fontWeight: "600" }}>
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
            </Text>
            <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>
              {greeting(user?.name)}
            </Text>
          </View>
          <Pressable onPress={signOut} testID="home-signout-button" hitSlop={12}>
            <Ionicons name="log-out-outline" size={22} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>

        <MonthlyExpensesCard />

        {loading ? (
          <ActivityIndicator color={colors.onSurfaceTertiary} />
        ) : total === 0 && (data?.payments.length || 0) === 0 ? (
          <View style={{ paddingVertical: spacing["3xl"], alignItems: "center", gap: spacing.md }}>
            <Ionicons name="sparkles-outline" size={36} color={colors.onSurfaceTertiary} />
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.onSurface }}>Your day is clear</Text>
            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center", maxWidth: 280 }}>
              Tap the + button to capture a task, reminder, expense or note in plain English.
            </Text>
          </View>
        ) : (
          <>
            <Section title="Overdue" items={data!.overdue} colors={colors} radius={radius} spacing={spacing} accent={colors.error} onToggle={toggleDone} testID="section-overdue" />
            <Section title="Today" items={data!.today} colors={colors} radius={radius} spacing={spacing} onToggle={toggleDone} testID="section-today" />
            <Section title="Upcoming" items={data!.upcoming} colors={colors} radius={radius} spacing={spacing} onToggle={toggleDone} testID="section-upcoming" />
            <Section title="Upcoming payments" items={data!.payments} colors={colors} radius={radius} spacing={spacing} onToggle={toggleDone} testID="section-payments" />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, items, colors, radius, spacing, accent, onToggle, testID }: any) {
  if (!items || items.length === 0) return null;
  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: accent || colors.onSurface }}>{title}</Text>
        <View style={{
          paddingHorizontal: 8, paddingVertical: 2,
          backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
        }}>
          <Text style={{ fontSize: 11, color: colors.onSurfaceTertiary, fontWeight: "700" }}>{items.length}</Text>
        </View>
      </View>
      <View style={{ gap: 2 }}>
        {items.map((it: any) => (
          <ItemRow key={it.id} item={it} onToggle={onToggle} colors={colors} spacing={spacing} radius={radius} />
        ))}
      </View>
    </View>
  );
}

function ItemRow({ item, onToggle, colors, spacing, radius }: any) {
  const isTask = item.type === "task";
  return (
    <Pressable
      testID={`item-row-${item.id}`}
      onPress={() => isTask && onToggle(item)}
      style={{
        flexDirection: "row", alignItems: "center", gap: spacing.md,
        paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
      }}
    >
      {isTask ? (
        <Ionicons
          name={item.completed ? "checkmark-circle" : "ellipse-outline"}
          size={22}
          color={item.completed ? colors.success : colors.onSurfaceTertiary}
        />
      ) : (
        <TypeIcon type={item.type} color={colors.onSurfaceTertiary} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: 15, color: colors.onSurface, fontWeight: "500",
            textDecorationLine: item.completed ? "line-through" : "none",
            opacity: item.completed ? 0.5 : 1,
          }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {item.due_at ? (
            <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>{formatTime(item.due_at)}</Text>
          ) : null}
          {item.amount != null ? (
            <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>· {item.currency || "EUR"} {Number(item.amount).toFixed(2)}</Text>
          ) : null}
          {item.recurrence ? (
            <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>· ↻ {item.recurrence}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
