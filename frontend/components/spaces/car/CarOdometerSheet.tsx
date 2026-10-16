import React, { useEffect, useState } from "react";

import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";
import { api, apiErrorMessage } from "@/lib/api";
import { roNumber } from "@/lib/format";
import {
  carProfileFromApi,
  type CarProfile,
} from "@/lib/spaces/spaceProfile";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";

/** Same cap as the server (CarProfile::ODOMETER_MAX). */
export const ODOMETER_MAX = 2_000_000;

/** Client-side copy of the server's rules (SpaceController::
 * updateCarOdometer) -- null = OK. `minLogged` = the highest reading on a
 * fuel/service/expense entry (getLoggedOdometer). */
export function odometerError(value: number | null, minLogged: number): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return "Kilometrajul trebuie să fie mai mare decât 0.";
  if (value > ODOMETER_MAX) return `Kilometrajul nu poate depăși ${roNumber(ODOMETER_MAX)} km.`;
  if (value < minLogged) {
    return `Nu poate fi mai mic decât ${roNumber(minLogged)} km, cât e înregistrat la ultima alimentare/service.`;
  }
  return null;
}

/**
 * "Actualizează kilometrajul" -- opened from the Mașină top card (tap or
 * long-press on the km, or the pencil next to it). One whole-km field,
 * prefilled with the current odometer; saves through
 * PUT /spaces/:id/car-profile/odometer and hands the saved profile back.
 */
export function CarOdometerSheet({
  visible,
  spaceId,
  currentOdometer,
  minLogged,
  onClose,
  onSaved,
}: {
  visible: boolean;
  spaceId: string;
  currentOdometer: number;
  minLogged: number;
  onClose: () => void;
  onSaved: (profile: CarProfile) => void;
}) {
  const carColors = useSpaceColors("car");
  const [text, setText] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fresh every time it opens -- prefilled with what the card shows.
  useEffect(() => {
    if (!visible) return;
    setText(currentOdometer > 0 ? String(Math.round(currentOdometer)) : "");
    setAttempted(false);
    setServerError(null);
    setBusy(false);
  }, [visible, currentOdometer]);

  const value = text ? Number(text) : null;
  const localError = odometerError(value, minLogged);
  const shownError = serverError ?? (attempted ? localError : null);

  const submit = async () => {
    setAttempted(true);
    setServerError(null);
    if (localError || value == null) return;
    setBusy(true);
    try {
      const res: any = await api.updateCarOdometer(spaceId, value);
      const saved = carProfileFromApi(res?.profile);
      if (saved) onSaved(saved);
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, "Nu am putut salva kilometrajul. Încearcă din nou.", "odometer"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      info="car.odometer"
      title="Actualizează kilometrajul"
      subtitle="Cât arată acum bordul"
      icon="speedometer-outline"
      tone={carColors.color}
      testID="car-odometer-sheet"
      footer={<Button testID="car-odometer-save" label="Salvează" tone={carColors.fill} onPress={submit} loading={busy} />}
    >
      <Field
        testID="car-odometer-input"
        label="Kilometraj"
        value={text}
        // Whole km only: anything that isn't a digit (a typed "." or space
        // as a thousands separator, a decimal comma) is dropped.
        onChangeText={(t) => {
          setText(t.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9));
          setServerError(null);
        }}
        placeholder="0"
        keyboardType="number-pad"
        big
        suffix="km"
        tone={carColors.color}
        error={shownError}
        hint={minLogged > 0 ? `Cel puțin ${roNumber(minLogged)} km (cel mai mare înregistrat).` : null}
        returnKeyType="done"
        onSubmitEditing={submit}
        selectTextOnFocus
      />
    </Sheet>
  );
}
