import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, DeviceEventEmitter, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { REFRESH_EVENT } from "./_layout";
import { useFocusEffect } from "expo-router";

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function firstOfMonth(y: number, m: number) { return new Date(Date.UTC(y, m, 1)); }
function daysInMonth(y: number, m: number) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }

export default function CalendarScreen() {
  const { colors, spacing, radius } = useTheme();
  const today = new Date();
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth()); // 0-11
  const [selected, setSelected] = useState<string>(ymd(today));
  const [data, setData] = useState<{ days: Record<string, any[]> }>({ days: {} });
  const [loading, setLoading] = useState(true);

  const monthStr = useMemo(() => `${y}-${String(m + 1).padStart(2, "0")}`, [y, m]);

  const load = useCallback(async () => {
    try {
      const r = await api.calendar(monthStr);
      setData({ days: r.days || {} });
    } catch {}
  }, [monthStr]);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const sub = DeviceEventEmitter.addListener(REFRESH_EVENT, () => load());
    return () => sub.remove();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changeMonth = (delta: number) => {
    let nm = m + delta, ny = y;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    setM(nm); setY(ny);
  };

  const first = firstOfMonth(y, m);
  const startWeekday = first.getUTCDay(); // 0 Sun .. 6 Sat
  const dim = daysInMonth(y, m);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(y, m, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  const selectedItems = data.days[selected] || [];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }} testID="calendar-screen">
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140, gap: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 }}>Calendar</Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm }}>
          <Pressable testID="cal-prev-month" onPress={() => changeMonth(-1)} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.onSurface }}>{monthName}</Text>
          <Pressable testID="cal-next-month" onPress={() => changeMonth(1)} hitSlop={12}>
            <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <View>
          <View style={{ flexDirection: "row" }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", paddingBottom: 6 }}>
                <Text style={{ fontSize: 11, color: colors.onSurfaceTertiary, fontWeight: "700" }}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((d, i) => {
              const key = d != null ? `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : `x-${i}`;
              const hasItems = d != null && (data.days[key]?.length || 0) > 0;
              const isSelected = d != null && key === selected;
              const isToday = d != null && key === ymd(today);
              return (
                <Pressable
                  key={key}
                  testID={d != null ? `cal-day-${key}` : undefined}
                  onPress={() => d != null && setSelected(key)}
                  disabled={d == null}
                  style={{
                    width: `${100 / 7}%`, aspectRatio: 1,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {d != null && (
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      alignItems: "center", justifyContent: "center",
                      backgroundColor: isSelected ? colors.brandPrimary : "transparent",
                      borderWidth: isToday && !isSelected ? 1 : 0,
                      borderColor: colors.onSurface,
                    }}>
                      <Text style={{
                        fontSize: 15, fontWeight: isSelected || isToday ? "700" : "500",
                        color: isSelected ? colors.onBrandPrimary : colors.onSurface,
                      }}>{d}</Text>
                      {hasItems && !isSelected && (
                        <View style={{ position: "absolute", bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.onSurface }} />
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "700", letterSpacing: 0.4 }}>
            {new Date(selected).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
          </Text>
          {loading ? (
            <ActivityIndicator color={colors.onSurfaceTertiary} />
          ) : selectedItems.length === 0 ? (
            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>Nothing scheduled.</Text>
          ) : (
            selectedItems.map((it: any) => (
              <View key={it.id} style={{
                flexDirection: "row", alignItems: "center", gap: spacing.md,
                paddingVertical: spacing.md,
                borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
              }}
                testID={`agenda-item-${it.id}`}
              >
                <Ionicons name={iconFor(it.type)} size={18} color={colors.onSurfaceTertiary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: colors.onSurface, fontWeight: "500" }}>{it.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
                    {new Date(it.due_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    {it.amount != null ? ` · ${it.currency || "EUR"} ${Number(it.amount).toFixed(2)}` : ""}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
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
