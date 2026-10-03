import React, { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { motion, useReducedMotion } from "@/lib/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** How far it squeezes while held -- see motion.scale (control/tile/
   * card). 1 turns the squeeze off (rows inside a grouped card). */
  scaleTo?: number;
  /** Merged over `style` while held -- e.g. a row's highlight color. */
  pressedStyle?: StyleProp<ViewStyle>;
};

/** A Pressable that squeezes slightly while held and springs back on
 * release -- the redesign's standard press feedback for cards, tiles and
 * buttons. Drop-in for Pressable, except `style` must be a plain style
 * (not the `({ pressed }) => ...` function form). A caller's own
 * `transform` is kept and the scale is appended to it. */
export function PressableScale({
  style,
  scaleTo = motion.scale.tile,
  pressedStyle,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const animate = scaleTo !== 1 && !reduced;

  const to = (value: number, config: { speed: number; bounciness: number }) => {
    if (!animate) return;
    Animated.spring(scale, { toValue: value, useNativeDriver: true, ...config }).start();
  };

  const flat = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const ownTransform = (flat.transform as any[]) ?? [];

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (pressedStyle) setPressed(true);
        to(scaleTo, motion.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (pressedStyle) setPressed(false);
        to(1, motion.release);
        onPressOut?.(e);
      }}
      style={[style, pressed ? pressedStyle : null, animate ? { transform: [...ownTransform, { scale }] } : null]}
    />
  );
}
