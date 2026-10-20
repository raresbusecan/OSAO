import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { TopBar, Identity, SectionHeader, Group, Row, IconWell, Chip } from "@/components/ui/primitives";
import { SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceColors, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import type { BudgetCreditItem } from "@/lib/spaces/expenses/credits";
import { useRouter } from "expo-router";
import { todoHref } from "@/lib/dashboard/spaceDue";
import { lei, roCount, roDate } from "@/lib/format";

/**
 * Buget › Credit -- the third jar while at least one credit is active:
 * the monthly rates against the jar, and the active credits. Rates over
 * the jar are a WARNING only: they never take from Necesități and never
 * reduce Economii. Credits are managed in the Cheltuieli space.
 */
export function BudgetCreditPage({
  percent,
  budget,
  rates,
  items,
  spaceKindById,
  spaceNameById = {},
  spaceColorById = {},
  onOpenExpenses,
  onBack,
}: {
  percent: number;
  budget: number;
  rates: number;
  items: BudgetCreditItem[];
  /** String(space id) -> kind, for the linked-space chip. */
  spaceKindById: Record<string, SpaceKind>;
  /** Each space's own name -- with two homes the chip says which one. */
  spaceNameById?: Record<string, string>;
  /** Each space's own colour (spaces.color) -- the chip takes THAT space's. */
  spaceColorById?: Record<string, string | null>;
  /** Opens the Cheltuieli space (null when the user has none). */
  onOpenExpenses: (() => void) | null;
  onBack: () => void;
}) {
  const { colors, spacing, radius, typography, isDark } = useTheme();
  const router = useRouter();
  const over = rates > budget;
  const scale = Math.max(budget, rates, 1);
  const expColor = SPACE_IDENTITY_COLORS.expenses ?? colors.onSurfaceTertiary;
  const expTint = spaceTextColor("expenses", isDark) ?? expColor;

  return (
    <ScrollView
      testID="budget-credit-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: 150, gap: spacing.section }}
    >
      <TopBar onBack={onBack} backTestID="budget-credit-back" />
      <Identity kicker={`Buget · ${percent}% din venit`} title="Credit" info="budget.credit" />

      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.gutter, gap: spacing.md }}>
        <View>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Rate pe lună</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ ...typography.display, color: colors.onSurface }}>{lei(Math.round(rates))}</Text>
            <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary }}>din {lei(Math.round(budget))}</Text>
          </View>
        </View>
        <View style={{ height: 6, justifyContent: "center" }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
            <View style={{ width: `${(rates / scale) * 100}%`, height: "100%", backgroundColor: over ? colors.warning : colors.success }} />
          </View>
          {over ? (
            <View
              accessibilityLabel="Partea din venit"
              style={{ position: "absolute", left: `${(budget / scale) * 100}%`, top: -3, width: 2, height: 12, marginLeft: -1, borderRadius: 1, backgroundColor: colors.onSurface }}
            />
          ) : null}
        </View>
        <Text style={{ fontSize: 13, lineHeight: 18, color: over ? colors.warning : colors.onSurfaceTertiary }}>
          {over
            ? `Ratele trec de ${percent}% cu ${lei(Math.round(rates - budget))}. Nu iau din necesități.`
            : budget - rates > 0
              ? `${lei(Math.round(budget - rates))} rămân de investit.`
              : `Ratele folosesc toți cei ${percent}%.`}
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader title="Credite active" />
        <Group inset={68}>
          {items.map((c) => {
            const kind = c.linked_space_id != null ? spaceKindById[String(c.linked_space_id)] : undefined;
            const linkColor = kind ? spaceColors({ kind, color: spaceColorById[String(c.linked_space_id)] }, isDark)?.tint : undefined;
            return (
              <Row
                key={String(c.id)}
                testID={`budget-credit-${c.id}`}
                onPress={c.space_id != null ? () => router.navigate(todoHref({ ...c, type: "expense_credit" }) as any) : undefined}
                leading={<IconWell icon="card-outline" color={expColor} tint={expTint} />}
                title={c.title}
                subtitle={
                  c.next_due
                    ? `Următoarea: ${roDate(c.next_due)} · ${c.remaining_rates === 1 ? "ultima rată" : `încă ${roCount(c.remaining_rates, "rată", "rate")}`}`
                    : "Ultima rată a trecut"
                }
                trailing={
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(c.amount)}</Text>
                    {kind && linkColor ? <Chip label={spaceNameById[String(c.linked_space_id)] || (SPACE_KIND_LABEL[kind] ?? "")} color={linkColor} /> : null}
                  </View>
                }
              />
            );
          })}
        </Group>
      </View>

      {onOpenExpenses ? (
        <Pressable
          testID="budget-credit-manage"
          onPress={onOpenExpenses}
          accessibilityRole="link"
          style={{ alignSelf: "center", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md }}
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>Gestionează în Cheltuieli</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.onSurface} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
