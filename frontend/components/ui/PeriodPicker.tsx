import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { Sheet } from "@/components/ui/Sheet";
import { Group, Row, Segmented, CircleButton, SectionHeader, Pill } from "@/components/ui/primitives";
import { roCount } from "@/lib/format";
import { formatPeriodLabel, periodsEqual, type CustomPeriodUnit, type PeriodPreset, type PeriodValue } from "@/lib/period";

const CUSTOM_MIN = 1;
const CUSTOM_MAX = 12;

/**
 * The one history/display period selector (2026-10, user: "every period
 * picker like Mașină > Istoric"): a calendar Pill showing the current
 * period, opening a "Perioadă" sheet -- the page's presets as rows with a
 * check, plus "Personalizat" (last 1-12 weeks / months, stepper). Used by
 * Mașină Istoric + Cheltuieli, Casă Cheltuieli, Cheltuieli > Toate.
 *
 * The page owns the period value (and filters by it); this owns only the
 * sheet and the custom stepper. `children` go after the pill in the same
 * row (a count caption, another filter pill).
 */
export function PeriodPicker<P extends PeriodValue>({
  value,
  onChange,
  presets,
  testIDPrefix,
  active,
  allowCustom = true,
  children,
}: {
  value: P;
  onChange: (period: P) => void;
  presets: PeriodPreset<P>[];
  testIDPrefix: string;
  /** Pill highlighted -- defaults to "narrower than Tot timpul". */
  active?: boolean;
  /** The "Personalizat" weeks/months stepper. The page's period type must
   * then accept { kind: "weeks" | "months", count }. */
  allowCustom?: boolean;
  children?: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);

  // A value that isn't one of the presets (only the stepper makes those)
  // opens with the stepper on it.
  const startsCustom = allowCustom && !presets.some((p) => periodsEqual(p.period, value)) && (value.kind === "weeks" || value.kind === "months");
  const [customChosen, setCustomChosen] = useState(startsCustom);
  const [customUnit, setCustomUnit] = useState<CustomPeriodUnit>(startsCustom ? (value.kind as CustomPeriodUnit) : "months");
  const [customCount, setCustomCount] = useState(startsCustom ? (value as { count: number }).count : 2);
  // "Personalizat" stays checked only while the page still shows what the
  // stepper set (an outside reset, e.g. "Arată tot timpul", clears it).
  const usingCustom = customChosen && value.kind === customUnit && (value as { count: number }).count === customCount;

  const custom = (unit: CustomPeriodUnit, count: number) => ({ kind: unit, count }) as P;

  const selectPreset = (period: P) => {
    setCustomChosen(false);
    onChange(period);
    setOpen(false);
  };
  const selectCustom = () => {
    setCustomChosen(true);
    onChange(custom(customUnit, customCount));
  };
  const selectUnit = (unit: CustomPeriodUnit) => {
    setCustomUnit(unit);
    onChange(custom(unit, customCount));
  };
  const step = (delta: number) => {
    const next = Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, customCount + delta));
    setCustomCount(next);
    onChange(custom(customUnit, next));
  };

  const check = <Ionicons name="checkmark" size={20} color={colors.onSurface} />;

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" }}>
        <Pill
          testID={`${testIDPrefix}-period-trigger`}
          icon="calendar-outline"
          label={formatPeriodLabel(value)}
          a11yLabel={`Perioadă: ${formatPeriodLabel(value)}`}
          active={active ?? value.kind !== "all"}
          onPress={() => setOpen(true)}
        />
        {children}
      </View>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Perioadă">
        <Group>
          {presets.map((preset) => (
            <Row
              key={preset.label}
              testID={`${testIDPrefix}-period-option-${preset.label}`}
              title={preset.label}
              onPress={() => selectPreset(preset.period)}
              trailing={!usingCustom && periodsEqual(value, preset.period) ? check : null}
            />
          ))}
          {allowCustom ? (
            <Row testID={`${testIDPrefix}-period-option-custom`} title="Personalizat" onPress={selectCustom} trailing={usingCustom ? check : null} />
          ) : null}
        </Group>

        {allowCustom && usingCustom ? (
          <View style={{ gap: spacing.md }}>
            <SectionHeader title="Ultimele" muted />
            <Segmented
              testIDPrefix={`${testIDPrefix}-period-custom-unit`}
              options={[
                { key: "weeks", label: "Săptămâni" },
                { key: "months", label: "Luni" },
              ]}
              value={customUnit}
              onChange={selectUnit}
            />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <CircleButton testID={`${testIDPrefix}-period-custom-minus`} icon="remove" label="Mai puțin" onPress={() => step(-1)} disabled={customCount <= CUSTOM_MIN} />
              <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface }}>
                {roCount(customCount, customUnit === "weeks" ? "săptămână" : "lună", customUnit === "weeks" ? "săptămâni" : "luni")}
              </Text>
              <CircleButton testID={`${testIDPrefix}-period-custom-plus`} icon="add" label="Mai mult" onPress={() => step(1)} disabled={customCount >= CUSTOM_MAX} />
            </View>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>Gata</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
