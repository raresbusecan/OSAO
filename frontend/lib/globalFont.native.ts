import React from "react";
import { StyleSheet, type TextStyle } from "react-native";
import { fw } from "./theme";

/**
 * Makes IBM Plex Sans the default for every <Text>/<TextInput> in the
 * app without touching ~100 files' worth of `fontWeight: "800"` styles.
 *
 * A custom font on native can't pick a weight from `fontWeight` (each
 * weight is its own family -- see theme.tsx's fw()), so this swaps each
 * component's export for a thin wrapper that reads the flattened style's
 * fontWeight, picks the matching Plex file, and resets fontWeight so
 * Android doesn't synthesize a fake bold on top. A style that already
 * names a fontFamily (icon fonts, anything deliberate) is left alone.
 *
 * Works because `react-native`'s index exposes Text/TextInput through
 * getters that re-read the module's `default` export on every access,
 * and every call site reads `Text` at render time. Must be imported
 * before the first render (top of app/_layout.tsx).
 */

function withPlex(style: any) {
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  if (flat.fontFamily) return style;
  return [style, { ...fw(flat.fontWeight ?? "400"), fontWeight: "normal" as const }];
}

function patch(mod: { default: any }, name: string) {
  const Original = mod.default;
  if (!Original || Original.__plexPatched) return;
  const Patched = (props: any) => React.createElement(Original, { ...props, style: withPlex(props.style) });
  Object.assign(Patched, { displayName: name, __plexPatched: true });
  // A transpiled ESM module can expose `default` as a getter-only
  // property; redefine it when that's allowed, and otherwise leave the
  // stock component in place (system font) rather than crash at startup.
  try {
    mod.default = Patched;
  } catch {
    try {
      Object.defineProperty(mod, "default", { configurable: true, enumerable: true, get: () => Patched });
    } catch {}
  }
}

patch(require("react-native/Libraries/Text/Text"), "Text");
patch(require("react-native/Libraries/Components/TextInput/TextInput"), "TextInput");
