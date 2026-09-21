import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { confirmAction } from "@/lib/confirm";

import type { CarMaintenanceEntry } from "@/lib/spaces/car/car.types";
import { validateMaintenanceEntry } from "@/lib/spaces/car/validation/maintenance.validation";
import { formatDateInput, isValidDateInput, parseDateInput } from "@/lib/spaces/car/utils/dateInput";
import { NON_RECURRING_MAINTENANCE_TYPES } from "@/lib/spaces/car/calculations/dashboard.calculations";

type CarMaintenanceFormProps = {
  onCancel: () => void;
  /** Called once per service saved -- a single call when editing/renewing,
   * or once per selected type when logging a fresh batch visit (see
   * isBatchMode below). Each call is a complete, independent
   * CarMaintenanceEntry; the caller (CarDashboard.tsx's
   * handleMaintenanceSave) doesn't need to know or care it came from a
   * batch. */
  onSave: (entry: CarMaintenanceEntry) => void;
  /** Pass an existing entry to edit it instead of creating a new one. */
  entry?: CarMaintenanceEntry;
  /** Only meaningful while editing -- deletes this entry entirely. */
  onDelete?: () => void;
  /** Opened from a "Due soon"/"Overdue" NEXT alert -- pre-fills Service/
   * Provider from the entry it came from, but this still creates a
   * brand-new record, never overwrites the old one. `sourceId` is carried
   * onto the saved entry as `renewedFromId` so the caller can archive the
   * old one -- see CarDashboard.tsx's handleMaintenanceSave. Ignored when
   * `entry` is set (editing always wins). */
  renewFrom?: Pick<CarMaintenanceEntry, "service" | "provider"> & {
    sourceId: string;
  };
};

const MAINTENANCE_TYPES = [
  "Oil Change",
  "Filters",
  "Brakes",
  "Tires",
  "Battery",
  "Fluids",
  "Service",
  "Repair",
];

/** Types that can legitimately happen more than once in the same visit
 * (e.g. a front-bumper repair and an exhaust repair are both "Repair"
 * but need their own price/description/entry) -- tapping these always
 * adds a new line instead of toggling one on/off. Everything else stays
 * a plain on/off pill, same as before. Same set as
 * NON_RECURRING_MAINTENANCE_TYPES: a generic bucket like "Repair" can't
 * predict a "next one due" either, so it's also skipped there for the
 * Next Service km/date fields, and never supersedes an earlier one of
 * the same name (see isMaintenanceSuperseded). */
const REPEATABLE_TYPES = NON_RECURRING_MAINTENANCE_TYPES;

/**
 * Some service types have a well-known time interval independent of how
 * the user drives, so the date target is computed automatically instead
 * of asked for (see hasAutoDate below) -- only the km target, if any, is
 * still up to the user.
 *  - Oil Change: 12 months, the common "or 12 months, whichever comes
 *    first" half of the interval alongside the km target.
 *  - Battery: 60 months -- car batteries are broadly recommended for
 *    replacement every 3-5 years (AAA, Firestone, Consumer Reports); 5
 *    years is the upper end of that range.
 */
const AUTO_DATE_INTERVAL_MONTHS: Record<string, number> = {
  "Oil Change": 12,
  "Battery": 60,
};

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** Whether `serviceName` has a known interval, and what its computed
 * next-due date is given the (shared) visit date -- used both for the
 * single-service form (editing/renewing) and per-service in a batch. */
function getAutoDate(serviceName: string, dateInput: string) {
  const intervalMonths = AUTO_DATE_INTERVAL_MONTHS[serviceName];
  const hasAutoDate = intervalMonths !== undefined;

  const autoDate =
    hasAutoDate && isValidDateInput(dateInput)
      ? formatDateInput(addMonths(new Date(parseDateInput(dateInput)!), intervalMonths))
      : undefined;

  return { hasAutoDate, intervalMonths, autoDate };
}

type ServiceDetail = { price: string; nextKm: string; nextDate: string; underWarranty: boolean };

const EMPTY_DETAIL: ServiceDetail = { price: "", nextKm: "", nextDate: "", underWarranty: false };

/** One line in a batch visit -- `id` is stable and unique per line
 * (needed because REPEATABLE_TYPES means `name` alone isn't unique, e.g.
 * two separate "Repair" lines); `name` is what actually gets saved as
 * the entry's `service`. `isCustom` is true for a Repair-pill line or an
 * Other-added line (never a plain Quick Select pick like "Oil Change"):
 * its title is editable in place, and -- like any NON_RECURRING type --
 * it never gets Next Service km/date fields, since a one-off/custom item
 * has no predictable "next one due" either. */
type ServiceLine = { id: string; name: string; isCustom: boolean };

export default function CarMaintenanceForm({
  onCancel,
  onSave,
  entry,
  onDelete,
  renewFrom,
}: CarMaintenanceFormProps) {
  const isEditing = entry !== undefined;
  const isRenewing = !isEditing && renewFrom !== undefined;
  // Multiple services in one visit only makes sense for a fresh entry --
  // editing is one specific record, renewing replaces one specific
  // record. Both keep the original single-service form untouched below.
  const isBatchMode = !isEditing && !isRenewing;

  const { colors, spacing, radius } = useTheme();

  // ---- Single-service state (editing or renewing an exact one) ----
  const [service, setService] = useState(entry?.service ?? renewFrom?.service ?? "");
  const [price, setPrice] = useState(entry ? String(entry.price) : "");
  const [underWarranty, setUnderWarranty] = useState(entry?.underWarranty ?? false);
  const [nextServiceOdometer, setNextServiceOdometer] = useState(
    entry?.nextServiceOdometer ? String(entry.nextServiceOdometer) : "",
  );
  const [nextServiceDate, setNextServiceDate] = useState(entry?.nextServiceDate ?? "");

  // ---- Batch-mode state (a fresh, non-renewal Add) ----
  // Quick Select becomes multi-toggle (or repeated-add for
  // REPEATABLE_TYPES); `customService` + addCustomLine appends one more,
  // one-off title beyond the preset list (e.g. "Windshield wiper") --
  // and can be pressed again for a second, different one-off title. Each
  // line gets its own price/next-km/next-date via serviceDetails, keyed
  // by the line's own id (not its name -- two "Repair" lines share a
  // name but need separate details).
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [customService, setCustomService] = useState("");
  const [serviceDetails, setServiceDetails] = useState<Record<string, ServiceDetail>>({});

  const activeServices = isBatchMode ? serviceLines : [{ id: service, name: service, isCustom: false }];

  const getDetail = (id: string): ServiceDetail => serviceDetails[id] ?? EMPTY_DETAIL;

  const updateDetail = (id: string, patch: Partial<ServiceDetail>) => {
    setServiceDetails((current) => ({
      ...current,
      [id]: { ...getDetail(id), ...patch },
    }));
  };

  const removeLine = (id: string) => {
    setServiceLines((current) => current.filter((l) => l.id !== id));
    setServiceDetails((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const handleTypePress = (type: string) => {
    if (REPEATABLE_TYPES.has(type)) {
      setServiceLines((current) => [
        ...current,
        { id: `${type}-${Date.now()}-${current.length}`, name: type, isCustom: true },
      ]);
      return;
    }

    setServiceLines((current) => {
      const exists = current.some((l) => l.id === type);
      if (exists) return current.filter((l) => l.id !== type);
      return [...current, { id: type, name: type, isCustom: false }]; // id = name: stable, and unique since not repeatable
    });
  };

  const addCustomLine = () => {
    const name = customService.trim();
    if (!name) return;
    setServiceLines((current) => [
      ...current,
      { id: `custom-${Date.now()}-${current.length}`, name, isCustom: true },
    ]);
    setCustomService("");
  };

  const renameLine = (id: string, name: string) => {
    setServiceLines((current) => current.map((l) => (l.id === id ? { ...l, name } : l)));
  };

  // ---- Shared fields (apply to the whole visit, every service in it) ----
  const [description, setDescription] = useState(entry?.description ?? "");
  const [odometer, setOdometer] = useState(entry ? String(entry.odometer) : "");
  const [provider, setProvider] = useState(entry?.provider ?? renewFrom?.provider ?? "");

  // Defaults to today -- a service gets logged the day it happens most
  // of the time, but a shop visit from earlier in the week shouldn't
  // have to become "today's" entry just because that's when you got
  // around to logging it.
  const [date, setDate] = useState(formatDateInput(entry?.date ?? new Date()));

  // Single-mode auto-date (editing/renewing) -- re-derives live off
  // `service`, so switching Quick Select types (or typing a matching
  // service name) hides/shows the manual date field immediately.
  const { hasAutoDate, intervalMonths: autoDateIntervalMonths, autoDate: autoNextServiceDate } =
    getAutoDate(service, date);

  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [error, setError] = useState("");

  const handleSave = () => {
    setError("");

    if (!isValidDateInput(date)) {
      setError("Date must use the format DD.MM.YYYY.");
      return;
    }

    const odometerValue = odometer ? Number(odometer.replace(",", ".")) : undefined;

    if (isBatchMode) {
      if (activeServices.length === 0) {
        setError("Please select or enter at least one service.");
        return;
      }

      const drafts: Omit<CarMaintenanceEntry, "id" | "date">[] = [];

      for (const line of activeServices) {
        const detail = getDetail(line.id);
        const { hasAutoDate: nameHasAutoDate, autoDate } = getAutoDate(line.name, date);

        const draft: Omit<CarMaintenanceEntry, "id" | "date"> = {
          service: line.name,
          description: description.trim(),
          price: detail.underWarranty ? 0 : Number(detail.price.replace(",", ".")),
          underWarranty: detail.underWarranty,
          odometer: odometerValue,
          provider: provider.trim() || undefined,
          nextServiceOdometer: detail.nextKm
            ? Number(detail.nextKm.replace(",", "."))
            : undefined,
          nextServiceDate: nameHasAutoDate ? autoDate : detail.nextDate.trim() || undefined,
        };

        const result = validateMaintenanceEntry(draft);
        if (!result.valid) {
          setError(`${line.name}: ${result.error ?? "Please check the entered values."}`);
          return;
        }

        drafts.push(draft);
      }

      const dateIso = parseDateInput(date) ?? new Date().toISOString();

      drafts.forEach((draft, index) => {
        onSave({
          id: `maintenance-${Date.now()}-${index}`,
          date: dateIso,
          ...draft,
        });
      });

      return;
    }

    // Single-service path (editing or renewing) -- unchanged behavior.
    const draftEntry: Omit<CarMaintenanceEntry, "id" | "date"> = {
      service: service.trim(),
      description: description.trim(),
      price: underWarranty ? 0 : Number(price.replace(",", ".")),
      underWarranty,
      odometer: odometerValue,
      provider: provider.trim() || undefined,
      nextServiceOdometer: nextServiceOdometer
        ? Number(nextServiceOdometer.replace(",", "."))
        : undefined,
      nextServiceDate: hasAutoDate ? autoNextServiceDate : nextServiceDate.trim() || undefined,
    };

    const result = validateMaintenanceEntry(draftEntry);

    if (!result.valid) {
      setError(result.error ?? "Please check the entered values.");
      return;
    }

    const entryToSave: CarMaintenanceEntry = {
      id: entry?.id ?? `maintenance-${Date.now()}`,
      date: parseDateInput(date) ?? entry?.date ?? new Date().toISOString(),
      ...draftEntry,
      renewedFromId: isRenewing ? renewFrom?.sourceId : entry?.renewedFromId,
    };

    onSave(entryToSave);
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      "Delete maintenance entry",
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
      behavior={
        Platform.OS === "ios" ? "padding" : undefined
      }
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
                  backgroundColor:
                    colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="construct-outline"
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
                {isEditing ? "Edit Maintenance" : "Add Maintenance"}
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
                ? "Update this service or repair"
                : isBatchMode
                  ? "Record everything done in this visit"
                  : "Record a service or repair"}
            </Text>
          </View>

          <Pressable
            onPress={onCancel}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close maintenance form"
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
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

        {isRenewing ? (
          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.sm,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: spacing.lg,
            }}
          >
            <Ionicons name="information-circle-outline" size={18} color={colors.onSurfaceTertiary} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 17 }}>
              Creating a new record -- your previous {renewFrom?.service || "service"} entry
              stays in your history, not overwritten.
            </Text>
          </View>
        ) : null}

        {/* Quick Select -- multi-select in batch mode (tap to toggle any
            number on), single-select while editing/renewing (tap picks
            exactly one, same as before). */}

        <Text
          style={{
            marginBottom: spacing.sm,
            fontSize: 12,
            fontWeight: "700",
            color: colors.onSurfaceTertiary,
          }}
        >
          {isBatchMode ? "Quick Select (pick as many as you did)" : "Quick Select"}
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {MAINTENANCE_TYPES.map((type) => {
            const isRepeatable = REPEATABLE_TYPES.has(type);
            const count = isBatchMode
              ? serviceLines.filter((l) => l.name === type).length
              : 0;
            const selected = isBatchMode
              ? isRepeatable
                ? count > 0
                : serviceLines.some((l) => l.id === type)
              : service === type;

            return (
              <Pressable
                key={type}
                onPress={() => (isBatchMode ? handleTypePress(type) : setService(type))}
                style={{
                  paddingHorizontal: spacing.md,
                  minHeight: 40,
                  borderRadius: radius.pill,
                  backgroundColor: selected
                    ? colors.onSurface
                    : "transparent",
                  borderWidth: 1,
                  borderColor: selected
                    ? colors.onSurface
                    : colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  justifyContent: "center",
                }}
              >
                {isBatchMode && selected && !isRepeatable ? (
                  <Ionicons name="checkmark" size={13} color={colors.surface} />
                ) : null}
                {isBatchMode && isRepeatable ? (
                  <Ionicons name="add" size={13} color={selected ? colors.surface : colors.onSurface} />
                ) : null}
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: selected
                      ? colors.surface
                      : colors.onSurface,
                  }}
                >
                  {type}
                  {isRepeatable && count > 0 ? ` (${count})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Date -- shared across every service in this visit. */}

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

        {!isBatchMode ? (
          <FormField
            label="Service"
            value={service}
            onChangeText={setService}
            placeholder="e.g. Oil change"
            required
            colors={colors}
            spacing={spacing}
            radius={radius}
            fieldName="service"
            focusedField={focusedField}
            onFocus={setFocusedField}
            onBlur={() => setFocusedField(null)}
          />
        ) : (
          /* Other -- a one-off title beyond Quick Select. "Add" appends
             it as its own line and clears the field, so it can be
             pressed again for a second, different one-off title (e.g.
             two unrelated custom repairs in the same visit). */
          <View style={{ marginBottom: spacing.xl }}>
            <Text
              style={{
                marginBottom: spacing.sm,
                fontSize: 12,
                fontWeight: "700",
                color: colors.onSurfaceTertiary,
              }}
            >
              Other
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <FormField
                  label=""
                  hideLabel
                  value={customService}
                  onChangeText={setCustomService}
                  placeholder="e.g. Windshield wiper"
                  colors={colors}
                  spacing={spacing}
                  radius={radius}
                  fieldName="customService"
                  focusedField={focusedField}
                  onFocus={setFocusedField}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              <Pressable
                onPress={addCustomLine}
                disabled={!customService.trim()}
                accessibilityRole="button"
                accessibilityLabel="Add other service"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: radius.sm,
                  backgroundColor: customService.trim() ? colors.onSurface : "transparent",
                  borderWidth: 1,
                  borderColor: customService.trim() ? colors.onSurface : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="add"
                  size={22}
                  color={customService.trim() ? colors.surface : colors.onSurfaceTertiary}
                />
              </Pressable>
            </View>
          </View>
        )}

        {/* Description -- shared, one note about the whole visit. */}

        <FormField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Engine oil and oil filter replaced"
          colors={colors}
          spacing={spacing}
          radius={radius}
          multiline
          fieldName="description"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {!isBatchMode ? (
          <>
            <WarrantyToggle
              value={underWarranty}
              onValueChange={setUnderWarranty}
              colors={colors}
              spacing={spacing}
              radius={radius}
            />

            {!underWarranty ? (
              <FormField
                label="Price"
                value={price}
                onChangeText={setPrice}
                placeholder="e.g. 380"
                keyboardType="decimal-pad"
                suffix="RON"
                required
                colors={colors}
                spacing={spacing}
                radius={radius}
                fieldName="price"
                focusedField={focusedField}
                onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
              />
            ) : null}
          </>
        ) : null}

        {/* Odometer -- shared: one mileage reading for the car at the
            time of this visit, regardless of how many services. Only
            actually required when Oil Change is among them (see
            maintenance.validation.ts) -- activeServices covers both
            single- and batch-mode with the same check. */}

        <FormField
          label="Odometer"
          value={odometer}
          onChangeText={setOdometer}
          placeholder="e.g. 123580"
          keyboardType="number-pad"
          suffix="km"
          required={activeServices.some((l) => l.name === "Oil Change")}
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="odometer"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {/* Provider -- shared. */}

        <FormField
          label="Provider"
          value={provider}
          onChangeText={setProvider}
          placeholder="e.g. BMW Service"
          colors={colors}
          spacing={spacing}
          radius={radius}
          fieldName="provider"
          focusedField={focusedField}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
        />

        {!isBatchMode ? (
          <>
            {/* Next Service -- km and date are independent, either or
                both can be set (see getMaintenanceUrgency in
                dashboard.calculations.ts: whichever comes first wins). */}

            <FormField
              label="Next Service (km)"
              value={nextServiceOdometer}
              onChangeText={setNextServiceOdometer}
              placeholder="e.g. 133580"
              keyboardType="number-pad"
              suffix="km"
              colors={colors}
              spacing={spacing}
              radius={radius}
              fieldName="nextService"
              focusedField={focusedField}
              onFocus={setFocusedField}
              onBlur={() => setFocusedField(null)}
            />

            {hasAutoDate ? (
              <View
                style={{
                  flexDirection: "row",
                  gap: spacing.sm,
                  padding: spacing.md,
                  borderRadius: radius.sm,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: spacing.xl,
                }}
              >
                <Ionicons name="time-outline" size={18} color={colors.onSurfaceTertiary} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 17 }}>
                  {service} is reminded by time automatically -- next due{" "}
                  {autoNextServiceDate ?? `${autoDateIntervalMonths} months from the Date above`}
                  , no need to set it yourself.
                </Text>
              </View>
            ) : (
              <FormField
                label="Next Service (date)"
                value={nextServiceDate}
                onChangeText={setNextServiceDate}
                placeholder="DD.MM.YYYY"
                colors={colors}
                spacing={spacing}
                radius={radius}
                fieldName="nextServiceDate"
                focusedField={focusedField}
                onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
              />
            )}
          </>
        ) : (
          /* Batch mode: one Price + Next Service (km/date) block per
             active service, each keyed independently -- see
             serviceDetails. This is what keeps every generated entry's
             own urgency tracking correct (see getMaintenanceUrgency). */
          activeServices.map((line) => {
            const detail = getDetail(line.id);
            const { hasAutoDate: nameHasAutoDate, intervalMonths, autoDate } = getAutoDate(
              line.name,
              date,
            );

            return (
              <View
                key={line.id}
                style={{
                  marginBottom: spacing.xl,
                  padding: spacing.lg,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing.sm,
                    marginBottom: spacing.md,
                  }}
                >
                  {line.isCustom ? (
                    <TextInput
                      value={line.name}
                      onChangeText={(v) => renameLine(line.id, v)}
                      placeholder="Service name"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      style={[
                        {
                          flex: 1,
                          fontSize: 14,
                          fontWeight: "800",
                          color: colors.onSurface,
                          paddingVertical: 4,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                        },
                        Platform.OS === "web" && { outlineStyle: "none" as any },
                      ]}
                    />
                  ) : (
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: colors.onSurface,
                      }}
                    >
                      {line.name}
                    </Text>
                  )}

                  <Pressable
                    onPress={() => removeLine(line.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${line.name}`}
                  >
                    <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                  </Pressable>
                </View>

                <WarrantyToggle
                  value={detail.underWarranty}
                  onValueChange={(v) => updateDetail(line.id, { underWarranty: v })}
                  colors={colors}
                  spacing={spacing}
                  radius={radius}
                />

                {!detail.underWarranty ? (
                  <FormField
                    label="Price"
                    value={detail.price}
                    onChangeText={(v) => updateDetail(line.id, { price: v })}
                    placeholder="e.g. 380"
                    keyboardType="decimal-pad"
                    suffix="RON"
                    required
                    colors={colors}
                    spacing={spacing}
                    radius={radius}
                    fieldName={`price-${line.id}`}
                    focusedField={focusedField}
                    onFocus={setFocusedField}
                    onBlur={() => setFocusedField(null)}
                  />
                ) : null}

                {line.isCustom ? null : (
                  <>
                    <FormField
                      label="Next Service (km)"
                      value={detail.nextKm}
                      onChangeText={(v) => updateDetail(line.id, { nextKm: v })}
                      placeholder="e.g. 133580"
                      keyboardType="number-pad"
                      suffix="km"
                      colors={colors}
                      spacing={spacing}
                      radius={radius}
                      fieldName={`nextKm-${line.id}`}
                      focusedField={focusedField}
                      onFocus={setFocusedField}
                      onBlur={() => setFocusedField(null)}
                    />

                    {nameHasAutoDate ? (
                      <View
                        style={{
                          flexDirection: "row",
                          gap: spacing.sm,
                          padding: spacing.md,
                          borderRadius: radius.sm,
                          backgroundColor: "transparent",
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Ionicons name="time-outline" size={18} color={colors.onSurfaceTertiary} />
                        <Text style={{ flex: 1, fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 17 }}>
                          {line.name} is reminded by time automatically -- next due{" "}
                          {autoDate ?? `${intervalMonths} months from the Date above`}, no need to
                          set it yourself.
                        </Text>
                      </View>
                    ) : (
                      <FormField
                        label="Next Service (date)"
                        value={detail.nextDate}
                        onChangeText={(v) => updateDetail(line.id, { nextDate: v })}
                        placeholder="DD.MM.YYYY"
                        colors={colors}
                        spacing={spacing}
                        radius={radius}
                        fieldName={`nextDate-${line.id}`}
                        focusedField={focusedField}
                        onFocus={setFocusedField}
                        onBlur={() => setFocusedField(null)}
                      />
                    )}
                  </>
                )}
              </View>
            );
          })
        )}

        {/* Error */}

        {error ? (
          <View
            style={{
              marginTop: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.sm,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
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
          accessibilityLabel="Save maintenance"
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
            {isEditing
              ? "Save Changes"
              : isBatchMode && activeServices.length > 1
                ? `Save ${activeServices.length} Entries`
                : "Save Maintenance"}
          </Text>
        </Pressable>

        {/* Cancel */}

        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel maintenance"
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
            accessibilityLabel="Delete maintenance entry"
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

/** "Under warranty / recall" toggle -- when on, the Price field it sits
 * next to is hidden entirely and the entry saves with price 0 (see
 * validateMaintenanceEntry, which only requires a positive price when
 * this is off). Same row shape for both the single-service form and
 * each per-line card in a batch. */
function WarrantyToggle({
  value,
  onValueChange,
  colors,
  spacing,
  radius,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  colors: any;
  spacing: any;
  radius: any;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: spacing.md,
        borderRadius: radius.sm,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.xl,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurface }}>
        Under warranty / free
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
      />
    </View>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  suffix?: string;
  multiline?: boolean;
  /** Shows a red "*" next to the label -- only for fields that are
   * actually required to save (see validateMaintenanceEntry). */
  required?: boolean;
  /** Skips the label row and the outer bottom margin -- for a field
   * that's already labeled by a wrapper (e.g. the "Other" input sitting
   * next to its own Add button). */
  hideLabel?: boolean;
  colors: any;
  spacing: any;
  radius: any;
  fieldName: string;
  focusedField: string | null;
  onFocus: (field: string) => void;
  onBlur: () => void;
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  suffix,
  multiline = false,
  required = false,
  hideLabel = false,
  colors,
  spacing,
  radius,
  fieldName,
  focusedField,
  onFocus,
  onBlur,
}: FormFieldProps) {
  const isFocused = focusedField === fieldName;

  return (
    <View style={{ marginBottom: hideLabel ? 0 : spacing.xl }}>
      {!hideLabel ? (
        <Text
          style={{
            marginBottom: spacing.sm,
            fontSize: 12,
            fontWeight: "700",
            color: colors.onSurfaceTertiary,
          }}
        >
          {label}
          {required ? <Text style={{ color: colors.error }}> *</Text> : null}
        </Text>
      ) : null}

      <View
        style={{
          minHeight: multiline ? 90 : 52,
          borderRadius: radius.sm,
          backgroundColor: "transparent",
          borderWidth: isFocused ? 2 : 1,
          borderColor: isFocused
            ? colors.onSurface
            : colors.border,
          flexDirection: "row",
          alignItems: multiline
            ? "flex-start"
            : "center",
          paddingHorizontal: spacing.md,
          paddingVertical: multiline
            ? spacing.md
            : 0,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={
            colors.onSurfaceTertiary
          }
          keyboardType={keyboardType}
          multiline={multiline}
          textAlignVertical={
            multiline ? "top" : "center"
          }
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
    </View>
  );
}
