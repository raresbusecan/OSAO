import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { roCount } from "@/lib/format";
import { useAppMode } from "@/lib/appMode";
import { closeUpgradeSheet, useSimpleSheets } from "@/lib/simpleSheets";
import { notifyAction } from "@/lib/confirm";
import { Sheet } from "@/components/ui/Sheet";
import { Button, IconWell } from "@/components/ui/primitives";
import { spaceColors } from "@/lib/spaces/spaceProfile";

/**
 * "orgOS Complet" -- the upgrade sheet (mockup "Complet", orgOS Simplu).
 * Opened only by a teaser (components/simple/Teaser.tsx), never on launch.
 * Mounted once at the root (app/_layout.tsx), driven by lib/simpleSheets.
 *
 * TEST MODE: plans/prices don't exist yet. The prices read "Preț în
 * curând" and the primary CTA switches the app to the full mode
 * ("Vezi în Complet") so the two can be compared instantly. When real
 * plans exist this is where the purchase/trial flow goes.
 */
type Perk = { key: string; icon: React.ComponentProps<typeof Ionicons>["name"]; swatch: string; title: string; text: string };

// Swatches are feature identities here (budget = teal/money, car = blue,
// calendar load = pink like its heat scale, Acasă layout = purple).
const PERKS: Perk[] = [
  { key: "budget", icon: "wallet-outline", swatch: "teal", title: "Buget din venit", text: "Spui cât câștigi, iar noi îți arătăm cât mai poți cheltui, pe categorii." },
  { key: "car", icon: "car-outline", swatch: "blue", title: "Mașina, la leu", text: "Consum, cost pe km și cât te costă pe an." },
  { key: "calendar", icon: "calendar-outline", swatch: "pink", title: "Luna văzută din timp", text: "Vezi cât de plină e fiecare lună, înainte să vină." },
  { key: "home", icon: "grid-outline", swatch: "purple", title: "Acasă așa cum vrei", text: "Alegi și aranjezi cardurile, plus rate și credite." },
];

export function UpgradeSheetHost() {
  const { upgrade } = useSimpleSheets();
  return <UpgradeSheet visible={upgrade} onClose={closeUpgradeSheet} />;
}

function UpgradeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { setMode } = useAppMode();
  // Items the user added this calendar month (created_at, local month) --
  // the personalized headline. null = still loading / failed: generic copy.
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setCount(null);
    api
      .listItems()
      .then((items: any[]) => {
        if (!alive) return;
        const now = new Date();
        const n = (items ?? []).filter((it) => {
          const d = it?.created_at ? new Date(it.created_at) : null;
          return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length;
        setCount(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible]);

  const headline =
    count && count > 0
      ? `Ai adăugat ${roCount(count, "lucru", "lucruri")} luna asta. Hai să le facem să lucreze pentru tine.`
      : "Hai să facem ca datele tale să lucreze pentru tine.";

  const tryFull = () => {
    onClose();
    setMode("full");
    notifyAction("Acum vezi orgOS Complet", "Revii oricând la Simplu din Setări > Mod Simplu (test).");
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      testID="upgrade-sheet"
      footer={
        <View style={{ gap: spacing.xs }}>
          <Button testID="upgrade-try-full" label="Vezi în Complet" onPress={tryFull} />
          <Pressable
            testID="upgrade-not-now"
            onPress={onClose}
            accessibilityRole="button"
            style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>Nu acum</Text>
          </Pressable>
          <Text style={{ textAlign: "center", fontSize: 12, color: colors.onSurfaceTertiary }}>Datele tale rămân ale tale, indiferent de plan.</Text>
        </View>
      }
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="sparkles-outline" size={16} color={colors.onSurfaceSecondary} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSurfaceSecondary }}>orgOS Complet</Text>
        </View>
        <Text testID="upgrade-headline" style={{ fontSize: 22, lineHeight: 28, fontWeight: "600", color: colors.onSurface }}>
          {headline}
        </Text>
      </View>

      <View style={{ gap: 2 }}>
        {PERKS.map((p) => {
          const c = spaceColors(p.swatch, isDark);
          return (
            <View key={p.key} style={{ flexDirection: "row", gap: spacing.md, alignItems: "flex-start", paddingVertical: spacing.sm }}>
              <IconWell icon={p.icon} color={c?.color ?? colors.onSurfaceTertiary} tint={c?.tint} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.onSurface }}>{p.title}</Text>
                <Text style={{ fontSize: 13.5, lineHeight: 19, color: colors.onSurfaceTertiary }}>{p.text}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View
          accessible
          accessibilityLabel="Complet, preț în curând, tot ce e mai sus"
          style={{ flex: 1, borderRadius: radius.card, borderWidth: 2, borderColor: colors.onSurface, padding: spacing.md, gap: 2 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}>Complet</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>Preț în curând</Text>
          <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>Tot ce e mai sus</Text>
        </View>
        <View
          accessible
          accessibilityLabel="Avansat, în curând, plus AI și scanare documente"
          style={{ flex: 1, borderRadius: radius.card, borderWidth: 2, borderColor: colors.surfaceTertiary, backgroundColor: colors.surfaceTertiary, padding: spacing.md, gap: 2 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.onSurface }}>Avansat</Text>
            <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 10.5, fontWeight: "600", color: colors.onSurfaceSecondary }}>în curând</Text>
            </View>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurfaceTertiary }}>Preț în curând</Text>
          <Text style={{ fontSize: 12, color: colors.onSurfaceTertiary }}>+ AI și scanare documente</Text>
        </View>
      </View>
    </Sheet>
  );
}
