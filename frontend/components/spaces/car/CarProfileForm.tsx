import React, { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { useAppMode } from "@/lib/appMode";
import { api, apiErrorMessage } from "@/lib/api";
import { roNumber, parseLocaleNumber } from "@/lib/format";
import { odometerError } from "./CarOdometerSheet";
import { notifyAction } from "@/lib/confirm";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";
import { SpaceCreditToggle, afterSpaceCreditSaved, useSpaceCredit } from "@/components/spaces/SpaceCreditToggle";
import {
  carProfileName,
  carProfileToApiBody,
  carProfileFromApi,
  spaceColors,
  type CarProfile,
  type SpaceColorKey,
} from "@/lib/spaces/spaceProfile";
import { SpaceColorPicker, initialSpaceColor, spaceColorForApi } from "@/components/spaces/SpaceColorPicker";
import { SpaceThemeProvider } from "@/lib/spaces/spaceTheme";

export type CarProfileFormProps = {
  visible: boolean;
  mode: "create" | "edit";
  space?: { id: string | number; color?: string | null } | null;
  initialProfile?: CarProfile | null;
  onClose: () => void;
  onSaved: (space: any, profile: CarProfile) => void;
  /** Edit mode only: also show "Kilometraj" (Simplu's one "Editează
   * mașina" sheet, user decision 2026-10-15). `current` prefills it,
   * `minLogged` is the floor (same rules as CarOdometerSheet); saved via
   * PUT car-profile/odometer only when changed. */
  odometer?: { current: number; minLogged: number } | null;
};


/**
 * The dedicated Car form -- Make, Model, Color (optional), Year, Purchase
 * price -- used both to create a new Car space and to edit an existing
 * one. The space's display name is derived from Make alone (e.g. "BMW"),
 * never typed directly -- Model is shown separately, as CarDashboard's
 * own gray subtitle under the name, the same way Home shows its county.
 */
export function CarProfileForm({
  visible,
  mode,
  space,
  initialProfile,
  onClose,
  onSaved,
  odometer,
}: CarProfileFormProps) {
  const showKm = mode === "edit" && !!odometer;
  const [kmText, setKmText] = useState("");
  const [kmServerError, setKmServerError] = useState<string | null>(null);
  const { colors, spacing, isDark } = useTheme();
  // Simplu mode: Marcă, Model, An, rezervor -- no colour, price, credit or space colour.
  const { isSimple } = useAppMode();
  // The space's colour (spaces.color) -- previewed live by the whole sheet.
  const [spaceColor, setSpaceColor] = useState<SpaceColorKey>(initialSpaceColor(null, "car"));
  const tone = spaceColors(spaceColor, isDark)!;
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [tankCapacity, setTankCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  // Only true after a real Save attempt -- the Tank capacity warning must
  // never appear just because the field happens to be empty while the
  // user hasn't tried to submit yet.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // "În rate" -- create only; the name follows the make ("Leasing BMW").
  const credit = useSpaceCredit(make.trim() ? `Leasing ${make.trim()}` : "Leasing");
  const resetCredit = credit.reset;

  useEffect(() => {
    if (!visible) return;

    setSubmitAttempted(false);
    resetCredit();
    setKmText(odometer && odometer.current > 0 ? String(Math.round(odometer.current)) : "");
    setKmServerError(null);
    setSpaceColor(initialSpaceColor(mode === "edit" ? space?.color : null, "car"));

    // Editing shows exactly what was last saved -- persisted until the
    // next edit, never reset. Creating starts every field genuinely
    // empty -- no defaults silently pre-filled (not even Year/Price).
    if (initialProfile) {
      setMake(initialProfile.make);
      setModel(initialProfile.model);
      setColor(initialProfile.color ?? "");
      setYear(String(initialProfile.year));
      setPurchasePrice(String(initialProfile.purchasePrice));
      setTankCapacity(
        initialProfile.tankCapacity ? String(initialProfile.tankCapacity) : "",
      );
    } else {
      setMake("");
      setModel("");
      setColor("");
      setYear("");
      setPurchasePrice("");
      setTankCapacity("");
    }
    // Prefill once per open, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialProfile, resetCredit, mode, space?.color]);

  const tankCapacityMissing = tankCapacity.trim().length === 0;
  const kmValue = kmText ? Number(kmText) : null;
  const kmChanged = showKm && kmValue !== (odometer!.current > 0 ? Math.round(odometer!.current) : null);
  // An empty field = leave the km as it is.
  const kmError = showKm && kmChanged && kmText ? odometerError(kmValue, odometer!.minLogged) : null;

  const creditOn = mode === "create" && !isSimple && credit.on;
  const canSubmit =
    make.trim().length > 0 && model.trim().length > 0 && !tankCapacityMissing;
  // Save stays disabled while "În rate" is on and the credit isn't valid.
  const creditBlocked = creditOn && !!credit.error;

  const submit = async () => {
    if (creditBlocked) return;
    if (!canSubmit || kmError) {
      setSubmitAttempted(true);
      return;
    }

    const profile: CarProfile = {
      kind: "car",
      make: make.trim(),
      model: model.trim(),
      color: color.trim() || undefined,
      year: Number(year) || new Date().getFullYear(),
      purchasePrice: parseLocaleNumber(purchasePrice) || 0,
      tankCapacity: parseLocaleNumber(tankCapacity) || 0,
    };

    const derivedName = carProfileName(profile);

    // A second tap before `busy` re-renders the button must not send a
    // second create.
    if (savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    try {
      if (mode === "create") {
        // ONE request: space + profile (+ Cheltuieli "Default" + credit)
        // in one server transaction -- nothing is left behind on a 422.
        const created = await api.createSpace({
          name: derivedName,
          icon: "car-outline",
          color: spaceColorForApi(spaceColor, "car"),
          type: "car",
          profile: carProfileToApiBody(profile),
          ...(creditOn ? { credit: credit.apiBody } : {}),
        });
        onSaved(created.space, carProfileFromApi(created.profile) ?? profile);
        onClose();
        afterSpaceCreditSaved(created);
        return;
      }
      if (!space) return;

      const result = await api.updateSpace(space.id, { name: derivedName, color: spaceColorForApi(spaceColor, "car") });
      const targetSpace = result?.space ?? { ...space, name: derivedName };
      const profileResult = await api.saveCarProfile(
        targetSpace.id,
        carProfileToApiBody(profile),
      );
      let savedProfile = carProfileFromApi(profileResult?.profile) ?? profile;

      if (kmChanged && kmText && kmValue != null) {
        try {
          const res: any = await api.updateCarOdometer(String(targetSpace.id), kmValue);
          savedProfile = carProfileFromApi(res?.profile) ?? savedProfile;
        } catch (e) {
          // The name/details are saved; keep the sheet open on the km error.
          onSaved(targetSpace, savedProfile);
          setKmServerError(apiErrorMessage(e, "Nu am putut salva kilometrajul. Încearcă din nou.", "odometer"));
          return;
        }
      }

      onSaved(targetSpace, savedProfile);
      onClose();
    } catch (error: any) {
      notifyAction("Nu am putut salva", error?.message || "A apărut o eroare.");
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  const two = { flexDirection: "row" as const, gap: spacing.md };
  const half = { flex: 1 };

  return (
    <SpaceThemeProvider color={spaceColor}>
    <Sheet
      visible={visible}
      onClose={onClose}
      info="car.profile"
      title={mode === "create" ? "Mașină nouă" : "Editează mașina"}
      subtitle="Marca devine numele spațiului"
      icon="car-outline"
      tone={tone.color}
      footer={
        <Button
          testID="car-profile-save"
          label={mode === "create" ? "Adaugă mașina" : "Salvează"}
          tone={tone.fill}
          onPress={submit}
          loading={busy}
          disabled={creditBlocked}
        />
      }
    >
      <View style={two}>
        <View style={half}>
          <Field label="Marcă" value={make} onChangeText={setMake} placeholder="ex. BMW" tone={tone.color} error={submitAttempted && !make.trim() ? "Obligatoriu" : null} />
        </View>
        <View style={half}>
          <Field label="Model" value={model} onChangeText={setModel} placeholder="ex. 340d" tone={tone.color} error={submitAttempted && !model.trim() ? "Obligatoriu" : null} />
        </View>
      </View>
      {isSimple ? (
        <Field label="An" value={year} onChangeText={setYear} placeholder="ex. 2020" keyboardType="number-pad" tone={tone.color} />
      ) : (
        <View style={two}>
          <View style={half}>
            <Field label="An" value={year} onChangeText={setYear} placeholder="ex. 2020" keyboardType="number-pad" tone={tone.color} />
          </View>
          <View style={half}>
            <Field label="Culoare (opțional)" value={color} onChangeText={setColor} placeholder="ex. Negru" tone={tone.color} />
          </View>
        </View>
      )}
      {showKm ? (
        <Field
          testID="car-profile-odometer"
          label="Kilometraj"
          value={kmText}
          // Whole km only, like CarOdometerSheet.
          onChangeText={(t) => {
            setKmText(t.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9));
            setKmServerError(null);
          }}
          placeholder="0"
          keyboardType="number-pad"
          suffix="km"
          tone={tone.color}
          error={kmServerError ?? (submitAttempted ? kmError : null)}
          hint={odometer!.minLogged > 0 ? `Cel puțin ${roNumber(odometer!.minLogged)} km (cel mai mare înregistrat).` : null}
        />
      ) : null}
      <Field
        label="Capacitate rezervor"
        value={tankCapacity}
        onChangeText={setTankCapacity}
        placeholder="ex. 57"
        keyboardType="decimal-pad"
        suffix="l"
        tone={tone.color}
        error={submitAttempted && tankCapacityMissing ? "Obligatoriu: consumul se calculează pe baza ei." : null}
        hint="Folosită la calculul consumului."
      />
      {isSimple ? null : (
        <>
          <Field
            label="Preț de cumpărare (opțional)"
            value={purchasePrice}
            onChangeText={setPurchasePrice}
            placeholder="0"
            keyboardType="decimal-pad"
            suffix="lei"
            tone={tone.color}
          />
          <SpaceColorPicker kind="car" value={spaceColor} onChange={setSpaceColor} />
        </>
      )}
      {mode === "create" && !isSimple ? <SpaceCreditToggle kind="car" credit={credit} /> : null}
      {creditBlocked ? (
        <Text testID="car-credit-missing" style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{credit.error}</Text>
      ) : null}
    </Sheet>
    </SpaceThemeProvider>
  );
}
