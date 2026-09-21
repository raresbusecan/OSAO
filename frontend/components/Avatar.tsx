import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/lib/theme";
import { initialsOf, colorForId } from "@/lib/avatar";

export type AvatarProps = {
  id: string | number;
  name: string;
  size?: number;
  /** Draws a ring matching the surface behind it, the way overlapping
   * avatar stacks separate each circle from the one underneath. */
  ringed?: boolean;
};

/** One initials circle, colored deterministically by id -- see
 * lib/avatar.ts. Used both standalone (an item row's "added by") and
 * stacked (a space's member list, see SpaceMembersModal / the Grocery
 * header). */
export function Avatar({ id, name, size = 28, ringed }: AvatarProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colorForId(id),
        alignItems: "center",
        justifyContent: "center",
        borderWidth: ringed ? 2 : 0,
        borderColor: colors.surface,
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: "800", color: "#FFFFFF" }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}
