import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { PressableScale } from "@/components/ui/PressableScale";
import { CircleButton, Group, IconWell, SectionHeader } from "@/components/ui/primitives";
import { JAR_ORDER, jarAmounts, jarFill, jarLabel, monthsToTarget, nextMonthName, type BudgetPlan, type SplitKey } from "@/lib/budget/plan";
import { lei, roCount, roNumber } from "@/lib/format";
import { useTourTarget } from "@/components/ui/tourTargets";

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Buget's "Împărțirea venitului" card: the income (pencil -> IncomeSheet),
 * a 10px 5-segment bar (the Necesități segment made of the spaces'
 * colors, by their share of the envelope), then one row per jar:
 * Necesități -> overview, Bani fără vină -> GuiltFreePage, Credit /
 * Investiții (3 states) -> BudgetCreditPage, Termen scurt (= the Economii
 * goal, auto-added at month start) -> goal sheet, Termen lung (target).
 */
export function IncomeSplitCard({
  plan,
  guiltFree,
  credit,
  savingsGoal,
  needsSegments,
  onEditIncome,
  onEditSplit,
  onOpenNeeds,
  onOpenGuiltFree,
  onOpenCredit,
  onOpenGoal,
}: {
  plan: BudgetPlan;
  guiltFree: { spent: number; planned: number };
  credit: { rates: number; count: number };
  savingsGoal: { target_amount: number; current_amount: number } | null;
  /** Space colors with their share of the needs segment (sum <= 1). */
  needsSegments: { color: string; share: number }[];
  onEditIncome: () => void;
  onEditSplit: () => void;
  onOpenNeeds: () => void;
  onOpenGuiltFree: () => void;
  onOpenCredit: () => void;
  onOpenGoal: () => void;
}) {
  const { colors, spacing, isDark } = useTheme();
  const { split } = plan;
  const amounts = jarAmounts(plan.monthly_income, split);
  const hasCredit = credit.count > 0;
  const fill = (k: SplitKey) => jarFill(k, colors, isDark);
  // Buget tour step 3 (lib/tours.ts "jars"): the income + 5-part bar.
  const splitTarget = useTourTarget("budget.split");

  const pct = (k: SplitKey) => <Text style={{ fontWeight: "400", color: colors.onSurfaceTertiary }}>{` · ${split[k]}%`}</Text>;

  const rowStyle = { paddingHorizontal: spacing.lg, paddingVertical: 14, gap: spacing.sm, backgroundColor: colors.surfaceSecondary };
  const head = (icon: IconName, iconColor: string, k: SplitKey, right: React.ReactNode, sub?: string, chevron = true, iconTint?: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <IconWell icon={icon} color={iconColor} tint={iconTint} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>
          {jarLabel(k, hasCredit)}
          {pct(k)}
        </Text>
        {sub ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceTertiary} /> : null}
    </View>
  );
  const ratio = (num: number, den: number) => (den > 0 ? Math.max(0, Math.min(1, num / den)) : 0);
  const thinBar = (r: number, color: string) => (
    <View style={{ marginLeft: 46, height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
      <View style={{ width: `${r * 100}%`, height: "100%", backgroundColor: color }} />
    </View>
  );
  const note = (text: string, color = colors.onSurfaceTertiary) => (
    <Text style={{ marginLeft: 46, fontSize: 13, lineHeight: 18, color }}>{text}</Text>
  );

  // --- Fără vină
  const gfUsed = guiltFree.spent + guiltFree.planned;
  const gfOver = gfUsed > amounts.guilt_free;

  // --- Credit
  const creditOver = hasCredit && credit.rates > amounts.third;

  // --- Termen scurt (Economii)
  const goalTarget = savingsGoal?.target_amount ?? 0;
  const goalCurrent = savingsGoal?.current_amount ?? 0;
  const monthsLeft = goalTarget > 0 ? monthsToTarget(goalTarget - goalCurrent, amounts.short_term) : null;

  return (
    <View style={{ gap: spacing.sm }} testID="income-split-card">
      <SectionHeader title="Împărțirea venitului" info="budget.split" action={{ label: "Procente", onPress: onEditSplit, testID: "split-open", tone: colors.onSurface }} />
      <Group inset={62}>
        {/* Income + the 5-segment bar */}
        <View {...splitTarget} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 18, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Venit net lunar</Text>
              <Text testID="income-amount" style={{ fontSize: 24, fontWeight: "600", letterSpacing: -0.4, color: colors.onSurface }}>{lei(plan.monthly_income)}</Text>
            </View>
            <CircleButton testID="income-edit" icon="pencil" label="Modifică venitul" onPress={onEditIncome} />
          </View>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={JAR_ORDER.map((k) => `${jarLabel(k, hasCredit)} ${split[k]}%`).join(", ")}
            style={{ flexDirection: "row", gap: 2, height: 10 }}
          >
            {JAR_ORDER.filter((k) => split[k] > 0).map((k) =>
              k === "needs" && needsSegments.length > 0 ? (
                <View key={k} style={{ flex: split[k], flexDirection: "row", borderRadius: 5, overflow: "hidden", backgroundColor: colors.surfaceTertiary }}>
                  {needsSegments.map((s, i) => (
                    <View key={i} style={{ flex: s.share, backgroundColor: s.color }} />
                  ))}
                  {/* The unallocated rest of the envelope stays the track. */}
                  {needsSegments.reduce((a, s) => a + s.share, 0) < 1 ? (
                    <View style={{ flex: Math.max(0, 1 - needsSegments.reduce((a, s) => a + s.share, 0)) }} />
                  ) : null}
                </View>
              ) : (
                <View key={k} style={{ flex: split[k], borderRadius: 5, backgroundColor: k === "needs" ? colors.onSurface : fill(k), opacity: k === "needs" ? 0.85 : 1 }} />
              ),
            )}
          </View>
        </View>

        {/* Necesități -- just the envelope since the 2026-11 "Ritmul lunii"
            card above shows how it's being spent (no duplicate bar). */}
        <PressableScale testID="jar-needs" onPress={onOpenNeeds} scaleTo={1} pressedStyle={{ backgroundColor: colors.surfaceTertiary }} accessibilityRole="button" accessibilityLabel={`${jarLabel("needs")}, ${split.needs}%: ${lei(Math.round(amounts.needs))}. Vezi luna`} style={rowStyle}>
          {head("layers-outline", colors.onSurface, "needs", <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Math.round(amounts.needs))}</Text>)}
        </PressableScale>

        {/* Bani fără vină */}
        <PressableScale testID="jar-guilt-free" onPress={onOpenGuiltFree} scaleTo={1} pressedStyle={{ backgroundColor: colors.surfaceTertiary }} accessibilityRole="button" accessibilityLabel={`Bani fără vină: ${lei(gfUsed)} din ${lei(amounts.guilt_free)}`} style={rowStyle}>
          {head(
            "heart-outline",
            colors.onSurfaceTertiary,
            "guilt_free",
            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
              <Text style={{ fontWeight: "600", color: gfOver ? colors.error : colors.onSurface }}>{roNumber(Math.round(gfUsed))}</Text>
              {` / ${lei(Math.round(amounts.guilt_free))}`}
            </Text>,
          )}
          {thinBar(ratio(gfUsed, amounts.guilt_free), gfOver ? colors.error : fill("guilt_free"))}
          {gfOver ? note(`Ai trecut cu ${lei(Math.round(gfUsed - amounts.guilt_free))} peste`, colors.error) : null}
        </PressableScale>

        {/* Credit / Investiții -- 3 states */}
        {hasCredit ? (
          <PressableScale testID="jar-credit" onPress={onOpenCredit} scaleTo={1} pressedStyle={{ backgroundColor: colors.surfaceTertiary }} accessibilityRole="button" accessibilityLabel={`Credit: rate de ${lei(credit.rates)} din ${lei(amounts.third)}`} style={rowStyle}>
            {head(
              "card-outline",
              colors.success,
              "third",
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
                <Text style={{ fontWeight: "600", color: creditOver ? colors.warning : colors.onSurface }}>{roNumber(Math.round(credit.rates))}</Text>
                {` / ${lei(Math.round(amounts.third))}`}
              </Text>,
            )}
            {creditOver ? (
              <View style={{ marginLeft: 46, height: 6, justifyContent: "center" }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.warning }} />
                <View style={{ position: "absolute", left: `${(amounts.third / credit.rates) * 100}%`, top: -3, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: colors.onSurface }} />
              </View>
            ) : (
              thinBar(ratio(credit.rates, amounts.third), colors.success)
            )}
            {creditOver
              ? note(`Ratele trec de ${split.third}% cu ${lei(Math.round(credit.rates - amounts.third))}`, colors.warning)
              : amounts.third - credit.rates > 0
                ? note(`${lei(Math.round(amounts.third - credit.rates))} rămân de investit`)
                : null}
          </PressableScale>
        ) : (
          <View testID="jar-invest" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60, backgroundColor: colors.surfaceSecondary }}>
            <IconWell icon="trending-up-outline" color={colors.success} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>
                Investiții
                {pct("third")}
              </Text>
              <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>De pus deoparte lunar</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Math.round(amounts.third))}</Text>
          </View>
        )}

        {/* Termen scurt = Economii */}
        <PressableScale testID="jar-short-term" onPress={onOpenGoal} scaleTo={1} pressedStyle={{ backgroundColor: colors.surfaceTertiary }} accessibilityRole="button" accessibilityLabel="Obiective pe termen scurt, editează obiectivul de economii" style={{ ...rowStyle, paddingTop: spacing.md }}>
          {head(
            "flag-outline",
            colors.success,
            "short_term",
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Math.round(amounts.short_term))}</Text>,
            goalTarget > 0 ? `Economii: ${roNumber(Math.round(goalCurrent))} din ${lei(goalTarget)}` : `Economii: ${lei(Math.round(goalCurrent))}`,
          )}
          {goalTarget > 0 ? thinBar(ratio(goalCurrent, goalTarget), colors.success) : null}
          {note(
            `Se adaugă singuri la Economii pe 1 ${nextMonthName()}.` +
              (monthsLeft !== null ? ` Ținta, în aproximativ ${roCount(monthsLeft, "lună", "luni")}.` : goalTarget <= 0 ? " Pune-ți o țintă." : ""),
            goalCurrent < 0 ? colors.error : colors.onSurfaceTertiary,
          )}
        </PressableScale>

        {/* Termen lung -- a target only */}
        <View testID="jar-long-term" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60, backgroundColor: colors.surfaceSecondary }}>
          <IconWell icon="leaf-outline" color={colors.success} size={34} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>
              {jarLabel("long_term")}
              {pct("long_term")}
            </Text>
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>De pus deoparte lunar</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(Math.round(amounts.long_term))}</Text>
        </View>
      </Group>
    </View>
  );
}
