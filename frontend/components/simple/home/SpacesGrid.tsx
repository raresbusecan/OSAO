import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { motion } from "@/lib/motion";
import { PressableScale } from "@/components/ui/PressableScale";
import { IconWell, hexToRgba } from "@/components/ui/primitives";
import { roCount, roNumber } from "@/lib/format";
import { dueStatus, type SpaceDue } from "@/lib/dashboard/spaceDue";
import {
  SPACE_BUTTON_FILL,
  SPACE_KIND_LABEL,
  SPACE_ON_FILL,
  spaceColors,
  spaceTextColor,
  type SpaceKind,
} from "@/lib/spaces/spaceProfile";
import { START_TEMPLATES, type StartTemplate } from "@/components/simple/home/StartPicker";

export type GridSpace = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  type?: string | null;
  kind: SpaceKind;
  /** GET /spaces' one headline number per kind (see SpaceController::index). */
  odometer?: number | null;
  monthUpcoming?: number | null;
  groceryLists?: number | null;
  expenseRecords?: number | null;
};

const TILE_HEIGHT = 116;

/**
 * Simplu Acasă's "Spațiile tale" (mockup "Acasă A · Spațiile sus"): a
 * two-column grid. A space the user has = a filled tile with its status;
 * a KIND the user doesn't have yet = a dashed "Adaugă" tile, always
 * there -- the only way to create another space in this mode (StartPicker
 * shows only before the first one).
 */
export function SpacesGrid({
  spaces,
  dueMap,
  toBuy,
  onOpen,
  onAdd,
}: {
  spaces: GridSpace[];
  dueMap: Map<string, SpaceDue>;
  toBuy: Record<string, number>;
  onOpen: (id: string) => void;
  onAdd: (t: StartTemplate) => void;
}) {
  const { colors } = useTheme();
  const have = new Set<SpaceKind>(spaces.map((s) => s.kind));
  const missing = START_TEMPLATES.filter((t) => !have.has(t.kind as SpaceKind));

  const tiles: React.ReactNode[] = [
    ...spaces.map((s) => <SpaceTile key={s.id} space={s} due={dueMap.get(s.id)} toBuy={toBuy[s.id] ?? 0} onOpen={onOpen} />),
    ...missing.map((t) => <AddTile key={`add-${t.kind}`} t={t} onAdd={onAdd} />),
  ];
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));

  return (
    <View testID="simple-home-spaces" style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginHorizontal: 4 }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface }}>Spațiile tale</Text>
        {missing.length > 0 ? (
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{START_TEMPLATES.length - missing.length} din {START_TEMPLATES.length}</Text>
        ) : null}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10 }}>
          {row}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

function SpaceTile({ space, due, toBuy, onOpen }: { space: GridSpace; due: SpaceDue | undefined; toBuy: number; onOpen: (id: string) => void }) {
  const { spacing, card, colors, radius, isDark } = useTheme();
  const muted = colors.onSurfaceTertiary;
  const c = spaceColors(space, isDark);
  const status = dueStatus(due);
  const detail =
    space.kind === "car" && Number(space.odometer) > 0
      ? `${roNumber(Number(space.odometer))} km`
      : space.kind === "home" && space.monthUpcoming != null
        ? Number(space.monthUpcoming) > 0 ? `${Number(space.monthUpcoming)} de făcut luna asta` : "Nimic de făcut"
        : space.kind === "grocery" && toBuy > 0
          ? `${toBuy} de cumpărat`
          : space.kind === "grocery" && space.groceryLists != null
            ? roCount(Number(space.groceryLists), "listă", "liste")
            : space.kind === "expenses" && space.expenseRecords != null
              ? roCount(Number(space.expenseRecords), "înregistrare", "înregistrări")
              : SPACE_KIND_LABEL[space.kind] ?? "Spațiu";
  const statusText = status?.text ?? "La zi";
  return (
    <PressableScale
      testID={`simple-home-space-${space.id}`}
      onPress={() => onOpen(space.id)}
      scaleTo={motion.scale.tile}
      accessibilityRole="button"
      accessibilityLabel={`Deschide ${space.name}, ${statusText}, ${detail}`}
      style={{ flex: 1, minHeight: TILE_HEIGHT, padding: 14, gap: 10, borderRadius: radius.card, ...card, justifyContent: "space-between" }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <IconWell icon={(space.icon || "folder-outline") as any} color={c?.color ?? muted} tint={c?.tint ?? colors.onSurface} size={40} />
        <Text
          style={{ flexShrink: 1, fontSize: 13, fontWeight: status ? "500" : "400", color: status ? (status.tone === "error" ? colors.error : colors.warning) : muted }}
          numberOfLines={1}
        >
          {statusText}
        </Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{space.name}</Text>
        <Text style={{ fontSize: 13, color: muted }} numberOfLines={1}>{detail}</Text>
      </View>
    </PressableScale>
  );
}

/** A kind without a space yet: dashed identity border + "Adaugă" pill. The
 * whole tile is ONE pressable; the pill is visual only. */
function AddTile({ t, onAdd }: { t: StartTemplate; onAdd: (t: StartTemplate) => void }) {
  const { spacing, colors, radius, isDark } = useTheme();
  const kind = t.kind as SpaceKind;
  const ink = SPACE_ON_FILL[kind] ?? "#FFFFFF";
  return (
    <PressableScale
      testID={`simple-home-add-${t.kind}`}
      onPress={() => onAdd(t)}
      scaleTo={motion.scale.tile}
      accessibilityRole="button"
      accessibilityLabel={`Adaugă spațiul ${t.name}. ${t.hint}`}
      style={{
        flex: 1,
        minHeight: TILE_HEIGHT,
        padding: 14,
        gap: 10,
        borderRadius: radius.card,
        justifyContent: "space-between",
        backgroundColor: hexToRgba(t.color, isDark ? 0.12 : 0.08),
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: hexToRgba(t.color, isDark ? 0.55 : 0.5),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <Ionicons name={t.icon as any} size={24} color={spaceTextColor(kind, isDark) ?? t.color} />
        <View style={{ height: 28, paddingLeft: 6, paddingRight: 10, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: SPACE_BUTTON_FILL[kind] ?? t.color }}>
          <Ionicons name="add" size={16} color={ink} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: ink }}>Adaugă</Text>
        </View>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{t.name}</Text>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{t.hint}</Text>
      </View>
    </PressableScale>
  );
}
