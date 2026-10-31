import { useRecordMutation } from "@/lib/navigation/useRecordMutation";
import React, { useEffect, useMemo, useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { View, Text, Pressable } from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Disclosure } from "@/components/ui/primitives";
import { GuiltFreeToggle } from "@/components/dashboard/GuiltFree";

import { confirmAction } from "@/lib/confirm";

import type { CarFuelEntry, CarVehicle } from "@/lib/spaces/car/car.types";
import { getLatestFuelEntry, getPreviousFuelEntry } from "@/lib/spaces/car/utils/fuel.utils";
import {
  calculateSuggestedLiters,
  calculatePricePerLiter,
  calculateConsumptionPreview,
} from "@/lib/spaces/car/calculations/fuel.calculations";
import { validateFuelEntry } from "@/lib/spaces/car/validation/fuel.validation";
import { formatDateInput, isValidDateInput, parseDateInput } from "@/lib/spaces/car/utils/dateInput";
import { parseLocaleNumber } from "@/lib/format";

type CarFuelFormProps = {
  vehicle: CarVehicle;
  fuelEntries: CarFuelEntry[];
  onCancel: () => void;
  onSave: (entry: CarFuelEntry) => void;
  /** Pass an existing entry to edit it instead of creating a new one. */
  entry?: CarFuelEntry;
  /** Only meaningful while editing -- deletes this entry entirely. */
  onDelete?: () => void;
};

export default function CarFuelForm({
  vehicle,
  fuelEntries,
  onCancel,
  onSave,
  entry,
  onDelete,
}: CarFuelFormProps) {
  const mutation = useRecordMutation();
  const isEditing = entry !== undefined;

  const { colors, spacing, radius } = useTheme();
  const carColors = useSpaceColors("car");
  const CAR = carColors.color;

  const [liters, setLiters] = useState(
    entry?.liters !== undefined ? String(entry.liters) : "",
  );
  // While editing, the liters value came from a real receipt — don't
  // let the slider-based suggestion silently overwrite it.
  const [litersTouched, setLitersTouched] = useState(isEditing);
  const [price, setPrice] = useState(
    entry?.total_paid !== undefined ? String(entry.total_paid) : "",
  );
  const [odometer, setOdometer] = useState(
    entry?.odometer !== undefined ? String(entry.odometer) : "",
  );
  const [station, setStation] = useState(entry?.station ?? "");
  const [guiltFree, setGuiltFree] = useState(!!entry?.guiltFree);

  // Defaults to today -- fill-ups get logged on the day they happen most
  // of the time, but a receipt from yesterday shouldn't have to become
  // "today's" entry just because that's when you got around to it.
  const [date, setDate] = useState(formatDateInput(entry?.date ?? new Date()));


  const [levelBefore, setLevelBefore] = useState<number | null>(
    entry?.level_before ?? null,
  );
  const [levelAfter, setLevelAfter] = useState<number | null>(
    entry?.level_after ?? null,
  );

  const [error, setError] = useState("");

  const tankCapacity = vehicle.tank_capacity_liters ?? 0;

  const parseOptionalNumber = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    const value = parseLocaleNumber(trimmed);
    return Number.isFinite(value) ? value : undefined;
  };

  // Reference entry for distance/consumption — the entry that came
  // right before this one. When editing, we exclude the entry itself
  // from the pool (otherwise it could reference itself as "previous").
  const previousEntry = useMemo(() => {
    const otherEntries = entry
      ? fuelEntries.filter((e) => e.id !== entry.id)
      : fuelEntries;

    return entry
      ? getPreviousFuelEntry(otherEntries, entry.date)
      : getLatestFuelEntry(otherEntries);
  }, [fuelEntries, entry]);

  // Litri sugerați din slidere (tank level before/after + capacitate).
  const suggestedLiters = useMemo(() => {
    if (levelBefore === null || levelAfter === null) return null;
    return calculateSuggestedLiters(tankCapacity, levelBefore, levelAfter);
  }, [tankCapacity, levelBefore, levelAfter]);

  // Auto-completăm câmpul Liters cu valoarea sugerată, DAR doar cât timp
  // userul nu l-a editat manual — pompa e sursa de adevăr, sliderul e ajutor.
  useEffect(() => {
    if (litersTouched) return;
    if (suggestedLiters === null) return;

    setLiters(String(suggestedLiters));
  }, [suggestedLiters, litersTouched]);

  const handleLitersChange = (value: string) => {
    setLitersTouched(true);
    setLiters(value);
  };

  const handleUseSuggestedLiters = () => {
    if (suggestedLiters === null) return;
    setLitersTouched(false);
    setLiters(String(suggestedLiters));
  };

  // Preț/litru — calculat live, doar informativ.
  const pricePerLiter = useMemo(() => {
    const litersValue = parseLocaleNumber(liters);
    const priceValue = parseLocaleNumber(price);

    if (!liters || !price || !litersValue || !priceValue) return null;

    return calculatePricePerLiter(litersValue, priceValue);
  }, [liters, price]);

  // Preview de consum, calculat live pe măsură ce userul completează
  // odometrul și nivelul "before" — folosește ultimul entry salvat.
  const consumptionPreview = useMemo(() => {
    const odometerValue = parseLocaleNumber(odometer);

    if (!odometer || !odometerValue || levelBefore === null) {
      return { distance: null, litersConsumed: null, consumption: null };
    }

    return calculateConsumptionPreview(
      previousEntry,
      odometerValue,
      levelBefore,
      tankCapacity,
    );
  }, [previousEntry, odometer, levelBefore, tankCapacity]);

  const handleSave = () => mutation.run(async () => {
    setError("");

    const draftEntry: Omit<CarFuelEntry, "id" | "date"> = {
      liters: parseOptionalNumber(liters),
      total_paid: parseOptionalNumber(price),
      odometer: parseOptionalNumber(odometer),
      station: station.trim() || undefined,
      level_before: levelBefore ?? undefined,
      level_after: levelAfter ?? undefined,
    };

    const result = validateFuelEntry(draftEntry, previousEntry);

    if (!result.valid) {
      setError(result.error ?? "Verifică valorile introduse.");
      return;
    }

    if (!isValidDateInput(date)) {
      setError("Alege data.");
      return;
    }

    const entryToSave: CarFuelEntry = {
      id: entry?.id ?? `fuel-${Date.now()}`,
      date: parseDateInput(date) ?? entry?.date ?? new Date().toISOString(),
      ...draftEntry,
      guiltFree,
    };

    await onSave(entryToSave);
  });

  const handleDelete = () => mutation.run(async () => {
    const confirmed = await confirmAction("Ștergi alimentarea?", "Se șterge definitiv.", { confirmLabel: "Șterge", destructive: true });
    if (confirmed) await onDelete?.();
  });

  // Sliders, station: secondary details, folded away until asked for
  // (open straight away when editing an entry that already uses them).
  const [moreOpen, setMoreOpen] = useState(
    !!(entry?.station || entry?.level_before != null || entry?.level_after != null || entry?.guiltFree),
  );

  return (
    <Sheet
      visible
      onClose={() => { if (mutation.canClose()) onCancel(); }}
      info="car.fuelForm"
      title={isEditing ? "Editează alimentarea" : "Alimentare nouă"}
      subtitle="Doar prețul e obligatoriu"
      icon="water-outline"
      tone={CAR}
      footer={
        <>
          <Button testID="car-fuel-save" label={isEditing ? "Salvează" : "Salvează alimentarea"} tone={carColors.fill} disabled={mutation.busy} onPress={handleSave} />
          {isEditing && onDelete ? <Button variant="ghost" icon="trash-outline" label="Șterge alimentarea" disabled={mutation.busy} onPress={handleDelete} /> : null}
        </>
      }
    >
      <Field
        testID="car-fuel-price"
        label="Preț"
        value={price}
        onChangeText={setPrice}
        placeholder="ex. 250"
        keyboardType="decimal-pad"
        big
        suffix="lei"
        tone={CAR}
        hint={pricePerLiter !== null ? `${pricePerLiter} lei/l` : null}
      />

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Litri" value={liters} onChangeText={handleLitersChange} placeholder="ex. 42" keyboardType="decimal-pad" suffix="l" tone={CAR} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField testID="car-fuel-date" label="Data" value={date} onChange={setDate} range="past" />
        </View>
      </View>
      {suggestedLiters !== null ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -spacing.sm }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, flexShrink: 1 }}>
            {litersTouched ? `Din nivelul rezervorului: ${suggestedLiters} l` : `Completat din nivelul rezervorului: ${suggestedLiters} l`}
          </Text>
          {litersTouched ? (
            <Pressable onPress={handleUseSuggestedLiters} style={{ minHeight: 44, justifyContent: "center", paddingLeft: spacing.md }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }}>Folosește</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Field
        label="Kilometraj (opțional)"
        value={odometer}
        onChangeText={setOdometer}
        placeholder="ex. 124580"
        keyboardType="number-pad"
        suffix="km"
        tone={CAR}
        hint={odometer.trim() ? null : "Sari peste dacă urmărești doar cheltuiala."}
      />

      <View style={{ flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.control, padding: spacing.md + 2 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Distanță</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>
            {consumptionPreview.distance !== null ? `${consumptionPreview.distance} km` : "—"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Consum estimat</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>
            {consumptionPreview.consumption !== null
              ? `${consumptionPreview.consumption} l/100`
              : previousEntry !== null
                ? "—"
                : "Prima alimentare"}
          </Text>
        </View>
      </View>

      <Disclosure label="Mai multe detalii (benzinărie, nivel rezervor)" open={moreOpen} onToggle={() => setMoreOpen((v) => !v)} />

      {moreOpen ? (
        <View style={{ gap: spacing.lg }}>
          <Field label="Benzinărie" value={station} onChangeText={setStation} placeholder="ex. OMV" tone={CAR} />
          <LevelSlider label="Nivel rezervor înainte" value={levelBefore} onChange={setLevelBefore} />
          <LevelSlider label="Nivel rezervor după" value={levelAfter} onChange={setLevelAfter} />
          {tankCapacity <= 0 ? (
            <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>
              Setează capacitatea rezervorului (Editează mașina) ca să primești litrii sugerați și consumul estimat.
            </Text>
          ) : null}
          <GuiltFreeToggle value={guiltFree} onChange={setGuiltFree} tone={CAR} testID="car-fuel-guilt-free" />
        </View>
      ) : null}

      {error ? (
        <View style={{ padding: spacing.md, borderRadius: radius.control, backgroundColor: `${colors.error}14` }}>
          <Text style={{ fontSize: 14, color: colors.error }}>{error}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

/** 0-100% tank level slider in the car's color. */
function LevelSlider({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  const { colors } = useTheme();
  const CAR = useSpaceColors("car").color;
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{label}</Text>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{value ?? 0}%</Text>
      </View>
      <Slider
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={value ?? 0}
        onValueChange={onChange}
        minimumTrackTintColor={CAR}
        maximumTrackTintColor={colors.control}
        thumbTintColor={CAR}
        accessibilityLabel={label}
      />
    </View>
  );
}
