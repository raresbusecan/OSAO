import React, { useRef } from "react";
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { motion, useReducedMotion } from "@/lib/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** How far it squeezes while held -- 1 turns the effect off. */
  scaleTo?: number;
};

/** A Pressable that squeezes slightly while held and springs back on
 * release -- the redesign's standard press feedback for cards, rows and
 * buttons. Drop-in for Pressable, except `style` must be a plain style
 * (not the `({ pressed }) => ...` function form). */
export function PressableScale({ style, scaleTo = motion.pressScale, onPressIn, onPressOut, disabled, ...rest }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  const to = (value: number, config: { speed: number; bounciness: number }) => {
    if (reduced) return;
    Animated.spring(scale, { toValue: value, useNativeDriver: true, ...config }).start();
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        to(scaleTo, motion.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1, motion.release);
        onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale }] }]}
    />
  );
}
