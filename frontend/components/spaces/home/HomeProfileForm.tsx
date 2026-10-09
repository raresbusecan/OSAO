import React, { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Segmented } from "@/components/ui/primitives";
import { SpaceCreditToggle, afterSpaceCreditSaved, useSpaceCredit } from "@/components/spaces/SpaceCreditToggle";
import {
  homeProfileName,
  homeProfileToApiBody,
  homeProfileFromApi,
  SPACE_IDENTITY_COLORS,
  SPACE_BUTTON_FILL,
  type HomeProfile,
} from "@/lib/spaces/spaceProfile";

export type HomeProfileFormProps = {
  visible: boolean;
  mode: "create" | "edit";
  space?: { id: string | number } | null;
  initialProfile?: HomeProfile | null;
  onClose: () => void;
  onSaved: (space: any, profile: HomeProfile) => void;
};

/**
 * The dedicated Home form -- County, City/Village, and a Bought/Inherited
 * toggle that reveals a purchase-price field only when "Bought" is on.
 * The space's display name is derived from the city alone (e.g. "Băiuț"),
 * never typed directly.
 */
export function HomeProfileForm({
  visible,
  mode,
  space,
  initialProfile,
  onClose,
  onSaved,
}: HomeProfileFormProps) {
  const { colors } = useTheme();
  const [county, setCounty] = useState("");
  const [city, setCity] = useState("");
  const [bought, setBought] = useState(true);
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  // "În rate" -- create only, and only for a bought home; the name
  // follows the locality ("Credit Băiuț").
  const credit = useSpaceCredit(city.trim() ? `Credit ${city.trim()}` : "Credit casă");
  const resetCredit = credit.reset;

  useEffect(() => {
    if (!visible) return;
    resetCredit();

    if (initialProfile) {
      setCounty(initialProfile.county);
      setCity(initialProfile.city);
      setBought(initialProfile.ownership === "bought");
      setPurchasePrice(String(initialProfile.purchasePrice ?? 0));
    } else {
      setCounty("");
      setCity("");
      setBought(true);
      setPurchasePrice("0");
    }
  }, [visible, initialProfile, resetCredit]);

  const creditOn = mode === "create" && bought && credit.on;
  // Save stays disabled while "În rate" is on and the credit isn't valid.
  const creditBlocked = creditOn && !!credit.error;
  const canSubmit = county.trim().length > 0 && city.trim().length > 0 && !creditBlocked;

  const submit = async () => {
    if (!canSubmit) return;

    const profile: HomeProfile = {
      kind: "home",
      county: county.trim(),
      city: city.trim(),
      ownership: bought ? "bought" : "inherited",
      ...(bought ? { purchasePrice: Number(purchasePrice.replace(",", ".")) || 0 } : {}),
    };

    const derivedName = homeProfileName(profile);

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
          icon: "home-outline",
          color: "#374151",
          type: "home",
          profile: homeProfileToApiBody(profile),
          ...(creditOn ? { credit: credit.apiBody } : {}),
        });
        onSaved(created.space, homeProfileFromApi(created.profile) ?? profile);
        onClose();
        afterSpaceCreditSaved(created);
        return;
      }
      if (!space) return;

      const result = await api.updateSpace(space.id, { name: derivedName });
      const targetSpace = result?.space ?? { ...space, name: derivedName };
      const profileResult = await api.saveHomeProfile(
        targetSpace.id,
        homeProfileToApiBody(profile),
      );
      const savedProfile = homeProfileFromApi(profileResult?.profile) ?? profile;

      onSaved(targetSpace, savedProfile);
      onClose();
    } catch (error: any) {
      notifyAction("Nu am putut salva", error?.message || "A apărut o eroare.");
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  const tone = SPACE_IDENTITY_COLORS.home;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      info="home.profile"
      title={mode === "create" ? "Casă nouă" : "Editează casa"}
      subtitle="Localitatea devine numele spațiului"
      icon="home-outline"
      tone={tone}
      footer={
        <Button
          testID="home-profile-save"
          label={mode === "create" ? "Adaugă casa" : "Salvează"}
          tone={SPACE_BUTTON_FILL.home}
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
        />
      }
    >
      <Field label="Județ" value={county} onChangeText={setCounty} placeholder="ex. Maramureș" tone={tone} />
      <Field label="Localitate" value={city} onChangeText={setCity} placeholder="ex. Băiuț" tone={tone} />
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Cum ai obținut-o</Text>
        <Segmented
          testIDPrefix="home-profile-ownership"
          options={[
            { key: "bought", label: "Cumpărată" },
            { key: "inherited", label: "Moștenită" },
          ]}
          value={bought ? "bought" : "inherited"}
          onChange={(k) => setBought(k === "bought")}
        />
      </View>
      {bought ? (
        <Field
          label="Preț de cumpărare (opțional)"
          value={purchasePrice}
          onChangeText={setPurchasePrice}
          placeholder="0"
          keyboardType="decimal-pad"
          suffix="lei"
          tone={tone}
        />
      ) : null}
      {mode === "create" && bought ? <SpaceCreditToggle kind="home" credit={credit} /> : null}
      {creditBlocked ? (
        <Text testID="home-credit-missing" style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{credit.error}</Text>
      ) : null}
    </Sheet>
  );
}
