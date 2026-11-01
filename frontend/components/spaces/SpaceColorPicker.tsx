import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/lib/theme";
import { KIND_DEFAULT_COLOR, SPACE_PALETTE, paletteKey, type SpaceColorKey } from "@/lib/spaces/spaceProfile";

type PickerKind = keyof typeof KIND_DEFAULT_COLOR;

/** The colour a form should start on: the space's stored pick, else the
 * kind default. */
export function initialSpaceColor(stored: unknown, kind: PickerKind): SpaceColorKey {
  return paletteKey(stored) ?? KIND_DEFAULT_COLOR[kind];
}

/** What goes in `spaces.color`: null when the pick IS the kind default
 * (so the space keeps following its kind), else the palette key. */
export function spaceColorForApi(key: SpaceColorKey, kind: PickerKind): SpaceColorKey | null {
  return key === KIND_DEFAULT_COLOR[kind] ? null : key;
}

/**
 * "Culoare" -- one row of swatches from SPACE_PALETTE (wraps on narrow
 * screens). The selected swatch gets a ring + check; each swatch is a
 * 44px radio with its Romanian name as the label. Used by CarProfileForm,
 * HomeProfileForm and EditSpaceModal.
 */
export function SpaceColorPicker({
  value,
  kind,
  onChange,
  testID = "space-color",
}: {
  value: SpaceColorKey;
  kind: PickerKind;
  onChange: (key: SpaceColorKey) => void;
  testID?: string;
}) {
  const { spacing, colors } = useTheme();
  const kindDefault = KIND_DEFAULT_COLOR[kind];
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Culoarea spațiului</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Culoarea spațiului" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginHorizontal: -4 }}>
        {SPACE_PALETTE.map((sw) => {
          const selected = sw.key === value;
          return (
            <Pressable
              key={sw.key}
              testID={`${testID}-${sw.key}`}
              onPress={() => onChange(sw.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={sw.key === kindDefault ? `${sw.name} (implicită)` : sw.name}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  borderWidth: 2,
                  borderColor: selected ? colors.onSurface : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: sw.color, alignItems: "center", justifyContent: "center" }}>
                  {selected ? <Ionicons name="checkmark" size={16} color={sw.ink} /> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
