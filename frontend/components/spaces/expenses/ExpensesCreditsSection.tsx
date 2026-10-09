import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { lei } from "@/lib/format";
import { useBudgetPlan } from "@/lib/budget/plan";
import {
  SPACE_IDENTITY_COLORS,
  SPACE_KIND_LABEL,
  detectSpaceType,
  profileFromSpace,
  spaceTextColor,
} from "@/lib/spaces/spaceProfile";
import { creditEndAsDate, isCreditActive, type CreditEntry } from "@/lib/spaces/expenses/credits";
import { Chip, Group, IconWell, SectionHeader } from "@/components/ui/primitives";
import { TitleChipRow } from "./TitleChipRow";
import { CreditSheet, type LinkableSpace } from "./CreditSheet";

export type ExpensesCreditsSectionProps = {
  /** This Cheltuieli space's id -- new credits are created in it. */
  spaceId: string | number;
  /** Every credit of the space, active and ended (expensesItems.loadCreditItems). */
  credits: CreditEntry[];
  /** Reload `credits` after a create/update/delete. */
  onChanged: () => void;
};

/** "până în martie 2029" */
function untilLabel(endDate: string): string {
  const d = creditEndAsDate(endDate);
  if (!d) return "";
  return d.toLocaleDateString("ro-RO", { month: "long", year: "numeric" });
}

/**
 * "Credite" -- bank loans / leasing in the Cheltuieli space. Listed apart
 * from the expenses and never summed with them: their monthly rates go
 * against Buget's 10% "Credit" jar, not any space's spend.
 */
export function ExpensesCreditsSection({ spaceId, credits, onChanged }: ExpensesCreditsSectionProps) {
  const { colors, spacing, isDark } = useTheme();
  const summary = useBudgetPlan();
  const tint = spaceTextColor("expenses", isDark) ?? SPACE_IDENTITY_COLORS.expenses!;
  const [editing, setEditing] = useState<CreditEntry | "new" | null>(null);
  const [endedOpen, setEndedOpen] = useState(false);
  const [linkable, setLinkable] = useState<LinkableSpace[]>([]);

  // The car/home spaces a credit can be shown in (and labelled with).
  useEffect(() => {
    let alive = true;
    api
      .listSpaces()
      .then((r) => {
        if (!alive) return;
        const out: LinkableSpace[] = [];
        (r?.spaces ?? []).forEach((s: any) => {
          const kind = detectSpaceType(s, profileFromSpace(s));
          if (kind === "car" || kind === "home") out.push({ id: String(s.id), kind, name: s.name ?? "" });
        });
        setLinkable(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const active = useMemo(() => credits.filter((c) => isCreditActive(c)), [credits]);
  const ended = useMemo(() => credits.filter((c) => !isCreditActive(c)), [credits]);
  const monthly = useMemo(() => Math.round(active.reduce((sum, c) => sum + c.amount, 0) * 100) / 100, [active]);

  const jar = summary?.plan ? summary.credit.budget : null;
  const overJar = jar != null && monthly > jar;

  const renderCredit = (c: CreditEntry, isEnded: boolean) => {
    const linked = c.linkedSpaceId ? linkable.find((s) => s.id === c.linkedSpaceId) : null;
    return (
      <TitleChipRow
        key={c.id}
        testID={`credit-row-${c.id}`}
        onPress={() => setEditing(c)}
        dim={isEnded}
        leading={<IconWell icon="card-outline" color={SPACE_IDENTITY_COLORS.expenses!} tint={tint} />}
        title={c.title}
        chip={linked ? <Chip label={linked.name || SPACE_KIND_LABEL[linked.kind]!} color={spaceTextColor(linked.kind, isDark) ?? SPACE_IDENTITY_COLORS[linked.kind]!} /> : undefined}
        subtitle={`Pe ${c.dayOfMonth} · ${isEnded ? "încheiat în" : "până în"} ${untilLabel(c.endDate)}`}
        trailing={<Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{lei(c.amount)}</Text>}
      />
    );
  };

  return (
    <View testID="expenses-credits" style={{ gap: spacing.sm }}>
      <SectionHeader
        title="Credite"
        info="expenses.credits"
        action={{ label: "Adaugă", onPress: () => setEditing("new"), tone: tint, testID: "credit-add" }}
      />

      {credits.length === 0 ? (
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 18 }}>
          Rate la bancă sau leasing? Adaugă-le aici. Nu intră la cheltuieli.
        </Text>
      ) : (
        <Group>
          {active.map((c) => renderCredit(c, false))}
          {active.length > 0 ? (
            <View testID="credits-monthly" style={{ paddingHorizontal: spacing.lg, paddingVertical: 10, minHeight: 52, justifyContent: "center", gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>Pe lună</Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}>{lei(monthly)}</Text>
              </View>
              {overJar ? (
                <Text testID="credits-over-jar" style={{ fontSize: 13, color: colors.warning }}>
                  {`Peste cei ${summary!.plan!.split.third}% din venit (${lei(Math.round(jar!))})`}
                </Text>
              ) : null}
            </View>
          ) : null}
          {ended.length > 0 ? (
            <Pressable
              testID="credits-ended-toggle"
              onPress={() => setEndedOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: endedOpen }}
              style={{ minHeight: 48, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{`Încheiate (${ended.length})`}</Text>
              <Ionicons name={endedOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.onSurfaceTertiary} />
            </Pressable>
          ) : null}
          {endedOpen ? ended.map((c) => renderCredit(c, true)) : null}
        </Group>
      )}

      <CreditSheet credit={editing} spaceId={spaceId} linkable={linkable} onClose={() => setEditing(null)} onChanged={onChanged} />
    </View>
  );
}
