import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { MultiRingProgress } from "@/components/dashboard/RingProgress";
import { SPACE_IDENTITY_COLORS, type SpaceKind } from "@/lib/spaces/spaceProfile";

type ArchiveMonth = {
  month: string;
  label: string;
  total_spent: number;
  total_budget: number;
  total_diff: number | null;
  categories: { category: string; budget_limit: number | null; spent: number; diff: number | null }[];
};

export type BudgetOverviewPageProps = {
  limits: { category: string; monthly_limit: number; spent: number }[];
  spending: Record<string, { this_month: number; last_month: number; avg_last_3_months: number }>;
  spaceKinds: { kind: SpaceKind; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  onBack: () => void;
};

/**
 * Reached by tapping "Buget total" right under the Savings Goal card on
 * the Budget tab -- Model 3 from the "buget total" mockups: a ring
 * composed of what was actually SPENT this month (not budget shares,
 * that's a different question), each space keeping the same identity
 * color everywhere in the app, plus a ranked list below answering "ce
 * zic cheltuielile din fiecare space" directly, biggest first.
 */
export function BudgetOverviewPage({ limits, spending, spaceKinds, onBack }: BudgetOverviewPageProps) {
  const { colors, spacing, radius, typography } = useTheme();

  const [archive, setArchive] = useState<ArchiveMonth[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await api.getBudgetArchive();
        if (mounted) setArchive(r.months || []);
      } catch {
      } finally {
        if (mounted) setArchiveLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    return spaceKinds
      .map((meta) => {
        const limit = limits.find((l) => l.category === meta.label);
        // A space without its own budget limit still spent real money
        // this month -- this_month from the Budget tab's own spending
        // map covers it, so it isn't silently dropped from the ranking.
        const spent = limit ? limit.spent : spending[meta.label]?.this_month ?? 0;
        return {
          kind: meta.kind,
          label: meta.label,
          icon: meta.icon,
          spent,
          budget: limit?.monthly_limit,
          color: SPACE_IDENTITY_COLORS[meta.kind] ?? colors.onSurfaceTertiary,
        };
      })
      .sort((a, b) => b.spent - a.spent);
  }, [spaceKinds, limits, spending, colors.onSurfaceTertiary]);

  const totalSpent = rows.reduce((sum, r) => sum + r.spent, 0);
  const totalBudget = limits.reduce((sum, l) => sum + l.monthly_limit, 0);
  const overallRatio = totalBudget > 0 ? totalSpent / totalBudget : 0;

  const segments = rows
    .filter((r) => r.spent > 0)
    .map((r) => ({ value: totalSpent > 0 ? r.spent / totalSpent : 0, color: r.color }));

  return (
    <ScrollView
      testID="budget-overview-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 150 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl }}>
        <Pressable
          testID="budget-overview-back"
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 }}>Buget total</Text>
      </View>

      {rows.length === 0 ? (
        <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Niciun space cu buget sau cheltuieli încă.</Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg, marginBottom: spacing.xl }}>
            <View style={{ width: 88, height: 88 }}>
              <MultiRingProgress segments={segments} trackColor={colors.surfaceTertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: "800", color: colors.onSurface }}>
                {totalSpent.toLocaleString("en-US")} RON
              </Text>
              <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 }}>
                cheltuite luna asta, în total
              </Text>
              {totalBudget > 0 ? (
                <Text style={{ fontSize: 11, fontWeight: "700", color: overallRatio >= 1 ? colors.error : colors.success, marginTop: 3 }}>
                  {Math.round(overallRatio * 100)}% din bugetul de {totalBudget.toLocaleString("en-US")} RON
                </Text>
              ) : null}
            </View>
          </View>

          <Text style={{ ...typography.label, color: colors.onSurfaceTertiary, marginBottom: spacing.md }}>
            DUPĂ CÂT S-A CHELTUIT
          </Text>

          <View style={{ gap: spacing.md }}>
            {rows.map((row) => {
              const shareOfTotal = totalSpent > 0 ? (row.spent / totalSpent) * 100 : 0;
              const ownRatio = row.budget && row.budget > 0 ? Math.min(1, row.spent / row.budget) : null;
              return (
                <View key={row.kind} style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color }} />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: colors.onSurface }}>{row.label}</Text>
                    <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary }}>
                      {row.spent.toLocaleString("en-US")}{row.budget ? ` / ${row.budget.toLocaleString("en-US")} RON` : " RON"}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onSurface, width: 34, textAlign: "right" }}>
                      {Math.round(shareOfTotal)}%
                    </Text>
                  </View>
                  {ownRatio !== null ? (
                    <View style={{ height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, overflow: "hidden" }}>
                      <View style={{ width: `${ownRatio * 100}%`, height: "100%", backgroundColor: row.color }} />
                    </View>
                  ) : (
                    <Text style={{ fontSize: 10.5, color: colors.onSurfaceTertiary }}>fără buget setat</Text>
                  )}
                </View>
              );
            })}
          </View>

          <View style={{ padding: spacing.lg, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginTop: spacing.xl }}>
            <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, lineHeight: 16 }}>
              Procentul din dreapta arată cât din cheltuiala TOTALĂ reprezintă acel space. Bara mică de sub fiecare rând rămâne cât din bugetul PROPRIU al space-ului -- cele două nu se amestecă.
            </Text>
          </View>

          {/* ISTORIC -- one archived snapshot per completed month
              (BudgetController::archiveCompletedMonths), using the
              budget that was actually active that month rather than
              recomputing live, so changing a limit today never rewrites
              what a past month looked like. */}
          <Text style={{ ...typography.label, color: colors.onSurfaceTertiary, marginTop: spacing.xl, marginBottom: spacing.md }}>
            ISTORIC LUNAR
          </Text>

          {archiveLoading ? (
            <ActivityIndicator color={colors.onSurfaceTertiary} />
          ) : archive.length === 0 ? (
            <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.lg }}>
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
                Arhiva se completează automat la finalul fiecărei luni.
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: "hidden" }}>
              {archive.map((m, index) => {
                const isExpanded = expandedMonth === m.month;
                const diffColor = m.total_diff === null ? colors.onSurfaceTertiary : m.total_diff < 0 ? colors.error : colors.success;
                return (
                  <View key={m.month}>
                    <Pressable
                      testID={`archive-month-${m.month}`}
                      onPress={() => setExpandedMonth(isExpanded ? null : m.month)}
                      accessibilityRole="button"
                      accessibilityLabel={`${m.label}, ${m.total_spent} of ${m.total_budget} RON`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.md,
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: colors.onSurface }}>{m.label}</Text>
                      <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>
                        {m.total_spent.toLocaleString("en-US")} / {m.total_budget.toLocaleString("en-US")} RON
                      </Text>
                      {m.total_diff !== null ? (
                        <Text style={{ fontSize: 12, fontWeight: "700", color: diffColor, minWidth: 60, textAlign: "right" }}>
                          {m.total_diff >= 0 ? "+" : ""}{m.total_diff.toLocaleString("en-US")}
                        </Text>
                      ) : null}
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.onSurfaceTertiary} />
                    </Pressable>

                    {isExpanded ? (
                      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 6 }}>
                        {m.categories.map((c) => {
                          const kind = spaceKinds.find((k) => k.label === c.category)?.kind;
                          const dotColor = (kind && SPACE_IDENTITY_COLORS[kind]) || colors.onSurfaceTertiary;
                          const cDiffColor = c.diff === null ? colors.onSurfaceTertiary : c.diff < 0 ? colors.error : colors.onSurfaceTertiary;
                          return (
                            <View key={c.category} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: dotColor }} />
                              <Text style={{ flex: 1, fontSize: 12, color: colors.onSurface }}>{c.category}</Text>
                              <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary }}>
                                {c.spent.toLocaleString("en-US")}{c.budget_limit !== null ? ` / ${c.budget_limit.toLocaleString("en-US")}` : ""} RON
                              </Text>
                              {c.diff !== null ? (
                                <Text style={{ fontSize: 11.5, fontWeight: "700", color: cDiffColor, minWidth: 50, textAlign: "right" }}>
                                  {c.diff >= 0 ? "+" : ""}{c.diff.toLocaleString("en-US")}
                                </Text>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
