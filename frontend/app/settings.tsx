import React, { useEffect, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import {
  BUILT_IN_PRESETS,
  MAX_SAVED_PRESETS,
  readSavedPresets,
  sameAppearance,
  writeSavedPresets,
  type Appearance,
  type Preset,
} from "@/lib/appearancePresets";
import {
  BACKGROUND_PALETTES,
  DEFAULT_CARD_STYLE,
  DEFAULT_LAYOUT,
  THEMES,
  cardSurface,
  scaledRadius,
  scaledSpacing,
  useTheme,
  type Background,
  type ButtonShape,
  type ButtonStyle,
  type CardStyle,
  type TextSize,
  type Density,
  type Layout,
  type ThemeColors,
} from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { api, apiErrorMessage } from "@/lib/api";
import { confirmAction, notifyAction } from "@/lib/confirm";
import { TopBar, SectionHeader, Group, Row, IconWell, Button, Field, ToggleRow, Segmented } from "@/components/ui/primitives";
import { useAppMode } from "@/lib/appMode";
import { LANGUAGES, useLanguage } from "@/lib/i18n";
import { Sheet } from "@/components/ui/Sheet";
import { PasswordField } from "@/components/auth/AuthShell";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailBanner";
import { VerifiedBadge } from "@/components/auth/VerifiedBadge";
import { PROVIDER_LABEL, type SocialProvider } from "@/lib/socialAuth";
import { TOUR_LIST, clearSeenLocally, requestTour, tourExists, type TourKey } from "@/lib/tours";
import { detectSpaceType, profileFromSpace, type SpaceKind } from "@/lib/spaces/spaceProfile";
import { ScreenBackground } from "@/components/ui/ScreenBackground";

const PROVIDER_ICON: Record<SocialProvider, keyof typeof Ionicons.glyphMap> = {
  apple: "logo-apple",
  google: "logo-google",
  facebook: "logo-facebook",
};

type SettingsRow = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  /** Undefined for a row whose own task hasn't landed yet -- shown but
   * inert, rather than hidden, so the full shape of Settings is visible
   * from the first pass (see Task #9's ordered subtask list). */
  onPress?: () => void;
};

/**
 * Reached from the avatar in Home's header. Each row below
 * is its own subtask (name, password, email, language, colors, theme)
 * built one at a time -- wire a row's onPress up when its subtask
 * actually lands, don't get ahead of the current one.
 */
export default function Settings() {
  const { colors, spacing, themeId, cardStyle, layout } = useTheme();
  const router = useRouter();
  const { user, updateUser, signOut } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [toursOpen, setToursOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  // orgOS Simplu test switch (lib/appMode.tsx) -- local to this device.
  const { mode, setMode, source } = useAppMode();
  // lib/i18n -- this row is the first string read from the locale files.
  const { t, language } = useLanguage();

  // Social-only account (signed up with Apple/Google/Facebook, no password
  // yet): both password-protected sheets would be dead ends, so "Parolă"
  // becomes "Setează o parolă" and Email asks for a password first.
  const noPassword = user?.has_password === false;
  const askPasswordFirst = async () => {
    const ok = await confirmAction(
      "Setează mai întâi o parolă",
      "Ca să schimbi emailul îți trebuie o parolă. Acum intri doar prin Apple, Google sau Facebook; după ce setezi o parolă, poți schimba și emailul.",
      { confirmLabel: "Setează o parolă" },
    );
    if (ok) setSettingPassword(true);
  };

  const account: SettingsRow[] = [
    { key: "name", icon: "person-outline", label: "Nume", value: user?.name, onPress: () => setEditingName(true) },
    { key: "email", icon: "mail-outline", label: "Email", value: user?.email, onPress: noPassword ? askPasswordFirst : () => setEditingEmail(true) },
    noPassword
      ? { key: "password", icon: "lock-closed-outline", label: "Setează o parolă", onPress: () => setSettingPassword(true) }
      : { key: "password", icon: "lock-closed-outline", label: "Parolă", onPress: () => setEditingPassword(true) },
  ];
  const app: SettingsRow[] = [
    {
      key: "language",
      icon: "language-outline",
      label: t("settings.language.row"),
      value: LANGUAGES.find((l) => l.code === language)?.label,
      onPress: () => setLanguageOpen(true),
    },
    {
      key: "colors",
      icon: "color-palette-outline",
      label: "Culori",
      value: BACKGROUND_PALETTES.find((p) => p.id === layout.palette)?.label,
      onPress: () => setColorsOpen(true),
    },
    {
      key: "theme",
      icon: "contrast-outline",
      label: "Temă",
      value: THEMES.find((th) => th.id === themeId)?.label,
      onPress: () => setThemeOpen(true),
    },
    {
      key: "appearance",
      icon: "options-outline",
      label: "Aspect",
      value: isDefaultCardStyle(cardStyle) && isDefaultLayout(layout) ? "Implicit" : "Personalizat",
      onPress: () => setAppearanceOpen(true),
    },
    // Simplu screens run no tours, so a replay request would sit pending
    // until the user switched back to full mode.
    ...(mode === "simple" ? [] : [{ key: "tours", icon: "map-outline", label: "Revezi ghidurile", onPress: () => setToursOpen(true) } as SettingsRow]),
  ];

  // Sign-out lives here, behind a confirmation -- it used to be a
  // one-tap icon in Home's header, easy to hit by accident.
  const handleSignOut = async () => {
    const ok = await confirmAction("Ieși din cont?", "Va trebui să te autentifici din nou ca să-ți vezi datele.", {
      confirmLabel: "Ieși",
      destructive: true,
    });
    if (ok) signOut();
  };

  const linkedProviders = (user?.providers ?? []).filter((p): p is SocialProvider => p in PROVIDER_LABEL);

  const initial = (user?.name ?? "?").trim().charAt(0).toUpperCase();

  const renderRow = (row: SettingsRow) => (
    <Row
      key={row.key}
      testID={`settings-row-${row.key}`}
      leading={<IconWell icon={row.icon} color={colors.onSurfaceTertiary} tint={colors.onSurfaceSecondary} size={34} />}
      title={row.label}
      onPress={row.onPress}
      dim={!row.onPress}
      trailing={
        <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, maxWidth: 170 }} numberOfLines={1}>
          {row.onPress ? row.value ?? "" : row.value ?? "În curând"}
        </Text>
      }
      chevron={!!row.onPress}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="settings-screen">
      <ScreenBackground />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.section }}>
          <TopBar onBack={() => router.back()} backTestID="settings-back" />

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md + 2 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface }}>{initial}</Text>
              <VerifiedBadge user={user} avatarSize={56} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface }} numberOfLines={1}>{user?.name ?? "Setări"}</Text>
              {user?.email ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }} numberOfLines={1}>{user.email}</Text> : null}
            </View>
          </View>

          <VerifyEmailBanner testID="settings-verify-email-banner" />

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Cont" muted />
            <Group inset={62}>
              {account.map(renderRow)}
              {/* Read-only: social accounts linked to this user (lib/socialAuth.ts). */}
              {linkedProviders.map((p) => (
                <Row
                  key={`provider-${p}`}
                  testID={`settings-provider-${p}`}
                  leading={<IconWell icon={PROVIDER_ICON[p]} color={colors.onSurfaceTertiary} tint={colors.onSurfaceSecondary} size={34} />}
                  title={`Conectat cu ${PROVIDER_LABEL[p]}`}
                />
              ))}
            </Group>
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title="Aplicație" muted />
            <Group inset={62}>{app.map(renderRow)}</Group>
            {/* Test-only: flips between orgOS Simplu (future free tier) and
                the full app. Hidden once a server plan drives the mode. */}
            {source !== "plan" ? (
              <ToggleRow
                testID="settings-simple-mode"
                icon="leaf-outline"
                label="Mod Simplu (test)"
                hint="Varianta gratuită, mai simplă. Doar pentru comparație."
                value={mode === "simple"}
                onChange={(on) => setMode(on ? "simple" : "full")}
              />
            ) : null}
          </View>

          <Button testID="settings-signout" variant="destructive" icon="log-out-outline" label="Ieși din cont" onPress={handleSignOut} />
        </ScrollView>
      </SafeAreaView>

      <EditNameModal
        visible={editingName}
        initialName={user?.name ?? ""}
        onClose={() => setEditingName(false)}
        onSaved={(name) => {
          updateUser({ name });
          setEditingName(false);
        }}
      />

      <EditPasswordModal visible={editingPassword} onClose={() => setEditingPassword(false)} />

      <SetPasswordModal
        visible={settingPassword}
        email={user?.email}
        onClose={() => setSettingPassword(false)}
        onSaved={() => {
          updateUser({ has_password: true });
          setSettingPassword(false);
        }}
      />

      <EditEmailModal visible={editingEmail} onClose={() => setEditingEmail(false)} />

      <LanguageSheet visible={languageOpen} onClose={() => setLanguageOpen(false)} />

      <ThemeSheet visible={themeOpen} onClose={() => setThemeOpen(false)} />

      <AppearanceSheet visible={appearanceOpen} onClose={() => setAppearanceOpen(false)} />

      <ColorsSheet visible={colorsOpen} onClose={() => setColorsOpen(false)} />

      <ToursSheet
        visible={toursOpen}
        onClose={() => setToursOpen(false)}
        onStart={(key, href) => {
          setToursOpen(false);
          // The owning screen's useAutoTour picks the request up once it's
          // focused and this screen (and the sheet's Modal) are gone.
          requestTour(key);
          router.dismissTo((href ?? "/(tabs)/home") as any);
        }}
      />
    </View>
  );
}

/** Settings > Limbă: the app's languages (lib/i18n). A tap switches right
 * away (every translated text re-renders) and is remembered on this
 * device; the API follows through Accept-Language. */
function LanguageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  return (
    <Sheet visible={visible} onClose={onClose} title={t("settings.language.sheetTitle")} subtitle={t("settings.language.sheetSubtitle")} testID="settings-language-sheet">
      <Group>
        {LANGUAGES.map((l) => {
          const on = l.code === language;
          return (
            <Row
              key={l.code}
              testID={`settings-language-${l.code}`}
              title={l.label}
              onPress={() => {
                if (!on) setLanguage(l.code);
                onClose();
              }}
              trailing={on ? <Ionicons name="checkmark" size={20} color={colors.onSurface} /> : null}
            />
          );
        })}
      </Group>
      {language !== "ro" ? (
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.onSurfaceTertiary, paddingHorizontal: spacing.xs }}>{t("settings.language.inProgress")}</Text>
      ) : null}
    </Sheet>
  );
}

/** A tiny picture of a theme: its page colour with a card and two text
 * lines on it, so the list shows what each theme looks like. */
function ThemeSwatch({ theme }: { theme: ThemeColors }) {
  const { spacing, colors } = useTheme();
  return (
    <View style={{ width: 44, height: 34, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: colors.borderStrong, padding: 5, justifyContent: "flex-end" }}>
      <View style={{ height: 16, borderRadius: 5, backgroundColor: theme.surfaceSecondary, paddingHorizontal: spacing.xs, justifyContent: "center", gap: 2 }}>
        <View style={{ width: 18, height: 3, borderRadius: 1.5, backgroundColor: theme.onSurface }} />
        <View style={{ width: 12, height: 3, borderRadius: 1.5, backgroundColor: theme.onSurfaceTertiary }} />
      </View>
    </View>
  );
}

/** Settings > Culori: the background palette (lib/theme.tsx
 * BACKGROUND_PALETTES) for Aspect's blobs/gradient. Picking one while the
 * background is plain switches it to blobs, or the choice would show
 * nothing. Applies right away; the screen behind the sheet shows it. */
function ColorsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, isDark, layout, setLayout } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Culori" subtitle="Culorile fundalului, pe acest dispozitiv." icon="color-palette-outline" testID="settings-colors-sheet">
      <Group inset={72}>
        {BACKGROUND_PALETTES.map((p) => {
          const on = p.id === layout.palette;
          const swatch = isDark ? p.dark : p.light;
          return (
            <Row
              key={p.id}
              testID={`settings-colors-${p.id}`}
              leading={
                <View style={{ width: 44, flexDirection: "row", alignItems: "center" }}>
                  {swatch.map((c, i) => (
                    <View
                      key={i}
                      style={{ width: 18, height: 18, borderRadius: 9, marginLeft: i ? -6 : 0, backgroundColor: c, borderWidth: 2, borderColor: colors.surfaceTertiary }}
                    />
                  ))}
                </View>
              }
              title={p.label}
              subtitle={p.description}
              onPress={() => {
                if (!on || layout.background === "plain") {
                  setLayout({ ...layout, palette: p.id, background: layout.background === "plain" ? "blobs" : layout.background });
                }
              }}
              trailing={on ? <Ionicons name="checkmark" size={20} color={colors.onSurface} /> : null}
            />
          );
        })}
      </Group>
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.onSurfaceTertiary, paddingHorizontal: 4 }}>
        {layout.background === "plain"
          ? "Fundalul e Simplu: alegerea unei palete îl trece pe Pete, ca să se vadă culorile."
          : "Gradientul sau petele se pot schimba din Setări › Aspect › Fundal."}
      </Text>
    </Sheet>
  );
}

/** Settings > Temă: every entry in lib/theme.tsx's THEMES (Hârtie by
 * default). Applies right away, remembered on this device. */
function ThemeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, themeId, setThemeId } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Temă" subtitle="Se aplică imediat, pe acest dispozitiv." icon="contrast-outline" testID="settings-theme-sheet">
      <Group inset={72}>
        {THEMES.map((th) => {
          const on = th.id === themeId;
          return (
            <Row
              key={th.id}
              testID={`settings-theme-${th.id}`}
              leading={<ThemeSwatch theme={th.colors} />}
              title={th.label}
              subtitle={th.description}
              onPress={() => {
                if (!on) setThemeId(th.id);
              }}
              trailing={on ? <Ionicons name="checkmark" size={20} color={colors.onSurface} /> : null}
            />
          );
        })}
      </Group>
    </Sheet>
  );
}

const isDefaultCardStyle = (s: CardStyle) =>
  s.bulge === DEFAULT_CARD_STYLE.bulge && s.opacity === DEFAULT_CARD_STYLE.opacity && s.liquid === DEFAULT_CARD_STYLE.liquid;
const isDefaultLayout = (l: Layout) => (Object.keys(DEFAULT_LAYOUT) as (keyof Layout)[]).every((k) => l[k] === DEFAULT_LAYOUT[k]);

const TEXT_SIZE_OPTIONS: { key: TextSize; label: string }[] = [
  { key: "small", label: "Mic" },
  { key: "normal", label: "Normal" },
  { key: "large", label: "Mare" },
  { key: "xlarge", label: "Maxim" },
];

const BUTTON_SHAPE_OPTIONS: { key: ButtonShape; label: string }[] = [
  { key: "rounded", label: "Rotunjite" },
  { key: "pill", label: "Pastilă" },
];

const BUTTON_STYLE_OPTIONS: { key: ButtonStyle; label: string }[] = [
  { key: "filled", label: "Pline" },
  { key: "outline", label: "Contur" },
];

const BACKGROUND_OPTIONS: { key: Background; label: string }[] = [
  { key: "plain", label: "Simplu" },
  { key: "gradient", label: "Gradient" },
  { key: "blobs", label: "Pete" },
];

const DENSITY_OPTIONS: { key: Density; label: string }[] = [
  { key: "compact", label: "Compact" },
  { key: "normal", label: "Normal" },
  { key: "airy", label: "Aerisit" },
];

function SliderField({
  testID,
  label,
  hint,
  value,
  min = 0,
  onChange,
  onCommit,
}: {
  testID: string;
  label: string;
  hint: string;
  value: number;
  min?: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", paddingHorizontal: spacing.xs }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>{label}</Text>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{hint}</Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurfaceSecondary, fontVariant: ["tabular-nums"] }}>{Math.round(value * 100)}%</Text>
      </View>
      <Slider
        testID={testID}
        style={{ height: 44 }}
        minimumValue={min}
        maximumValue={1}
        step={0.05}
        value={value}
        onValueChange={(v) => onChange(snap(v))}
        onSlidingComplete={(v) => onCommit(snap(v))}
        minimumTrackTintColor={colors.onSurface}
        maximumTrackTintColor={colors.control}
        thumbTintColor={colors.onSurface}
        accessibilityLabel={label}
      />
    </View>
  );
}

// The slider reports floats like 0.30000000004; keep exact 5% steps.
const snap = (v: number) => Math.round(v * 20) / 20;

const identity = (v: number) => v;

/** `toSlider`/`fromSlider` map a stored value to what the bar shows:
 * "Transparență" is the stored `opacity` (1 = solid, 0.4 = the most
 * see-through allowed) turned around, so further right = more
 * transparent, as people expect from the name. */
const CARD_SLIDERS: { key: keyof CardStyle; label: string; hint: string; toSlider: (v: number) => number; fromSlider: (t: number) => number }[] = [
  { key: "bulge", label: "Bombat", hint: "Cât de ridicat pare cardul", toSlider: identity, fromSlider: identity },
  {
    key: "opacity",
    label: "Transparență",
    hint: "Cât se vede prin card",
    toSlider: (o) => Math.round(((1 - o) / 0.6) * 20) / 20,
    fromSlider: (t) => Math.round((1 - 0.6 * t) * 100) / 100,
  },
  {
    key: "liquid",
    label: "Liquid",
    hint: "Aspect de sticlă: reflexii, transparență, fundal colorat",
    toSlider: identity,
    fromSlider: identity,
  },
];

/** Settings > Aspect: how the whole app looks -- card style (lib/theme.tsx
 * CardStyle) and shape (Layout: corner roundness, density). The preview
 * follows the drag; the app only updates on release, so dragging doesn't
 * re-render every screen behind the sheet. A new appearance option = one
 * more control here plus its token in lib/theme.tsx. */
function AppearanceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, isDark, cardStyle, setCardStyle, layout, setLayout, spacing } = useTheme();
  const [draft, setDraft] = useState<CardStyle>(cardStyle);
  const [layoutDraft, setLayoutDraft] = useState<Layout>(layout);

  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    setDraft(cardStyle);
    setLayoutDraft(layout);
  }
  wasVisible.current = visible;

  // Settings > Aspect > Stiluri (lib/appearancePresets.ts).
  const [saved, setSaved] = useState<Preset[]>(readSavedPresets);
  const current: Appearance = { cardStyle: draft, layout: layoutDraft };
  const matchesAPreset = [...BUILT_IN_PRESETS, ...saved].some((p) => sameAppearance(p.appearance, current));
  const applyPreset = (p: Preset) => {
    setDraft(p.appearance.cardStyle);
    setCardStyle(p.appearance.cardStyle);
    setLayoutDraft(p.appearance.layout);
    setLayout(p.appearance.layout);
  };
  const savePreset = () => {
    // "Stilul meu N" with the first N not already used.
    let n = 1;
    while (saved.some((p) => p.label === `Stilul meu ${n}`)) n++;
    const next = [...saved, { id: `own-${Date.now()}`, label: `Stilul meu ${n}`, appearance: current }];
    setSaved(next);
    writeSavedPresets(next);
  };
  const deletePreset = async (p: Preset) => {
    const ok = await confirmAction(`Ștergi „${p.label}”?`, "Aspectul de acum rămâne cum e.", { confirmLabel: "Șterge", destructive: true });
    if (!ok) return;
    const next = saved.filter((s) => s.id !== p.id);
    setSaved(next);
    writeSavedPresets(next);
  };

  // Choices without a slider apply at once (draft + app together).
  const commitLayout = (patch: Partial<Layout>) => {
    const next = { ...layoutDraft, ...patch };
    setLayoutDraft(next);
    setLayout(next);
  };

  // The preview's corners and padding follow the drafts, not the app.
  const pr = scaledRadius(layoutDraft.roundness);
  const ps = scaledSpacing(layoutDraft.density);
  const isDefault = isDefaultCardStyle(draft) && isDefaultLayout(layoutDraft);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Aspect"
      subtitle="Trage de bare ca să alegi cum arată aplicația."
      icon="options-outline"
      testID="settings-appearance-sheet"
      footer={
        <Button
          testID="settings-appearance-reset"
          variant="secondary"
          label="Revino la implicit"
          disabled={isDefault}
          onPress={() => {
            setDraft(DEFAULT_CARD_STYLE);
            setCardStyle(DEFAULT_CARD_STYLE);
            setLayoutDraft(DEFAULT_LAYOUT);
            setLayout(DEFAULT_LAYOUT);
          }}
        />
      }
    >
      <SectionHeader title="Stiluri" muted />
      <Group inset={16}>
        {[...BUILT_IN_PRESETS, ...saved].map((p) => {
          const own = !BUILT_IN_PRESETS.includes(p);
          const on = sameAppearance(p.appearance, current);
          return (
            <Row
              key={p.id}
              testID={`settings-appearance-preset-${p.id}`}
              title={p.label}
              subtitle={own ? "Salvat de tine · ține apăsat ca să-l ștergi" : p.description}
              onPress={() => applyPreset(p)}
              onLongPress={own ? () => deletePreset(p) : undefined}
              trailing={on ? <Ionicons name="checkmark" size={20} color={colors.onSurface} /> : null}
            />
          );
        })}
      </Group>
      <Button
        testID="settings-appearance-save-preset"
        variant="secondary"
        compact
        icon="bookmark-outline"
        label={saved.length >= MAX_SAVED_PRESETS ? `Poți salva cel mult ${MAX_SAVED_PRESETS} stiluri` : "Salvează combinația actuală"}
        disabled={saved.length >= MAX_SAVED_PRESETS || matchesAPreset}
        onPress={savePreset}
      />

      {/* The preview sits on the page colour, as cards do in the app. */}
      <View style={{ backgroundColor: colors.surface, borderRadius: pr.card, padding: ps.xl, alignItems: "stretch" }}>
        <View testID="settings-appearance-preview" style={[cardSurface(colors, isDark, draft), { borderRadius: pr.lg, padding: ps.gutter, gap: ps.sm }]}>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Cheltuit în noiembrie</Text>
          <Text style={{ fontSize: 28, fontWeight: "600", letterSpacing: -0.5, color: colors.onSurface }}>1.240 lei</Text>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
            <View style={{ width: "39%", height: 8, borderRadius: 4, backgroundColor: colors.onSurface }} />
          </View>
        </View>
      </View>

      <SectionHeader title="Carduri" muted />
      {CARD_SLIDERS.map((sl) => (
        <SliderField
          key={sl.key}
          testID={`settings-appearance-${sl.key}`}
          label={sl.label}
          hint={sl.hint}
          value={sl.toSlider(draft[sl.key])}
          onChange={(t) => setDraft((d) => ({ ...d, [sl.key]: sl.fromSlider(t) }))}
          onCommit={(t) => setCardStyle({ ...draft, [sl.key]: sl.fromSlider(t) })}
        />
      ))}

      <SectionHeader title="Formă" muted />
      <SliderField
        testID="settings-appearance-roundness"
        label="Colțuri"
        hint="De la colțuri drepte la foarte rotunde"
        value={layoutDraft.roundness}
        onChange={(v) => setLayoutDraft((l) => ({ ...l, roundness: v }))}
        onCommit={(v) => setLayout({ ...layoutDraft, roundness: v })}
      />
      <View style={{ gap: spacing.sm }}>
        <View style={{ paddingHorizontal: spacing.xs }}>
          <Text style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface }}>Densitate</Text>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Cât spațiu e între elemente</Text>
        </View>
        <Segmented
          testIDPrefix="settings-appearance-density"
          options={DENSITY_OPTIONS}
          value={layoutDraft.density}
          onChange={(d) => {
            const next = { ...layoutDraft, density: d };
            setLayoutDraft(next);
            setLayout(next);
          }}
        />
      </View>

      {/* Applied right away: the screen behind the sheet shows it. */}
      <SectionHeader title="Fundal" muted />
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, paddingHorizontal: spacing.xs }}>
          În Spații, culoarea vine de la Spațiu. Cu Liquid pornit și fundalul Simplu, apar automat pete de culoare, ca sticla să aibă ce arăta.
        </Text>
        <Segmented
          testIDPrefix="settings-appearance-background"
          options={BACKGROUND_OPTIONS}
          value={layoutDraft.background}
          onChange={(b) => {
            const next = { ...layoutDraft, background: b };
            setLayoutDraft(next);
            setLayout(next);
          }}
        />
      </View>
      {layoutDraft.background !== "plain" ? (
        <SliderField
          testID="settings-appearance-background-strength"
          label="Intensitate"
          hint="Câtă culoare are fundalul"
          value={layoutDraft.backgroundStrength}
          onChange={(v) => setLayoutDraft((l) => ({ ...l, backgroundStrength: v }))}
          onCommit={(v) => setLayout({ ...layoutDraft, backgroundStrength: v })}
        />
      ) : null}

      <SectionHeader title="Text" muted />
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, paddingHorizontal: spacing.xs }}>
          Mărimea textului din toată aplicația, peste cea aleasă în telefon.
        </Text>
        <Segmented
          testIDPrefix="settings-appearance-text"
          options={TEXT_SIZE_OPTIONS}
          value={layoutDraft.textSize}
          onChange={(t) => commitLayout({ textSize: t })}
        />
      </View>

      <SectionHeader title="Butoane" muted />
      <View style={{ gap: spacing.sm }}>
        <Segmented
          testIDPrefix="settings-appearance-button-shape"
          options={BUTTON_SHAPE_OPTIONS}
          value={layoutDraft.buttonShape}
          onChange={(s) => commitLayout({ buttonShape: s })}
        />
        <Segmented
          testIDPrefix="settings-appearance-button-style"
          options={BUTTON_STYLE_OPTIONS}
          value={layoutDraft.buttonStyle}
          onChange={(s) => commitLayout({ buttonStyle: s })}
        />
        {/* Live sample: these two apply right away. */}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button testID="settings-appearance-sample-primary" label="Salvează" onPress={() => {}} />
          </View>
          <View style={{ flex: 1 }}>
            <Button testID="settings-appearance-sample-secondary" variant="secondary" label="Anulează" onPress={() => {}} />
          </View>
        </View>
      </View>
    </Sheet>
  );
}

function EditNameModal({
  visible,
  initialName,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initialName: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the current name every time the sheet opens -- it
  // should always start from what's actually saved, not whatever was
  // left typed from a previous open/cancel.
  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    if (name !== initialName) setName(initialName);
    if (error) setError(null);
  }
  wasVisible.current = visible;

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= 50 && trimmed !== initialName.trim();

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateName(trimmed);
      onSaved(res.user.name);
    } catch (err: any) {
      setError(err?.message || "Nu am putut actualiza numele.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Numele tău"
      icon="person-outline"
      testID="settings-name-sheet"
      footer={<Button testID="settings-name-save" label="Salvează" onPress={handleSave} loading={saving} disabled={!canSave} />}
    >
      <Field
        testID="settings-name-input"
        label="Nume"
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError(null);
        }}
        onSubmitEditing={handleSave}
        returnKeyType="done"
        placeholder="Cum să-ți spunem"
        autoFocus
        maxLength={50}
        error={error}
      />
    </Sheet>
  );
}

function EditPasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password fields never pre-fill and never carry a draft across
  // opens -- every open starts from a clean slate.
  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }
  wasVisible.current = visible;

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const canSave = current.length > 0 && next.length >= 8 && next === confirm;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.updatePassword(current, next);
      onClose();
      notifyAction("Parola a fost schimbată", "De acum intri în cont cu parola nouă.");
    } catch (err: any) {
      setError(err?.message || "Nu am putut schimba parola.");
    } finally {
      setSaving(false);
    }
  };

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Schimbă parola"
      icon="lock-closed-outline"
      testID="settings-password-sheet"
      footer={<Button testID="settings-password-save" label="Schimbă parola" onPress={handleSave} loading={saving} disabled={!canSave} />}
    >
      <PasswordField
        testID="settings-password-current"
        label="Parola actuală"
        value={current}
        onChangeText={(t) => { setCurrent(t); clearError(); }}
        autoComplete="current-password"
        autoFocus
        error={error}
      />
      <PasswordField
        testID="settings-password-next"
        label="Parola nouă"
        value={next}
        onChangeText={(t) => { setNext(t); clearError(); }}
        autoComplete="new-password"
        hint="Cel puțin 8 caractere."
      />
      <PasswordField
        testID="settings-password-confirm"
        label="Repetă parola nouă"
        value={confirm}
        onChangeText={(t) => { setConfirm(t); clearError(); }}
        onSubmitEditing={handleSave}
        returnKeyType="done"
        autoComplete="new-password"
        error={mismatch ? "Parolele nu se potrivesc." : null}
      />
    </Sheet>
  );
}

/** First password for a social-only account (user.has_password === false):
 * no current password, POST /profile/password/set. */
function SetPasswordModal({ visible, email, onClose, onSaved }: { visible: boolean; email?: string | null; onClose: () => void; onSaved: () => void }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    setNext("");
    setConfirm("");
    setError(null);
  }
  wasVisible.current = visible;

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const canSave = next.length >= 8 && next === confirm;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.setPassword(next, confirm);
      onSaved();
      notifyAction(
        "Parola a fost setată",
        email ? `De acum poți intra și cu emailul (${email}) și parola, nu doar cu contul extern.` : "De acum poți intra și cu emailul și parola.",
      );
    } catch (err: any) {
      setError(apiErrorMessage(err, "Nu am putut seta parola.", "password"));
    } finally {
      setSaving(false);
    }
  };

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Setează o parolă"
      subtitle={email ? `Ca să intri și cu ${email}, pe lângă Apple, Google sau Facebook.` : "Ca să intri și cu emailul, pe lângă Apple, Google sau Facebook."}
      icon="lock-closed-outline"
      testID="settings-set-password-sheet"
      footer={<Button testID="settings-set-password-save" label="Setează parola" onPress={handleSave} loading={saving} disabled={!canSave} />}
    >
      <PasswordField
        testID="settings-set-password-next"
        label="Parola nouă"
        value={next}
        onChangeText={(t) => { setNext(t); clearError(); }}
        autoComplete="new-password"
        textContentType="newPassword"
        autoFocus
        hint="Cel puțin 8 caractere."
        error={error}
      />
      <PasswordField
        testID="settings-set-password-confirm"
        label="Repetă parola"
        value={confirm}
        onChangeText={(t) => { setConfirm(t); clearError(); }}
        onSubmitEditing={handleSave}
        returnKeyType="done"
        autoComplete="new-password"
        textContentType="newPassword"
        error={mismatch ? "Parolele nu se potrivesc." : null}
      />
    </Sheet>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EditEmailModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Unlike name/password, a successful request doesn't change anything
  // yet -- the new address only takes effect once its own link is
  // opened (see confirm-email.tsx).
  const [sentTo, setSentTo] = useState<string | null>(null);

  const wasVisible = React.useRef(visible);
  if (visible && !wasVisible.current) {
    setEmail("");
    setPassword("");
    setError(null);
  }
  wasVisible.current = visible;

  const trimmedEmail = email.trim();
  const canSave = EMAIL_RE.test(trimmedEmail) && password.length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.requestEmailChange(trimmedEmail, password);
      setSentTo(trimmedEmail);
    } catch (err: any) {
      setError(err?.message || "Nu am putut trimite cererea.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reopening the row should offer a fresh attempt, not a stale
    // confirmation from a previous request.
    setSentTo(null);
  };

  return (
    <Sheet
      visible={visible}
      onClose={handleClose}
      title={sentTo ? "Verifică emailul nou" : "Schimbă emailul"}
      icon={sentTo ? "mail-unread-outline" : "mail-outline"}
      tone={sentTo ? colors.success : undefined}
      testID="settings-email-sheet"
      footer={
        sentTo
          ? <Button testID="settings-email-done" label="Am înțeles" onPress={handleClose} />
          : <Button testID="settings-email-save" label="Trimite linkul de confirmare" onPress={handleSave} loading={saving} disabled={!canSave} />
      }
    >
      {sentTo ? (
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.onSurfaceTertiary }}>
          Am trimis un link la {sentTo}. Emailul contului se schimbă doar după ce deschizi linkul. E valabil 60 de minute.
        </Text>
      ) : (
        <>
          <Field
            testID="settings-email-new"
            label="Emailul nou"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (error) setError(null);
            }}
            placeholder="nume@exemplu.ro"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            autoFocus
          />
          <PasswordField
            testID="settings-email-password"
            label="Parola actuală"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
            onSubmitEditing={handleSave}
            returnKeyType="done"
            autoComplete="current-password"
            hint="Ca să confirmăm că ești tu."
            error={error}
          />
        </>
      )}
    </Sheet>
  );
}

/** "Revezi ghidurile": every first-use tour (lib/tours.ts) with whether it
 * was seen, skipped or is still new; tap one to run it now. Tours that
 * don't exist yet are listed dimmed as "În curând". */
function ToursSheet({ visible, onClose, onStart }: { visible: boolean; onClose: () => void; onStart: (key: TourKey, href?: string) => void }) {
  const { colors } = useTheme();
  const { user, updateUser } = useAuth();
  const [resetting, setResetting] = useState(false);
  // A Space tour runs on the user's FIRST space of that kind (Spaces tab
  // order); looked up each time the sheet opens. null = not loaded yet.
  const [firstSpaceId, setFirstSpaceId] = useState<Partial<Record<SpaceKind, string>> | null>(null);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    api
      .listSpaces()
      .then((r) => {
        if (!alive) return;
        const first: Partial<Record<SpaceKind, string>> = {};
        for (const sp of r?.spaces ?? []) {
          const kind = detectSpaceType(sp, profileFromSpace(sp));
          if (kind && first[kind] == null) first[kind] = String(sp.id);
        }
        setFirstSpaceId(first);
      })
      .catch(() => alive && setFirstSpaceId({}));
    return () => {
      alive = false;
    };
  }, [visible]);

  const status = (key: TourKey) => {
    const s = user?.tours?.[key]?.status;
    return s === "done" ? "Văzut" : s === "skipped" ? "Sărit" : "Nou";
  };

  const resetAll = async () => {
    const ok = await confirmAction("Arăți din nou toate ghidurile?", "Fiecare ecran îți va arăta ghidul la următoarea vizită.", {
      confirmLabel: "Arată-le",
    });
    if (!ok) return;
    setResetting(true);
    try {
      await api.resetTours();
      clearSeenLocally();
      updateUser({ tours: null });
      onClose();
    } catch (err: any) {
      notifyAction("Nu am putut reseta ghidurile", err?.message || "A apărut o eroare.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Revezi ghidurile"
      subtitle="Atinge un ghid ca să-l pornești acum."
      icon="map-outline"
      testID="settings-tours-sheet"
      footer={<Button testID="settings-tours-reset" variant="secondary" label="Arată-le din nou pe toate" onPress={resetAll} loading={resetting} />}
    >
      <Group inset={62}>
        {TOUR_LIST.map((t) => {
          const spaceId = t.spaceKind ? firstSpaceId?.[t.spaceKind] : undefined;
          const href = t.spaceKind ? (spaceId ? `/${spaceId}` : undefined) : t.href;
          // A Space tour with no space of its kind yet stays disabled.
          const noSpace = !!t.spaceKind && !spaceId;
          const exists = tourExists(t.key);
          const startable = exists && !noSpace;
          return (
            <Row
              key={t.key}
              testID={`settings-tour-${t.key}`}
              leading={<IconWell icon={t.icon as keyof typeof Ionicons.glyphMap} color={colors.onSurfaceTertiary} tint={colors.onSurfaceSecondary} size={34} />}
              title={t.label}
              onPress={startable ? () => onStart(t.key, href) : undefined}
              dim={!startable}
              trailing={
                <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }} numberOfLines={1}>
                  {!exists ? "În curând" : noSpace ? (firstSpaceId ? "După primul spațiu" : "") : status(t.key)}
                </Text>
              }
              chevron={startable}
            />
          );
        })}
      </Group>
    </Sheet>
  );
}
