import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { motion } from "@/lib/motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { IconWell } from "@/components/ui/primitives";
import { SPACE_IDENTITY_COLORS, spaceTextColor, type SpaceKind } from "@/lib/spaces/spaceProfile";

/** The 4 kinds a first space can be. name/icon/color are the SAME values
 * app/(tabs)/spaces.tsx's TEMPLATES pass to the create flows; label/hint
 * are the Simplu mockup's ("Main.dc.html") wording. */
export const START_TEMPLATES = [
  { kind: "car", name: "Mașină", icon: "car-outline", color: SPACE_IDENTITY_COLORS.car!, label: "Mașina", hint: "ITP, RCA, revizii, plinuri" },
  { kind: "home", name: "Casă", icon: "home-outline", color: SPACE_IDENTITY_COLORS.home!, label: "Casa", hint: "Facturi, sarcini, ce se termină" },
  { kind: "grocery", name: "Cumpărături", icon: "cart-outline", color: SPACE_IDENTITY_COLORS.grocery!, label: "Cumpărăturile", hint: "Liste, și împreună cu alții" },
  { kind: "expenses", name: "Cheltuieli", icon: "receipt-outline", color: SPACE_IDENTITY_COLORS.expenses!, label: "Cheltuielile", hint: "Cât dai pe lună, pe scurt" },
] as const;

export type StartTemplate = (typeof START_TEMPLATES)[number];

/** Acasă before the first space: "Ce vrei să ții în ordine?" + 2x2 kind
 * tiles + two quiet lines about what the app does. */
export function StartPicker({ onPick }: { onPick: (t: StartTemplate) => void }) {
  const { colors, spacing, radius } = useTheme();
  const rows = [START_TEMPLATES.slice(0, 2), START_TEMPLATES.slice(2, 4)];
  return (
    <View style={{ gap: spacing.section }}>
      <View testID="simple-home-start" style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingTop: spacing.section, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface }}>Ce vrei să ții în ordine?</Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.onSurfaceTertiary }}>Alege unul ca să începi. Pe celelalte le adaugi oricând.</Text>
        </View>
        <View style={{ gap: 10 }}>
          {rows.map((row, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              {row.map((t) => (
                <StartTile key={t.kind} t={t} onPick={onPick} />
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.md, paddingHorizontal: 4 }}>
        <InfoLine icon="notifications-outline" text="Îți amintim la timp de ITP, RCA, facturi și ce ai de făcut prin casă." />
        <InfoLine icon="card-outline" text="Vezi dintr-o privire cât ai cheltuit luna asta." />
      </View>
    </View>
  );
}

function StartTile({ t, onPick }: { t: StartTemplate; onPick: (t: StartTemplate) => void }) {
  const { colors, radius, isDark } = useTheme();
  const kind = t.kind as SpaceKind;
  return (
    <PressableScale
      testID={`simple-home-start-${t.kind}`}
      onPress={() => onPick(t)}
      scaleTo={motion.scale.tile}
      accessibilityRole="button"
      accessibilityLabel={`${t.label}. ${t.hint}`}
      style={{ flex: 1, minHeight: 132, padding: 14, gap: 10, borderRadius: radius.card, backgroundColor: colors.surface }}
    >
      <IconWell icon={t.icon as any} color={t.color} tint={spaceTextColor(kind, isDark) ?? t.color} size={40} />
      <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{t.label}</Text>
      <Text style={{ fontSize: 12.5, lineHeight: 17, color: colors.onSurfaceTertiary }}>{t.hint}</Text>
    </PressableScale>
  );
}

function InfoLine({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={18} color={colors.onSurfaceSecondary} />
      </View>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary, paddingTop: 5 }}>{text}</Text>
    </View>
  );
}
