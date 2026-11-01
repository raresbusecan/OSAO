import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, DeviceEventEmitter } from "react-native";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { TopBar, Identity, SectionHeader, Group, Row, IconWell, EmptyState } from "@/components/ui/primitives";
import { SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceTextColor } from "@/lib/spaces/spaceProfile";
import { LABEL_KIND } from "@/lib/budget/plan";
import { capitalize, lei, roDate, roNumber } from "@/lib/format";
import { todoHref, todoTitle } from "@/lib/dashboard/spaceDue";
import { useFocusEffect, useRouter } from "expo-router";
import { REFRESH_EVENT } from "@/lib/refresh";

type GuiltFreeData = Awaited<ReturnType<typeof api.getGuiltFree>>;

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return capitalize(new Date(y, m - 1, 1).toLocaleDateString("ro-RO", { month: "long", year: "numeric" }));
}

function signedLei(n: number): string {
  return `${n >= 0 ? "+" : "−"}${lei(Math.abs(Math.round(n)))}`;
}

/**
 * Buget › Bani fără vină -- this month's 5% jar against what was flagged
 * "fără vină" (from any space's edit form), the flagged records, and the
 * past 3 months. GET /budget/guilt-free.
 */
export function GuiltFreePage({ percent, onBack }: { percent: number; onBack: () => void }) {
  const router = useRouter();
  const { card, colors, spacing, radius, typography, isDark } = useTheme();
  const [data, setData] = useState<GuiltFreeData | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    let request = 0;
    const load = () => {
      const current = ++request;
      return api
      .getGuiltFree()
      .then((r) => mounted && current === request && setData(r))
      .catch(() => {})
      .finally(() => mounted && current === request && setLoading(false));
    };
    void load();
    const subscription = DeviceEventEmitter.addListener(REFRESH_EVENT, load);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []));

  const months = data?.months ?? [];
  const current = months[months.length - 1];
  const past = months.slice(0, -1).reverse();
  const budget = current?.budget ?? null;
  const spent = current?.spent ?? 0;
  const planned = current?.planned ?? 0;
  const left = budget !== null ? budget - spent - planned : null;
  const ratio = budget && budget > 0 ? Math.min(1, (spent + planned) / budget) : 0;
  const over = budget !== null && spent + planned > budget;

  return (
    <ScrollView
      testID="guilt-free-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="guilt-free-back" />
      <Identity kicker={`Buget · ${percent}% din venit`} title="Bani fără vină" info="budget.guiltFree" />

      {loading ? (
        <ActivityIndicator color={colors.onSurfaceTertiary} />
      ) : (
        <>
          <View style={{ ...card, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}>
            <View>
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Luna asta</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <Text style={{ ...typography.display, color: colors.onSurface }}>{lei(Math.round(spent))}</Text>
                {budget !== null ? <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>din {lei(Math.round(budget))}</Text> : null}
              </View>
              {planned > 0 ? (
                <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>+ {lei(Math.round(planned))} planificat în Calendar</Text>
              ) : null}
            </View>
            {budget !== null ? (
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
                <View style={{ width: `${ratio * 100}%`, height: "100%", backgroundColor: over ? colors.error : colors.onSurfaceTertiary }} />
              </View>
            ) : null}
            {left !== null ? (
              <Text style={{ fontSize: 13, color: left >= 0 ? colors.success : colors.error }}>
                {left >= 0 ? `Mai ai ${lei(Math.round(left))}. Cheltuiește-i liniștit.` : `Ai trecut cu ${lei(Math.round(-left))} peste.`}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Marcate luna asta" />
            {(data?.items ?? []).length === 0 ? (
              <View style={{ ...card, borderRadius: radius.card }}>
                <EmptyState icon="heart-outline" message="Nimic marcat încă. Pornește „Bani fără vină” când editezi o cheltuială." />
              </View>
            ) : (
              <Group inset={68}>
                {(data?.items ?? []).map((it) => {
                  const meta = LABEL_KIND[it.label];
                  const color = (meta && SPACE_IDENTITY_COLORS[meta.kind]) || colors.onSurfaceTertiary;
                  const tint = (meta && spaceTextColor(meta.kind, isDark)) || color;
                  const spaceName = (meta && SPACE_KIND_LABEL[meta.kind]) || it.label;
                  const when = it.recurring ? "Lunar" : it.due_at ? `${it.planned ? "Planificat pe " : ""}${roDate(it.due_at)}` : null;
                  return (
                    <Row
                      key={String(it.id)}
                      testID={`guilt-free-item-${it.id}`}
                      onPress={() => router.navigate(todoHref(it) as any)}
                      leading={<IconWell icon={it.type === "custom_event" ? "calendar-outline" : meta?.icon ?? "receipt-outline"} color={color} tint={tint} />}
                      title={todoTitle(it).replace(/^Cumpărături -- /, "")}
                      subtitle={[when, spaceName].filter(Boolean).join(" · ")}
                      trailing={
                        <Text style={{ fontSize: 15, fontWeight: it.planned ? "400" : "600", color: it.planned ? colors.onSurfaceTertiary : colors.onSurface }}>
                          {lei(Number(it.amount) || 0)}
                        </Text>
                      }
                    />
                  );
                })}
              </Group>
            )}
          </View>

          {past.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <SectionHeader title="Lunile trecute" />
              <Group>
                {past.map((m) => {
                  const diff = m.budget !== null ? m.budget - m.spent : null;
                  return (
                    <View key={m.month} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 58 }}>
                      <View style={{ flex: 1, paddingVertical: 10 }}>
                        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{monthTitle(m.month)}</Text>
                        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 }}>
                          {m.budget !== null ? `${roNumber(Math.round(m.spent))} din ${lei(Math.round(m.budget))}` : lei(Math.round(m.spent))}
                        </Text>
                      </View>
                      {diff !== null ? (
                        <Text style={{ fontSize: 14, fontWeight: "600", color: diff < 0 ? colors.error : colors.success }}>{signedLei(diff)}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </Group>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
