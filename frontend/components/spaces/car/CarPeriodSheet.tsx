import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { Sheet } from "@/components/ui/Sheet";
import { Group, Row, Segmented, CircleButton, SectionHeader } from "@/components/ui/primitives";
import { roCount } from "@/lib/format";
import type { CarExpensePeriod } from "@/lib/spaces/car/calculations/expenses.calculations";

export const CAR_PERIOD_PRESETS: { label: string; period: CarExpensePeriod }[] = [
  { label: "Tot timpul", period: { kind: "all" } },
  { label: "Ultimele 3 luni", period: { kind: "months", count: 3 } },
  { label: "Ultimele 6 luni", period: { kind: "months", count: 6 } },
  { label: "Ultimul an", period: { kind: "months", count: 12 } },
  { label: "Ultimii 2 ani", period: { kind: "years", count: 2 } },
  { label: "Ultimii 3 ani", period: { kind: "years", count: 3 } },
];

export type CustomPeriodUnit = "weeks" | "months";

export function periodsEqual(a: CarExpensePeriod, b: CarExpensePeriod): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "all") return true;
  return (a as { count: number }).count === (b as { count: number }).count;
}

/** The Car pages' period picker (History, Expenses): presets as rows
 * with a check, plus a custom "last N weeks/months" stepper. State
 * lives in the page; this only renders and reports choices. */
export function CarPeriodSheet({
  visible,
  onClose,
  period,
  usingCustom,
  customUnit,
  customCount,
  onPreset,
  onCustom,
  onCustomUnit,
  onCustomCount,
  testIDPrefix,
}: {
  visible: boolean;
  onClose: () => void;
  period: CarExpensePeriod;
  usingCustom: boolean;
  customUnit: CustomPeriodUnit;
  customCount: number;
  onPreset: (p: CarExpensePeriod) => void;
  onCustom: () => void;
  onCustomUnit: (u: CustomPeriodUnit) => void;
  onCustomCount: (delta: number) => void;
  testIDPrefix: string;
}) {
  const { colors, spacing } = useTheme();
  const check = <Ionicons name="checkmark" size={20} color={colors.onSurface} />;

  return (
    <Sheet visible={visible} onClose={onClose} title="Perioadă">
      <Group>
        {CAR_PERIOD_PRESETS.map((preset) => (
          <Row
            key={preset.label}
            testID={`${testIDPrefix}-period-option-${preset.label}`}
            title={preset.label}
            onPress={() => onPreset(preset.period)}
            trailing={!usingCustom && periodsEqual(period, preset.period) ? check : null}
          />
        ))}
        <Row
          testID={`${testIDPrefix}-period-option-custom`}
          title="Personalizat"
          onPress={onCustom}
          trailing={usingCustom ? check : null}
        />
      </Group>

      {usingCustom ? (
        <View style={{ gap: spacing.md }}>
          <SectionHeader title="Ultimele" muted />
          <Segmented
            testIDPrefix={`${testIDPrefix}-period-custom-unit`}
            options={[
              { key: "weeks", label: "Săptămâni" },
              { key: "months", label: "Luni" },
            ]}
            value={customUnit}
            onChange={onCustomUnit}
          />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <CircleButton testID={`${testIDPrefix}-period-custom-minus`} icon="remove" label="Mai puțin" onPress={() => onCustomCount(-1)} disabled={customCount <= 1} />
            <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface }}>
              {roCount(customCount, customUnit === "weeks" ? "săptămână" : "lună", customUnit === "weeks" ? "săptămâni" : "luni")}
            </Text>
            <CircleButton testID={`${testIDPrefix}-period-custom-plus`} icon="add" label="Mai mult" onPress={() => onCustomCount(1)} disabled={customCount >= 12} />
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>Gata</Text>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}
