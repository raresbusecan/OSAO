import React, { useContext } from "react";
import { StyleSheet, type TextStyle } from "react-native";
import { TextScaleContext, fw } from "./theme";

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

// RN's own "am I inside another <Text>?" context. A nested Text with no
// fontWeight of its own must INHERIT its parent's family (a colored
// span inside a 600-weight line), not be forced back to Regular.
const TextAncestorContext = require("react-native/Libraries/Text/TextAncestorContext").default;

// RN's default Text size, for a style that doesn't set one.
const DEFAULT_SIZE = 14;

/** Settings > Aspect > Text: scale this text's size (and line height) by
 * `scale`. Only Plex text -- an icon font names its own family and keeps
 * its size -- and not a nested span without its own size, which already
 * inherits the scaled size from its parent. */
function scaled(flat: TextStyle, nested: boolean, scale: number): TextStyle | null {
  if (scale === 1) return null;
  if (flat.fontFamily && !String(flat.fontFamily).startsWith("IBMPlexSans")) return null;
  if (nested && flat.fontSize == null) return null;
  return {
    fontSize: Math.round((flat.fontSize ?? DEFAULT_SIZE) * scale * 2) / 2,
    ...(typeof flat.lineHeight === "number" ? { lineHeight: Math.round(flat.lineHeight * scale) } : null),
  };
}

function withPlex(style: any, nested: boolean, scale: number) {
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  const size = scaled(flat, nested, scale);
  if (flat.fontFamily || (nested && flat.fontWeight == null)) return size ? [style, size] : style;
  return [style, { ...fw(flat.fontWeight ?? "400"), fontWeight: "normal" as const, ...size }];
}

function patch(mod: { default: any }, name: "Text" | "TextInput") {
  const Original = mod.default;
  if (!Original || Original.__plexPatched) return;
  const Patched = (props: any) => {
    const nested = !!useContext(TextAncestorContext);
    const scale = useContext(TextScaleContext);
    return React.createElement(Original, { ...props, style: withPlex(props.style, nested, scale) });
  };
  // Hoist the original's statics (TextInput.State, which e.g.
  // react-native-gesture-handler's ScrollView reads on every keyboard
  // event; Text's own) as live getters -- without them the swapped-in
  // component threw "Cannot read property 'currentlyFocusedInput' of
  // undefined" as soon as the keyboard opened (qa-lead, 2026-11-01).
  // React's internals (a forwardRef object's $$typeof/render) must NOT
  // move onto a plain function component.
  const SKIP = new Set(["$$typeof", "render", "displayName", "length", "name", "prototype", "caller", "arguments", "__plexPatched"]);
  for (const key of Object.getOwnPropertyNames(Original)) {
    if (SKIP.has(key) || Object.prototype.hasOwnProperty.call(Patched, key)) continue;
    try {
      Object.defineProperty(Patched, key, { configurable: true, enumerable: true, get: () => Original[key] });
    } catch {}
  }
  Object.assign(Patched, { displayName: name, __plexPatched: true });
  // Since Expo SDK 58 the Text/TextInput modules export `default` as a
  // getter-only, NON-configurable property, so swapping it silently did
  // nothing (no Plex font, no text scaling on a phone). App code reads
  // `_reactNative.Text`, i.e. react-native's index, whose getters are
  // plain object-literal (configurable) ones -- redefine those. The
  // module swap stays as a fallback for bundles where it still works.
  try {
    Object.defineProperty(require("react-native"), name, { configurable: true, enumerable: true, get: () => Patched });
  } catch {}
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
