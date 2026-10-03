/**
 * Web counterpart of globalFont.native.ts. react-native-web's Text export
 * is a non-configurable getter, so the component swap the native side
 * does isn't possible here. Web CAN pick a face from font-weight though,
 * so register the four Plex files under one family name and make it the
 * default for Text (rendered as `div[dir=auto]`) and inputs -- icon fonts
 * render as spans with their own family and are left alone. Web is a
 * dev-only surface (screenshots, quick checks), not what ships.
 */
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from "@expo-google-fonts/ibm-plex-sans";

const src = (asset: unknown) => (typeof asset === "string" ? asset : (asset as { uri?: string })?.uri ?? "");

if (typeof document !== "undefined" && !document.querySelector("style[data-plex]")) {
  const face = (asset: unknown, weight: number) =>
    `@font-face{font-family:"IBM Plex Sans";src:url("${src(asset)}") format("truetype");font-weight:${weight};font-display:swap}`;
  const el = document.createElement("style");
  el.setAttribute("data-plex", "");
  el.textContent = [
    face(IBMPlexSans_400Regular, 400),
    face(IBMPlexSans_500Medium, 500),
    face(IBMPlexSans_600SemiBold, 600),
    // The redesign uses only 400/500/600: map every heavier legacy
    // weight onto the SemiBold file too (same as native's fw()).
    face(IBMPlexSans_600SemiBold, 700),
    face(IBMPlexSans_600SemiBold, 800),
    face(IBMPlexSans_600SemiBold, 900),
    `div[dir="auto"],input,textarea{font-family:"IBM Plex Sans",system-ui,sans-serif}`,
  ].join("\n");
  document.head.appendChild(el);
}

export {};
