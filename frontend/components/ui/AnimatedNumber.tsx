import React, { useEffect, useRef, useState } from "react";
import { Animated, Text, type StyleProp, type TextStyle } from "react-native";
import { motion, useReducedMotion } from "@/lib/motion";

export type AnimatedNumberProps = {
  value: number;
  /** Turns the in-between value into display text; defaults to a
   * Romanian-grouped integer ("2.340"). */
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
};

const defaultFormat = (n: number) => Math.round(n).toLocaleString("ro-RO");

/** A number that counts up to its value on first mount, then glides
 * between values when it changes -- so a total visibly reacts to an
 * entry being added instead of silently swapping digits. JS-driven
 * (text can't use the native driver); cheap for a handful of numbers. */
export function AnimatedNumber({ value, format = defaultFormat, style }: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(v));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    if (reduced) {
      anim.setValue(value);
      setShown(value);
      return;
    }
    const a = Animated.timing(anim, { toValue: value, useNativeDriver: false, ...motion.reveal });
    a.start();
    return () => a.stop();
  }, [value, reduced, anim]);

  return <Text style={[{ fontVariant: ["tabular-nums"] }, style]}>{format(shown)}</Text>;
}
