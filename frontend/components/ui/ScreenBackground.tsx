import React, { useId } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { BACKGROUND_PALETTES, useTheme } from "@/lib/theme";
import { useSpaceTint } from "@/lib/spaces/spaceTheme";

/**
 * The page layer behind a screen, per Settings > Aspect > Fundal: plain
 * page colour, a colour wash from the top, or soft colour blobs (what
 * makes the "Liquid" card style read as glass), in the Settings > Culori
 * palette (BACKGROUND_PALETTES). Drop it in as the FIRST
 * child of a screen root (absolute, untouchable, no layout effect);
 * SwipeBackView already carries one for every sub-page.
 *
 * Colour stays faint on purpose: secondary text sits straight on this
 * layer (section headers, dates), so even full strength keeps
 * onSurfaceTertiary readable -- light tops out at 30% blob opacity,
 * dark at 28%.
 */
export function ScreenBackground() {
  const { colors, isDark, layout, cardStyle } = useTheme();
  // Glass needs colour behind it: with Liquid on and Fundal = Simplu,
  // show blobs anyway, as strong as the liquid.
  const glassFallback = layout.background === "plain" && cardStyle.liquid > 0;
  const background = glassFallback ? "blobs" : layout.background;
  const strength = glassFallback ? 0.3 + 0.5 * cardStyle.liquid : layout.backgroundStrength;
  const tint = useSpaceTint();
  const { width, height } = useWindowDimensions();
  // SVG ids are document-global on web; one per instance.
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");

  if (background === "plain") {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />;
  }

  const s = strength;
  const alpha = isDark ? 0.06 + 0.22 * s : 0.08 + 0.22 * s;
  const palette = BACKGROUND_PALETTES.find((p) => p.id === layout.palette) ?? BACKGROUND_PALETTES[0];
  const base = isDark ? palette.dark : palette.light;
  // "După Spațiu": inside a space its own colour leads; any other
  // palette is the same everywhere.
  const [a, b, c] = palette.id === "space" && tint ? [tint, base[1], base[2]] : base;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {background === "gradient" ? (
          <>
            <Defs>
              <LinearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={a} stopOpacity={alpha} />
                <Stop offset="0.65" stopColor={a} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}w)`} />
          </>
        ) : (
          <>
            <Defs>
              {[a, b, c].map((col, i) => (
                <RadialGradient key={i} id={`${id}b${i}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={col} stopOpacity={alpha} />
                  <Stop offset="1" stopColor={col} stopOpacity={0} />
                </RadialGradient>
              ))}
            </Defs>
            <Circle cx={width * 0.1} cy={height * 0.1} r={width * 0.8} fill={`url(#${id}b0)`} />
            <Circle cx={width * 1.0} cy={height * 0.48} r={width * 0.75} fill={`url(#${id}b1)`} />
            <Circle cx={width * 0.25} cy={height * 0.92} r={width * 0.85} fill={`url(#${id}b2)`} />
          </>
        )}
      </Svg>
    </View>
  );
}
