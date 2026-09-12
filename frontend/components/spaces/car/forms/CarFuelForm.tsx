import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
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
  const isEditing = entry !== undefined;

  const { colors, spacing, radius } = useTheme();

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

  // Defaults to today -- fill-ups get logged on the day they happen most
  // of the time, but a receipt from yesterday shouldn't have to become
  // "today's" entry just because that's when you got around to it.
  const [date, setDate] = useState(formatDateInput(entry?.date ?? new Date()));

  const [focusedField, setFocusedField] = useState<string | null>(null);

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

    const value = Number(trimmed.replace(",", "."));
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
    const litersValue = Number(liters.replace(",", "."));
    const priceValue = Number(price.replace(",", "."));

    if (!liters || !price || !litersValue || !priceValue) return null;

    return calculatePricePerLiter(litersValue, priceValue);
  }, [liters, price]);

  // Preview de consum, calculat live pe măsură ce userul completează
  // odometrul și nivelul "before" — folosește ultimul entry salvat.
  const consumptionPreview = useMemo(() => {
    const odometerValue = Number(odometer.replace(",", "."));

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

  const handleSave = () => {
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
      setError(result.error ?? "Please check the entered values.");
      return;
    }

    if (!isValidDateInput(date)) {
      setError("Date must use the format DD.MM.YYYY.");
      return;
    }

    const entryToSave: CarFuelEntry = {
      id: entry?.id ?? `fuel-${Date.now()}`,
      date: parseDateInput(date) ?? entry?.date ?? new Date().toISOString(),
      ...draftEntry,
    };

    onSave(entryToSave);
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      "Delete fuel entry",
      "This entry will be permanently deleted.",
      { confirmLabel: "Delete", destructive: true },
    );

    if (confirmed) {
      onDelete?.();
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing.xl,
        }}
      >
        {/* Header */}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.xl,
          }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="water-outline"
                  size={19}
                  color={colors.onSurface}
                />
              </View>

              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: colors.onSurface,
                  letterSpacing: -0.3,
                }}
              >
                {isEditing ? "Edit Fuel" : "Add Fuel"}
              </Text>
            </View>

            <Text
              style={{
                marginTop: 6,
                fontSize: 13,
                color: colors.onSurfaceTertiary,
              }}
            >
              {isEditing
                ? "Update this fuel entry"
                : "Record a fuel fill-up — fill in what matters to you"}
            </Text>
          </View>

          <Pressable
            onPress={onCancel}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close fuel form"
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceSecondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="close"
              size={20}
              color={colors.onSurfaceTertiary}
            />
          </Pressable>
        </View>


        {/* Date */}

        <FormField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="DD.MM.YYYY"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="date"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        <View>
          <Text
            style={{
              marginBottom: spacing.sm,
              fontSize: 12,
              fontWeight: "700",
              color: colors.onSurfaceTertiary,
            }}
          >
            Tank level before <Text style={{ fontWeight: "400" }}>(optional)</Text>
          </Text>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={levelBefore ?? 0}
            onValueChange={setLevelBefore}
            minimumTrackTintColor={colors.onSurface}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.onSurface}
          />

          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: colors.onSurface,
            }}
          >
            {levelBefore ?? 0}%
          </Text>
        </View>

        <View>
          <Text
            style={{
              marginBottom: spacing.sm,
              fontSize: 12,
              fontWeight: "700",
              color: colors.onSurfaceTertiary,
            }}
          >
            Tank level after <Text style={{ fontWeight: "400" }}>(optional)</Text>
          </Text>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={levelAfter ?? 0}
            onValueChange={setLevelAfter}
            minimumTrackTintColor={colors.onSurface}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.onSurface}
          />

          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: colors.onSurface,
            }}
          >
            {levelAfter ?? 0}%
          </Text>

          {tankCapacity <= 0 ? (
            <Text
              style={{
                marginTop: 6,
                fontSize: 12,
                color: colors.onSurfaceTertiary,
              }}
            >
              Set your car&apos;s tank capacity to get a suggested liters
              value and consumption estimates.
            </Text>
          ) : null}
        </View>

        {/* Liters */}

        <FormField
          label="Liters"
          value={liters}
          onChangeText={handleLitersChange}
          placeholder="e.g. 58 (optional)"
          keyboardType="decimal-pad"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="liters"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
          hint={
            suggestedLiters !== null
              ? litersTouched
                ? `Suggested from tank levels: ${suggestedLiters} L`
                : `Auto-filled from tank levels · ${suggestedLiters} L`
              : undefined
          }
          hintAction={
            suggestedLiters !== null && litersTouched
              ? {
                  label: "Use suggested",
                  onPress: handleUseSuggestedLiters,
                }
              : undefined
          }
        />

        {/* Price */}

        <FormField
          label="Price"
          value={price}
          onChangeText={setPrice}
          placeholder="e.g. 250"
          keyboardType="decimal-pad"
          suffix="RON"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="price"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
          hint={
            pricePerLiter !== null
              ? `${pricePerLiter} RON / L`
              : undefined
          }
        />

        {/* Odometer */}

        <FormField
          label="Odometer"
          value={odometer}
          onChangeText={setOdometer}
          placeholder="e.g. 124580 (optional)"
          keyboardType="number-pad"
          suffix="km"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="odometer"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
          hint={
            odometer.trim()
              ? undefined
              : "Skip this if you're only tracking spend"
          }
        />

        {/* Consumption preview */}

        <ConsumptionPreviewCard
          hasPreviousEntry={previousEntry !== null}
          distance={consumptionPreview.distance}
          consumption={consumptionPreview.consumption}
          colors={colors}
          spacing={spacing}
          radius={radius}
        />

        {/* Station */}

        <FormField
          label="Station"
          value={station}
          onChangeText={setStation}
          placeholder="e.g. OMV"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="station"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {/* Error */}

        {error ? (
          <View
            style={{
              marginTop: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSecondary,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: colors.onSurface,
              }}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {/* Save */}

        <Pressable
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save fuel"
          style={{
            marginTop: spacing.xl,
            minHeight: 52,
            borderRadius: radius.md,
            backgroundColor: colors.onSurface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: colors.surface,
            }}
          >
            {isEditing ? "Save Changes" : "Save Fuel"}
          </Text>
        </Pressable>

        {/* Cancel */}

        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel fuel"
          style={{
            marginTop: spacing.sm,
            minHeight: 48,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: colors.onSurface,
            }}
          >
            Cancel
          </Text>
        </Pressable>

        {isEditing && onDelete ? (
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete fuel entry"
            style={{
              marginTop: spacing.sm,
              minHeight: 48,
              borderRadius: radius.md,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: colors.error,
              }}
            >
              Delete Entry
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  suffix?: string;
  colors: any;
  spacing: any;
  radius: any;
  fieldName: string;
  focusedField: string | null;
  onFocus: (field: string) => void;
  onBlur: () => void;
  /** Small helper line under the field (e.g. suggested value, price/L). */
  hint?: string;
  /** Optional tappable action shown next to the hint (e.g. "Use suggested"). */
  hintAction?: { label: string; onPress: () => void };
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  suffix,
  colors,
  spacing,
  radius,
  fieldName,
  focusedField,
  onFocus,
  onBlur,
  hint,
  hintAction,
}: FormFieldProps) {
  const isFocused = focusedField === fieldName;

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text
        style={{
          marginBottom: spacing.sm,
          fontSize: 12,
          fontWeight: "700",
          color: colors.onSurfaceTertiary,
        }}
      >
        {label}
      </Text>

      <View
        style={{
          minHeight: 52,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceSecondary,
          borderWidth: isFocused ? 2 : 1,
          borderColor: isFocused
            ? colors.onSurface
            : colors.border,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.md,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.onSurfaceTertiary}
          keyboardType={keyboardType}
          onFocus={() => onFocus(fieldName)}
          onBlur={onBlur}
          style={[{
            flex: 1,
            fontSize: 15,
            color: colors.onSurface,
            paddingVertical: 0,
            borderWidth: 0,
          }, Platform.OS === "web" && { outlineStyle: "none" } as any]}
        />

        {suffix ? (
          <Text
            style={{
              marginLeft: spacing.sm,
              fontSize: 12,
              fontWeight: "700",
              color: colors.onSurfaceTertiary,
            }}
          >
            {suffix}
          </Text>
        ) : null}
      </View>

      {hint ? (
        <View
          style={{
            marginTop: 6,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: colors.onSurfaceTertiary,
              flexShrink: 1,
            }}
          >
            {hint}
          </Text>

          {hintAction ? (
            <Pressable onPress={hintAction.onPress} hitSlop={6}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: colors.onSurface,
                }}
              >
                {hintAction.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type ConsumptionPreviewCardProps = {
  hasPreviousEntry: boolean;
  distance: number | null;
  consumption: number | null;
  colors: any;
  spacing: any;
  radius: any;
};

function ConsumptionPreviewCard({
  hasPreviousEntry,
  distance,
  consumption,
  colors,
  spacing,
  radius,
}: ConsumptionPreviewCardProps) {
  return (
    <View
      style={{
        marginBottom: spacing.xl,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceSecondary,
        flexDirection: "row",
      }}
    >
      <PreviewStat
        label="Distance"
        value={distance !== null ? `${distance} km` : "—"}
        colors={colors}
      />

      <View
        style={{
          width: 1,
          backgroundColor: colors.border,
          marginHorizontal: spacing.md,
        }}
      />

      <PreviewStat
        label="Est. consumption"
        value={
          consumption !== null
            ? `${consumption} L/100km`
            : hasPreviousEntry
              ? "—"
              : "First entry"
        }
        colors={colors}
      />
    </View>
  );
}

function PreviewStat({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: colors.onSurfaceTertiary,
        }}
      >
        {label}
      </Text>

      <Text
        style={{
          marginTop: 3,
          fontSize: 15,
          fontWeight: "800",
          color: colors.onSurface,
        }}
      >
        {value}
      </Text>
    </View>
  );
}