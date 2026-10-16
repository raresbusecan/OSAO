// Hermes may lack Intl.PluralRules, which i18next needs for "1 zi / 2 zile /
// 20 de zile" (Romanian has one / few / other). No-op where it exists.
import "intl-pluralrules";
import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Localization from "expo-localization";
import ro from "./locales/ro.json";
import en from "./locales/en.json";

/**
 * orgOS's languages (2026-10-15: infrastructure only -- screens still hold
 * their Romanian text inline and move to `t("...")` keys area by area).
 *
 * - Strings live in ./locales/<code>.json, same key tree in every language.
 *   Romanian is the source and the fallback: a key missing in en.json
 *   shows its Romanian text, never a raw key.
 * - Plurals use i18next's CLDR suffixes: ro has _one / _few / _other
 *   ("1 zi", "2 zile", "20 de zile"), en has _one / _other. Call
 *   t("common.days", { count }).
 * - The choice is per device (Settings > Limbă), read synchronously at
 *   startup so the app never flashes the other language. lib/api.ts sends
 *   it as Accept-Language and the backend answers in it (SetLocale).
 * - Read it with useLanguage(); change it with setLanguage().
 */
export type Language = "ro" | "en";

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "ro", label: "Română" },
  { code: "en", label: "English" },
];

/** Default to the phone's language only once the screens are translated --
 * until then an English phone would get a half-English app. Flip to true
 * when en.json covers the app. */
const FOLLOW_DEVICE_LANGUAGE = false;

const STORAGE_KEY = "orgos_language";

function readStored(): Language | null {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(STORAGE_KEY) : SecureStore.getItem(STORAGE_KEY);
    return raw === "ro" || raw === "en" ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(lang: Language) {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(STORAGE_KEY, lang);
    else SecureStore.setItemAsync(STORAGE_KEY, lang).catch(() => {});
  } catch {}
}

function deviceLanguage(): Language | null {
  try {
    const code = Localization.getLocales()[0]?.languageCode;
    return code === "en" || code === "ro" ? code : null;
  } catch {
    return null;
  }
}

const initial: Language = readStored() ?? (FOLLOW_DEVICE_LANGUAGE ? deviceLanguage() : null) ?? "ro";

i18n.use(initReactI18next).init({
  resources: { ro: { translation: ro }, en: { translation: en } },
  lng: initial,
  fallbackLng: "ro",
  supportedLngs: ["ro", "en"],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
  initAsync: false, // synchronous: ready before the first render
});

/** The language in effect right now (for non-React code, e.g. lib/api.ts). */
export function currentLanguage(): Language {
  return i18n.language === "en" ? "en" : "ro";
}

/** Switch language app-wide (re-renders every useTranslation/useLanguage
 * consumer) and remember it on this device. */
export function setLanguage(lang: Language) {
  writeStored(lang);
  i18n.changeLanguage(lang);
}

/** `t` plus the current language, re-rendering on a change. */
export function useLanguage() {
  const { t, i18n: inst } = useTranslation();
  return { t, language: (inst.language === "en" ? "en" : "ro") as Language, setLanguage };
}

export { i18n };
