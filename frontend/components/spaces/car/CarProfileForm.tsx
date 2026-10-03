import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field } from "@/components/ui/primitives";
import {
  carProfileName,
  carProfileToApiBody,
  carProfileFromApi,
  SPACE_IDENTITY_COLORS,
  SPACE_BUTTON_FILL,
  type CarProfile,
} from "@/lib/spaces/spaceProfile";

export type CarProfileFormProps = {
  visible: boolean;
  mode: "create" | "edit";
  space?: { id: string | number } | null;
  initialProfile?: CarProfile | null;
  onClose: () => void;
  onSaved: (space: any, profile: CarProfile) => void;
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
}: CarProfileFormProps) {
  const { spacing } = useTheme();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [tankCapacity, setTankCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  // Only true after a real Save attempt -- the Tank capacity warning must
  // never appear just because the field happens to be empty while the
  // user hasn't tried to submit yet.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!visible) return;

    setSubmitAttempted(false);

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
  }, [visible, initialProfile]);

  const tankCapacityMissing = tankCapacity.trim().length === 0;

  const canSubmit =
    make.trim().length > 0 && model.trim().length > 0 && !tankCapacityMissing;

  const submit = async () => {
    if (!canSubmit) {
      setSubmitAttempted(true);
      return;
    }

    const profile: CarProfile = {
      kind: "car",
      make: make.trim(),
      model: model.trim(),
      color: color.trim() || undefined,
      year: Number(year) || new Date().getFullYear(),
      purchasePrice: Number(purchasePrice.replace(",", ".")) || 0,
      tankCapacity: Number(tankCapacity.replace(",", ".")) || 0,
    };

    const derivedName = carProfileName(profile);

    setBusy(true);
    try {
      let targetSpace: any;

      if (mode === "create") {
        const created = await api.createSpace({
          name: derivedName,
          icon: "car-outline",
          color: "#111111",
          type: "car",
        });
        targetSpace = created?.space ?? created;
      } else if (space) {
        const result = await api.updateSpace(space.id, { name: derivedName });
        targetSpace = result?.space ?? { ...space, name: derivedName };
      } else {
        return;
      }

      const profileResult = await api.saveCarProfile(
        targetSpace.id,
        carProfileToApiBody(profile),
      );
      const savedProfile = carProfileFromApi(profileResult?.profile) ?? profile;

      onSaved(targetSpace, savedProfile);
      onClose();
    } catch (error: any) {
      notifyAction("Nu am putut salva", error?.message || "A apărut o eroare.");
    } finally {
      setBusy(false);
    }
  };

  const two = { flexDirection: "row" as const, gap: spacing.md };
  const half = { flex: 1 };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={mode === "create" ? "Mașină nouă" : "Editează mașina"}
      subtitle="Marca devine numele spațiului"
      icon="car-outline"
      tone={SPACE_IDENTITY_COLORS.car}
      footer={
        <Button
          testID="car-profile-save"
          label={mode === "create" ? "Adaugă mașina" : "Salvează"}
          tone={SPACE_BUTTON_FILL.car}
          onPress={submit}
          loading={busy}
        />
      }
    >
      <View style={two}>
        <View style={half}>
          <Field label="Marcă" value={make} onChangeText={setMake} placeholder="ex. BMW" tone={SPACE_IDENTITY_COLORS.car} error={submitAttempted && !make.trim() ? "Obligatoriu" : null} />
        </View>
        <View style={half}>
          <Field label="Model" value={model} onChangeText={setModel} placeholder="ex. 340d" tone={SPACE_IDENTITY_COLORS.car} error={submitAttempted && !model.trim() ? "Obligatoriu" : null} />
        </View>
      </View>
      <View style={two}>
        <View style={half}>
          <Field label="An" value={year} onChangeText={setYear} placeholder="ex. 2020" keyboardType="number-pad" tone={SPACE_IDENTITY_COLORS.car} />
        </View>
        <View style={half}>
          <Field label="Culoare (opțional)" value={color} onChangeText={setColor} placeholder="ex. Negru" tone={SPACE_IDENTITY_COLORS.car} />
        </View>
      </View>
      <Field
        label="Capacitate rezervor"
        value={tankCapacity}
        onChangeText={setTankCapacity}
        placeholder="ex. 57"
        keyboardType="decimal-pad"
        suffix="l"
        tone={SPACE_IDENTITY_COLORS.car}
        error={submitAttempted && tankCapacityMissing ? "Obligatoriu: consumul se calculează pe baza ei." : null}
        hint="Folosită la calculul consumului."
      />
      <Field
        label="Preț de cumpărare (opțional)"
        value={purchasePrice}
        onChangeText={setPurchasePrice}
        placeholder="0"
        keyboardType="decimal-pad"
        suffix="lei"
        tone={SPACE_IDENTITY_COLORS.car}
      />
    </Sheet>
  );
}
