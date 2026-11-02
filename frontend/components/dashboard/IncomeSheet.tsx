import React, { useState } from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { Sheet } from "@/components/ui/Sheet";
import { Field, Button, Pill } from "@/components/ui/primitives";
import { lei } from "@/lib/format";
import { parseAmount, planInputValid, setAsideFromPercent, SET_ASIDE_PRESETS } from "@/lib/budget/plan";

/**
 * "Venitul tău" ("Buget simplu", 2026-11-02, mockup Simplu2): the monthly
 * net income + how much of it to put aside each month. De cheltuit = the
 * difference, the one budget every space, bill and credit rate comes out
 * of. Edited only here (Buget tab: the income strip, its pencil, or the
 * onboarding card's "Adaugă venitul").
 */
export function IncomeSheet({
  visible,
  onClose,
  initialIncome,
  initialSetAside,
  bills = 0,
  rates = 0,
  saving,
  onSave,
  serverError,
  onEdit,
}: {
  visible: boolean;
  onClose: () => void;
  initialIncome: number | null;
  initialSetAside: number | null;
  /** This month's recurring bills / credit rates, for the result caption. */
  bills?: number;
  rates?: number;
  saving?: boolean;
  onSave: (income: number, setAside: number) => void;
  /** A 422 from PUT /budget/plan on set_aside, shown under that field. */
  serverError?: string | null;
  /** Any edit (clears serverError). */
  onEdit?: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const fmt = (n: number | null) => (n ? String(Math.round(n * 100) / 100).replace(".", ",") : "");
  const [incomeText, setIncomeText] = useState(fmt(initialIncome));
  const [asideText, setAsideText] = useState(initialSetAside != null ? fmt(initialSetAside) || "0" : "");

  // Re-seed every time the sheet opens (the values may have changed since)
  // -- adjusted during render on the visible flip, not in an effect.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setIncomeText(fmt(initialIncome));
      setAsideText(initialSetAside != null ? fmt(initialSetAside) || "0" : "");
    }
  }

  const income = parseAmount(incomeText);
  const asideRaw = parseAmount(asideText);
  const setAside = Number.isFinite(asideRaw) ? asideRaw : 0;
  const incomeOk = Number.isFinite(income) && income > 0;
  const valid = planInputValid(income, setAside);
  const overIncome = incomeOk && setAside > income;
  const spendable = incomeOk ? Math.max(0, income - setAside) : 0;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const captionParts: string[] = [];
  if (bills > 0) captionParts.push(`facturile (${lei(Math.round(bills))})`);
  if (rates > 0) captionParts.push(`ratele (${lei(Math.round(rates))})`);
  const caption =
    (captionParts.length === 2
      ? `Din ei vin și ${captionParts[0]} și ${captionParts[1]}. `
      : captionParts.length === 1
        ? `Din ei vin și ${captionParts[0]}. `
        : "") + "Ce rămâne la final de lună trece la Economii.";

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Venitul tău"
      icon="wallet-outline"
      info="budget.income"
      testID="income-sheet"
      footer={
        <Button
          testID="income-save"
          label="Salvează"
          onPress={() => valid && onSave(round2(income), round2(setAside))}
          disabled={!valid}
          loading={saving}
        />
      }
    >
      <Field
        testID="income-input"
        label="Venit net pe lună"
        value={incomeText}
        onChangeText={(t) => {
          setIncomeText(t);
          onEdit?.();
        }}
        placeholder="ex. 7000"
        keyboardType="decimal-pad"
        suffix="lei"
        big
        autoFocus={visible && !initialIncome}
        hint="Cât intră în cont, după taxe."
      />

      <View style={{ gap: spacing.sm }}>
        <Field
          testID="set-aside-input"
          label="Pui deoparte în fiecare lună"
          value={asideText}
          onChangeText={(t) => {
            setAsideText(t);
            onEdit?.();
          }}
          placeholder="0"
          keyboardType="decimal-pad"
          suffix="lei"
          tone={colors.success}
          error={overIncome ? "Nu poți pune deoparte mai mult decât venitul." : serverError || null}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {SET_ASIDE_PRESETS.map((p) => {
            const amount = incomeOk ? setAsideFromPercent(income, p) : 0;
            const selected = incomeOk && asideText.trim() !== "" && Math.abs(setAside - amount) < 0.005;
            return (
              <Pill
                key={p}
                testID={`set-aside-preset-${p}`}
                label={p === 0 ? "Nimic" : `${p}%`}
                a11yLabel={p === 0 ? "Nimic deoparte" : `${p}% din venit, ${lei(amount)}`}
                active={selected}
                tone={colors.success}
                onPress={() => {
                  setAsideText(String(amount));
                  onEdit?.();
                }}
              />
            );
          })}
        </View>
        {!overIncome && !serverError ? (
          <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>Merge la Economii pe 1 a fiecărei luni. Poate fi și 0.</Text>
        ) : null}
      </View>

      <View testID="income-result" style={{ backgroundColor: colors.surfaceTertiary, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md }}>
          <Text style={{ fontSize: 15, color: colors.onSurface, flexShrink: 1 }}>De cheltuit pe lună</Text>
          <Text style={{ fontSize: 22, fontWeight: "600", color: colors.onSurface, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
            {incomeOk && !overIncome ? lei(Math.round(spendable)) : "–"}
          </Text>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 18, color: colors.onSurfaceTertiary }}>{caption}</Text>
      </View>
    </Sheet>
  );
}
