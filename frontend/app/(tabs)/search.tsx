import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { useRouter } from "expo-router";

export default function SearchScreen() {
  const { colors, spacing, radius } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);

  useEffect(() => {
    if (!q.trim()) { setItems([]); setSpaces([]); return; }
    const h = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.search(q.trim());
        setItems(r.items || []); setSpaces(r.spaces || []);
      } catch {} finally { setBusy(false); }
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="search-screen">
      <View style={{ padding: spacing.xl, gap: spacing.md }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>Search</Text>
        <View style={{
          flexDirection: "row", alignItems: "center", gap: spacing.sm,
          backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
        }}>
          <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            testID="search-input"
            value={q} onChangeText={setQ}
            placeholder="Tasks, notes, expenses, spaces…"
            placeholderTextColor={colors.onSurfaceTertiary}
            autoFocus={false}
            style={{ flex: 1, color: colors.onSurface, paddingVertical: 14, fontSize: 16 }}
          />
          {busy && <ActivityIndicator size="small" color={colors.onSurfaceTertiary} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 140, gap: spacing.lg }}>
        {!q.trim() && (
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
            Type to search across everything you&apos;ve captured.
          </Text>
        )}
        {q.trim() && !busy && items.length === 0 && spaces.length === 0 && (
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }} testID="search-empty">No results.</Text>
        )}

        {spaces.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "700", letterSpacing: 0.4 }}>SPACES</Text>
            {spaces.map((s: any) => (
              <Pressable
                key={s.id}
                testID={`search-space-${s.id}`}
                onPress={() => router.push(`/space/${s.id}` as any)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: spacing.md,
                  paddingVertical: spacing.md,
                  borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
                }}
              >
                <Ionicons name={(s.icon || "folder-outline") as any} size={18} color={colors.onSurfaceTertiary} />
                <Text style={{ fontSize: 15, color: colors.onSurface, fontWeight: "500" }}>{s.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {items.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "700", letterSpacing: 0.4 }}>ITEMS</Text>
            {items.map((it: any) => (
              <View
                key={it.id}
                testID={`search-item-${it.id}`}
                style={{
                  flexDirection: "row", alignItems: "center", gap: spacing.md,
                  paddingVertical: spacing.md,
                  borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
                }}
              >
                <Ionicons name={iconFor(it.type)} size={18} color={colors.onSurfaceTertiary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: colors.onSurface, fontWeight: "500" }}>{it.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
                    {it.type}
                    {it.due_at ? ` · ${new Date(it.due_at).toLocaleDateString()}` : ""}
                    {it.amount != null ? ` · ${it.currency || "EUR"} ${Number(it.amount).toFixed(2)}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function iconFor(type: string): any {
  return ({
    task: "checkmark-circle-outline",
    reminder: "notifications-outline",
    note: "document-text-outline",
    expense: "cash-outline",
    event: "calendar-outline",
  } as any)[type] || "ellipse-outline";
}
