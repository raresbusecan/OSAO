import React, { useState } from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { Sheet } from "@/components/ui/Sheet";
import { Field, Group, Button } from "@/components/ui/primitives";
import { lei } from "@/lib/format";
import { JAR_ORDER, jarAmounts, jarFill, jarShortLabel, parseAmount, type BudgetSplit } from "@/lib/budget/plan";

/**
 * "Venitul tău" -- the monthly net income, the one input the whole plan
 * hangs on. Edited only here (Buget tab). The 5-jar preview updates live
 * with the current split; the split itself is edited in SplitSheet.
 */
export function IncomeSheet({
  visible,
  onClose,
  initialIncome,
  split,
  saving,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  initialIncome: number | null;
  split: BudgetSplit;
  saving?: boolean;
  onSave: (income: number) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Venitul tău" icon="wallet-outline" info="budget.income" testID="income-sheet">
      {visible ? <IncomeBody initialIncome={initialIncome} split={split} saving={saving} onSave={onSave} /> : null}
    </Sheet>
  );
}

function IncomeBody({ initialIncome, split, saving, onSave }: { initialIncome: number | null; split: BudgetSplit; saving?: boolean; onSave: (income: number) => void }) {
  const { colors, spacing, isDark } = useTheme();
  const [text, setText] = useState(initialIncome ? String(Math.round(initialIncome * 100) / 100).replace(".", ",") : "");
  const income = parseAmount(text);
  const valid = Number.isFinite(income) && income >= 1;
  const amounts = jarAmounts(valid ? income : 0, split);

  return (
    <>
      <Field
        testID="income-input"
        label="Venit net lunar"
        value={text}
        onChangeText={setText}
        placeholder="ex. 7000"
        keyboardType="decimal-pad"
        suffix="lei"
        big
        autoFocus={!initialIncome}
        hint="Cât intră în cont după taxe. Îl schimbi doar când se schimbă."
      />

      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, paddingHorizontal: spacing.xs }}>Cum îl împărțim</Text>
        <Group inset={34}>
          {JAR_ORDER.map((k) => (
            <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, minHeight: 48 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: jarFill(k, colors, isDark) }} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{jarShortLabel(k)}</Text>
              <Text style={{ width: 44, textAlign: "right", fontSize: 15, color: colors.onSurfaceTertiary }}>{split[k]}%</Text>
              <Text style={{ minWidth: 84, textAlign: "right", fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{valid ? lei(Math.round(amounts[k])) : "–"}</Text>
            </View>
          ))}
        </Group>
      </View>

      <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary, paddingHorizontal: spacing.xs }}>
        Ai un credit? Adaugă-l în spațiul Cheltuieli, la Credite. Cei {split.third}% îl urmăresc singuri.
      </Text>

      <Button testID="income-save" label="Salvează venitul" onPress={() => valid && onSave(Math.round(income * 100) / 100)} disabled={!valid} loading={saving} />
    </>
  );
}
