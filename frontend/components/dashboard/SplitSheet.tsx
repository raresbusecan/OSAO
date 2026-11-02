// DEAD since 2026-11-02 ("Buget simplu": no jars / no guilt-free) -- no importers, kept only because file deletion is denied here. See frontend/CLAUDE.md.
import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { Sheet } from "@/components/ui/Sheet";
import { Group, Button } from "@/components/ui/primitives";
import { lei } from "@/lib/format";
import { DEFAULT_SPLIT, JAR_ORDER, jarAmounts, jarLabel, splitTotal, type BudgetSplit, type SplitKey } from "@/lib/budget/legacyJars";

/**
 * "Împărțirea venitului" -- the five integer percents, −/+ steppers, a
 * live total; Save only enables at exactly 100 (the server 422s
 * otherwise). Warns when Necesități drops under what the spaces usually
 * cost (necessities.avg_last_3_months).
 */
export function SplitSheet({
  visible,
  onClose,
  income,
  initialSplit,
  avgNeeds,
  hasCredit,
  creditRates,
  saving,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  income: number;
  initialSplit: BudgetSplit;
  avgNeeds: number;
  hasCredit: boolean;
  creditRates: number;
  saving?: boolean;
  onSave: (split: BudgetSplit) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Împărțirea venitului" subtitle={`Din ${lei(Math.round(income))} pe lună`} info="budget.split" testID="split-sheet">
      {visible ? (
        <SplitBody income={income} initialSplit={initialSplit} avgNeeds={avgNeeds} hasCredit={hasCredit} creditRates={creditRates} saving={saving} onSave={onSave} />
      ) : null}
    </Sheet>
  );
}

function SplitBody({
  income,
  initialSplit,
  avgNeeds,
  hasCredit,
  creditRates,
  saving,
  onSave,
}: {
  income: number;
  initialSplit: BudgetSplit;
  avgNeeds: number;
  hasCredit: boolean;
  creditRates: number;
  saving?: boolean;
  onSave: (split: BudgetSplit) => void;
}) {
  const { colors, spacing } = useTheme();
  const [split, setSplit] = useState<BudgetSplit>({ ...initialSplit });
  const total = splitTotal(split);
  const amounts = jarAmounts(income, split);
  const isDefault = JAR_ORDER.every((k) => split[k] === DEFAULT_SPLIT[k]);

  const step = (k: SplitKey, delta: number) => setSplit((s) => ({ ...s, [k]: Math.max(0, Math.min(100, s[k] + delta)) }));

  const subtitle = (k: SplitKey): { text: string; warn?: boolean } => {
    const amount = lei(Math.round(amounts[k]));
    if (k === "needs" && avgNeeds > 0 && amounts.needs < avgNeeds) {
      return { text: `${amount}, sub media ta de ${lei(Math.round(avgNeeds))}`, warn: true };
    }
    if (k === "third" && hasCredit) return { text: `${amount} · ratele: ${lei(Math.round(creditRates))}` };
    return { text: amount };
  };

  return (
    <>
      <Group>
        {JAR_ORDER.map((k) => {
          const sub = subtitle(k);
          const label = jarLabel(k, hasCredit);
          return (
            <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.sm, minHeight: 64 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{label}</Text>
                <Text style={{ fontSize: 13, color: sub.warn ? colors.warning : colors.onSurfaceTertiary }} numberOfLines={2}>{sub.text}</Text>
              </View>
              <StepButton icon="remove" label={`Scade ${label.toLowerCase()}`} onPress={() => step(k, -1)} disabled={split[k] <= 0} testID={`split-minus-${k}`} />
              <Text testID={`split-value-${k}`} style={{ width: 48, textAlign: "center", fontSize: 17, fontWeight: "600", color: colors.onSurface }}>{split[k]}%</Text>
              <StepButton icon="add" label={`Crește ${label.toLowerCase()}`} onPress={() => step(k, 1)} disabled={split[k] >= 100} testID={`split-plus-${k}`} />
            </View>
          );
        })}
      </Group>

      {!isDefault ? (
        <Pressable
          testID="split-reset"
          onPress={() => setSplit({ ...DEFAULT_SPLIT })}
          accessibilityRole="button"
          style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md }}
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>Revino la 55 / 5 / 10 / 15 / 15</Text>
        </Pressable>
      ) : null}

      <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xs }}>
        <Text style={{ fontSize: 14, fontWeight: "500", color: total === 100 ? colors.success : colors.warning }}>
          {total === 100 ? "Gata, adună 100%" : total < 100 ? `Mai ai ${100 - total}% de împărțit` : `Ai ${total - 100}% în plus`}
        </Text>
        <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>
          Total <Text style={{ fontWeight: "600", color: colors.onSurface }}>{total}%</Text>
        </Text>
      </View>

      <Button testID="split-save" label="Salvează" onPress={() => onSave(split)} disabled={total !== 100} loading={saving} />
    </>
  );
}

function StepButton({ icon, label, onPress, disabled, testID }: { icon: "add" | "remove"; label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.segmentActive,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={colors.onSurface} />
    </Pressable>
  );
}
