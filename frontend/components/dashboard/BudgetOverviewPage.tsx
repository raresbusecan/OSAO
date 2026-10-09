import React, { useEffect, useMemo, useState } from "react";
import { BudgetSplitBar, BudgetUpcomingNote, budgetUpcomingSuffix } from "@/components/dashboard/BudgetSplitBar";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { MultiRingProgress } from "@/components/dashboard/RingProgress";
import { SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { PressableScale } from "@/components/ui/PressableScale";
import { TopBar, Identity, SectionHeader, Group, EmptyState } from "@/components/ui/primitives";
import { capitalize, lei } from "@/lib/format";
import { LABEL_KIND, needsSpend } from "@/lib/budget/plan";

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
  /** Monthly recurring bills per label -- already folded into `spent` /
   * `this_month` by the API; shown apart as "de plătit". */
  recurring?: Record<string, number>;
  /** Calendar purchases still ahead this month per label -- also inside
   * `spent`; shown apart as "planificat". */
  planned?: Record<string, number>;
  /** The necessities envelope when an income plan exists: the header
   * then compares the shared needsSpend() total to it (same numbers as
   * Buget's hero and its Necesități row), instead of the sum of limits. */
  envelope?: number | null;
  onBack: () => void;
};

/** "2026-09" -> "Septembrie 2026" (the backend's own label is English). */
function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return capitalize(new Date(y, m - 1, 1).toLocaleDateString("ro-RO", { month: "long", year: "numeric" }));
}

function signedLei(n: number): string {
  return `${n >= 0 ? "+" : "−"}${lei(Math.abs(n))}`;
}

/** Archive categories that aren't spaces (Buget din venit jars); the
 * month header's totals cover only the space rows. */
const OUTSIDE_SPACES = ["GuiltFree", "Credit"];

function ArchiveCategoryLine({ c, meta, showDiff = true }: { c: ArchiveMonth["categories"][number]; meta: { name: string; color: string }; showDiff?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.color }} />
      <Text style={{ flex: 1, fontSize: 14, color: colors.onSurface }}>{meta.name}</Text>
      <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
        {lei(c.spent)}{c.budget_limit !== null ? ` din ${lei(c.budget_limit)}` : ""}
      </Text>
      {showDiff && c.diff !== null ? (
        <Text style={{ fontSize: 13, fontWeight: "600", color: c.diff < 0 ? colors.error : colors.onSurfaceTertiary, minWidth: 64, textAlign: "right" }}>
          {signedLei(c.diff)}
        </Text>
      ) : !showDiff ? (
        <View style={{ minWidth: 64 }} />
      ) : null}
    </View>
  );
}

/**
 * The Budget hero's detail page: a ring composed of what was actually
 * SPENT this month (each space in its identity color), the spaces
 * ranked by spend, and one archived snapshot per completed month.
 */
export function BudgetOverviewPage({ limits, spending, spaceKinds, recurring = {}, planned = {}, envelope = null, onBack }: BudgetOverviewPageProps) {
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
    // Labels with spend but no space of that kind (e.g. a Calendar
    // purchase lands on "Expenses" without a Cheltuieli space) still
    // count against the budget -- they get a row too.
    const extra = Object.keys(spending)
      .filter((label) => !spaceKinds.some((k) => k.label === label) && LABEL_KIND[label] && Number(spending[label]?.this_month || 0) > 0)
      .map((label) => ({ kind: LABEL_KIND[label].kind as SpaceKind, label, icon: LABEL_KIND[label].icon }));
    return [...spaceKinds, ...extra]
      .map((meta) => {
        const limit = limits.find((l) => l.category === meta.label);
        // A space without its own limit still spent real money this
        // month -- it stays in the ranking instead of silently dropping.
        const committed = limit ? limit.spent : spending[meta.label]?.this_month ?? 0;
        const rec = recurring[meta.label] || 0;
        const plan = planned[meta.label] || 0;
        return {
          kind: meta.kind,
          name: SPACE_KIND_LABEL[meta.kind] ?? meta.label,
          // Recorded spend only; unpaid bills and planned purchases apart.
          spent: Math.max(0, committed - rec - plan),
          committed,
          rec,
          plan,
          up: rec + plan,
          budget: limit?.monthly_limit,
          color: SPACE_IDENTITY_COLORS[meta.kind] ?? colors.onSurfaceTertiary,
        };
      })
      .sort((a, b) => b.spent - a.spent);
  }, [spaceKinds, limits, spending, recurring, planned, colors.onSurfaceTertiary]);

  const hasPlan = envelope != null;
  const needs = needsSpend(spending, recurring, planned);
  const totalSpent = hasPlan ? needs.recorded : rows.reduce((sum, r) => sum + r.spent, 0);
  const totalRecurring = hasPlan ? needs.recurring : rows.reduce((sum, r) => sum + r.rec, 0);
  const totalPlanned = hasPlan ? needs.planned : rows.reduce((sum, r) => sum + r.plan, 0);
  const totalBudget = hasPlan ? Number(envelope) : limits.reduce((sum, l) => sum + l.monthly_limit, 0);
  const overallRatio = totalBudget > 0 ? (hasPlan ? needs.committed : totalSpent + totalRecurring + totalPlanned) / totalBudget : 0;
  const segments = rows
    .filter((r) => r.spent > 0)
    .map((r) => ({ value: totalSpent > 0 ? r.spent / totalSpent : 0, color: r.color }));

  // Archived categories carry the English key ("Car") -- show the
  // Romanian name and the right color for it.
  const categoryMeta = (category: string) => {
    // Plan rows the archive adds outside the spaces (BudgetController's
    // ARCHIVE_GUILT_FREE / Credit) -- not part of the month's totals.
    if (category === "GuiltFree") return { name: "Fără vină", color: colors.onSurfaceTertiary };
    if (category === "Credit") return { name: "Credit (rate)", color: colors.success };
    const kind = spaceKinds.find((k) => k.label === category)?.kind
      ?? (["car", "home", "grocery", "expenses"] as SpaceKind[]).find((k) => k === category.toLowerCase());
    return {
      name: (kind && SPACE_KIND_LABEL[kind]) || category,
      color: (kind && SPACE_IDENTITY_COLORS[kind]) || colors.onSurfaceTertiary,
    };
  };

  return (
    <ScrollView
      testID="budget-overview-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="budget-overview-back" />
      <Identity title="Luna asta" subtitle="Unde s-au dus banii, pe spații" info="budget.overview" />

      {rows.length === 0 ? (
        <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card }}>
          <EmptyState icon="pie-chart-outline" message="Niciun spațiu cu buget sau cheltuieli încă." />
        </View>
      ) : (
        <>
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
              <MultiRingProgress segments={segments} size={96} trackColor={colors.surfaceTertiary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{hasPlan ? "Cheltuit din necesități" : "Cheltuit în total"}</Text>
                <Text style={{ ...typography.display, color: colors.onSurface }} numberOfLines={1} adjustsFontSizeToFit>{lei(totalSpent)}</Text>
                {totalRecurring > 0 ? (
                  <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>+ {lei(totalRecurring)} plăți recurente de plătit</Text>
                ) : null}
                {totalPlanned > 0 ? (
                  <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>+ {lei(totalPlanned)} planificat în Calendar</Text>
                ) : null}
                {totalBudget > 0 ? (
                  <Text style={{ fontSize: 13, color: overallRatio >= 1 ? colors.error : colors.success, marginTop: 2 }}>
                    {Math.round(overallRatio * 100)}% din {hasPlan ? "necesitățile de" : "bugetul de"} {lei(Math.round(totalBudget))}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Share of the month's total per space -- the same order as
                the ring's arcs. Each space's own budget lives in the rows
                below, so the two numbers never share one bar. */}
            <View style={{ gap: spacing.sm }}>
              {rows.filter((r) => r.spent > 0).map((r) => (
                <View key={r.kind} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color }} />
                  <Text style={{ flex: 1, fontSize: 14, color: colors.onSurface }}>{r.name}</Text>
                  <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{Math.round((r.spent / totalSpent) * 100)}%</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Față de bugetul fiecăruia" />
            <Group>
              {rows.map((row) => {
                // A 0 limit is still a set limit (anything spent is over it).
                const hasBudget = row.budget != null;
                return (
                  <View key={row.kind} style={{ paddingHorizontal: spacing.lg, paddingVertical: 14, gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color }} />
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{row.name}</Text>
                      <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
                        <Text style={{ fontWeight: "600", color: hasBudget && row.spent > row.budget! ? colors.error : colors.onSurface }}>{lei(row.spent)}</Text>
                        {hasBudget ? `${budgetUpcomingSuffix(row.up)} din ${lei(row.budget!)}` : ""}
                      </Text>
                    </View>
                    {hasBudget ? (
                      <>
                        <BudgetSplitBar recorded={row.spent} upcoming={row.up} limit={row.budget!} color={row.color} />
                        <BudgetUpcomingNote recorded={row.spent} upcoming={row.up} limit={row.budget!} planned={row.plan} />
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Fără buget setat</Text>
                        {row.rec > 0 ? (
                          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>+ {lei(row.rec)} facturi recurente încă neplătite</Text>
                        ) : null}
                        {row.plan > 0 ? (
                          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>+ {lei(row.plan)} cumpărături planificate în Calendar</Text>
                        ) : null}
                      </>
                    )}
                  </View>
                );
              })}
            </Group>
          </View>

          {/* One archived snapshot per completed month
              (BudgetController::archiveCompletedMonths), using the budget
              active that month -- changing a limit today never rewrites
              what a past month looked like. */}
          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Lunile trecute" />
            {archiveLoading ? (
              <ActivityIndicator color={colors.onSurfaceTertiary} />
            ) : archive.length === 0 ? (
              <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card }}>
                <EmptyState icon="archive-outline" message="La finalul fiecărei luni, bilanțul ei apare aici." />
              </View>
            ) : (
              <Group>
                {archive.map((m) => {
                  const isExpanded = expandedMonth === m.month;
                  const diffColor = m.total_diff === null ? colors.onSurfaceTertiary : m.total_diff < 0 ? colors.error : colors.success;
                  return (
                    <View key={m.month}>
                      <PressableScale
                        testID={`archive-month-${m.month}`}
                        onPress={() => setExpandedMonth(isExpanded ? null : m.month)}
                        scaleTo={1}
                        pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isExpanded }}
                        accessibilityLabel={`${monthTitle(m.month)}, ${lei(m.total_spent)} din ${lei(m.total_budget)}`}
                        style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 58, backgroundColor: colors.surfaceSecondary }}
                      >
                        <View style={{ flex: 1, paddingVertical: 10 }}>
                          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{monthTitle(m.month)}</Text>
                          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 }}>
                            {lei(m.total_spent)} din {lei(m.total_budget)}
                            {m.categories.some((c) => OUTSIDE_SPACES.includes(c.category)) ? " · pe spații" : ""}
                          </Text>
                        </View>
                        {m.total_diff !== null ? (
                          <Text style={{ fontSize: 14, fontWeight: "600", color: diffColor }}>{signedLei(m.total_diff)}</Text>
                        ) : null}
                        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.onSurfaceTertiary} />
                      </PressableScale>

                      {isExpanded ? (
                        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 8 }}>
                          {m.categories.filter((c) => !OUTSIDE_SPACES.includes(c.category)).map((c) => (
                            <ArchiveCategoryLine key={c.category} c={c} meta={categoryMeta(c.category)} />
                          ))}
                          {m.categories.some((c) => OUTSIDE_SPACES.includes(c.category)) ? (
                            <View testID={`archive-outside-${m.month}`} style={{ gap: 8, marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.surfaceTertiary }}>
                              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>În afara spațiilor · nu intră în totalul lunii</Text>
                              {m.categories.filter((c) => OUTSIDE_SPACES.includes(c.category)).map((c) => (
                                // Credit rates are fixed instalments, not overspend:
                                // no red +/- diff for them.
                                <ArchiveCategoryLine key={c.category} c={c} meta={categoryMeta(c.category)} showDiff={c.category !== "Credit"} />
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </Group>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}
