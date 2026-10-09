import React, { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { notifyAction } from "@/lib/confirm";
import { Sheet } from "@/components/ui/Sheet";
import { Group, IconWell, Button } from "@/components/ui/primitives";
import { SPACE_IDENTITY_COLORS, SPACE_KIND_LABEL, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { parseAmount, roundSuggested, envelopeStatus } from "@/lib/budget/plan";
import { lei } from "@/lib/format";

type SpaceMeta = { kind: SpaceKind; label: string; icon: any };

/**
 * "Reîmparte" -- splits the Necesități envelope over the spaces, prefilled
 * with GET /budget's `suggested` (base = what each space usually costs,
 * recurring bills as a floor, rounded to 10). Every amount stays editable;
 * one PUT /budget/limits saves them all in one go.
 */
export function ResplitSheet({
  visible,
  onClose,
  envelope,
  suggested,
  spaces,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  envelope: number;
  suggested: Record<string, number> | null;
  spaces: SpaceMeta[];
  onSaved: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Reîmparte necesitățile" subtitle={`${lei(Math.round(envelope))} pe spații, după cât cheltuiești în fiecare`} info="budget.spaces" testID="resplit-sheet">
      {visible ? <ResplitBody envelope={envelope} suggested={suggested} spaces={spaces} onClose={onClose} onSaved={onSaved} /> : null}
    </Sheet>
  );
}

function ResplitBody({ envelope, suggested, spaces, onClose, onSaved }: { envelope: number; suggested: Record<string, number> | null; spaces: SpaceMeta[]; onClose: () => void; onSaved: () => void }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const [values, setValues] = useState<Record<string, string>>(() => {
    // Whole lei that add up exactly to the envelope as shown.
    const rounded = roundSuggested(suggested, envelope);
    const out: Record<string, string> = {};
    spaces.forEach((s) => {
      out[s.label] = String(rounded?.[s.label] ?? 0);
    });
    return out;
  });
  const [saving, setSaving] = useState(false);

  // An emptied or unreadable field blocks saving (an explicit 0 is fine)
  // -- it used to be saved as 0 without a word.
  const parsed = spaces.map((s) => parseAmount(values[s.label] ?? ""));
  const invalid = spaces.map((_, i) => !(Number.isFinite(parsed[i]) && parsed[i] >= 0));
  const hasInvalid = invalid.some(Boolean);
  const amounts = parsed.map((n, i) => (invalid[i] ? 0 : n));
  const total = amounts.reduce((a, b) => a + b, 0);
  const diff = Math.round((envelope - total) * 100) / 100;
  // < 1 leu off counts as exactly split (fractional envelopes).
  const status = envelopeStatus(diff);

  const save = async () => {
    if (hasInvalid) return;
    setSaving(true);
    try {
      await api.saveBudgetLimits(spaces.map((s, i) => ({ category: s.label, monthly_limit: amounts[i] })));
      onSaved();
      onClose();
    } catch (error: any) {
      notifyAction("Nu am putut salva bugetele", error?.message || "A apărut o eroare.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Group inset={62}>
        {spaces.map((s) => {
          const color = SPACE_IDENTITY_COLORS[s.kind] ?? colors.onSurfaceTertiary;
          const tint = spaceTextColor(s.kind, isDark) ?? color;
          const i = spaces.indexOf(s);
          return (
            <View key={s.label} style={{ paddingHorizontal: spacing.lg, paddingVertical: invalid[i] ? 8 : 0, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 60 }}>
              <IconWell icon={s.icon} color={color} tint={tint} size={34} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: colors.onSurface }} numberOfLines={1}>{SPACE_KIND_LABEL[s.kind] ?? s.label}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.segmentActive, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, minWidth: 116, borderWidth: invalid[i] ? 1 : 0, borderColor: colors.error }}>
                <TextInput
                  testID={`resplit-input-${s.label}`}
                  value={values[s.label] ?? ""}
                  onChangeText={(t) => setValues((v) => ({ ...v, [s.label]: t }))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Bugetul pentru ${SPACE_KIND_LABEL[s.kind] ?? s.label}`}
                  style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface, textAlign: "right", paddingVertical: 0 }}
                />
                <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary, marginLeft: 6 }}>lei</Text>
              </View>
            </View>
            {invalid[i] ? (
              <Text testID={`resplit-error-${s.label}`} style={{ fontSize: 13, color: colors.error, textAlign: "right" }}>
                {(values[s.label] ?? "").trim() ? "Sumă invalidă" : "Scrie o sumă (poate fi 0)"}
              </Text>
            ) : null}
            </View>
          );
        })}
      </Group>

      <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 4 }}>
        <Ionicons name={status === "exact" ? "checkmark" : status === "under" ? "ellipse-outline" : "alert-circle-outline"} size={16} color={status === "exact" ? colors.success : status === "under" ? colors.onSurfaceTertiary : colors.warning} />
        <Text style={{ flex: 1, fontSize: 13, color: status === "over" ? colors.warning : colors.onSurfaceTertiary }}>
          {status === "exact"
            ? `Împărțit: ${lei(Math.round(total))} din ${lei(Math.round(envelope))}`
            : status === "under"
              ? `Împărțit: ${lei(Math.round(total))} din ${lei(Math.round(envelope))} · Nealocat ${lei(Math.round(diff))}`
              : `Spațiile trec de necesități cu ${lei(Math.round(-diff))}`}
        </Text>
      </View>

      <Button testID="resplit-save" label="Salvează bugetele" onPress={save} loading={saving} disabled={spaces.length === 0 || hasInvalid} />
    </>
  );
}
