import React from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform, type TextInputProps, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { PressableScale } from "./PressableScale";
import { HELP, showHelp, type HelpKey } from "@/lib/help";

/**
 * Shared building blocks for the 2026-10 redesign -- one place for the
 * pieces every screen repeats (round header buttons, the identity block
 * under them, card groups, section headers, chips, segmented filters,
 * buttons, form fields), so ~60 screens read as one system instead of
 * each re-deriving radii and paddings. Mockup: the "orgOS redesign"
 * canvas artifact. Values come from lib/theme.tsx's tokens.
 */

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Which layer the current subtree sits on, so a Group/Row/Segmented can
 * step one layer up from it: on the page they're cards (surfaceSecondary);
 * inside a Sheet -- itself surfaceSecondary -- they'd vanish, so they
 * become surfaceTertiary; inside a ToggleRow (tertiary) a Segmented's
 * track goes back to the darker track tone. Sheet and ToggleRow provide it.
 */
export type SurfaceLevel = "page" | "card" | "raised";
export const SurfaceLevelContext = React.createContext<SurfaceLevel>("page");

/** True inside a page-level Group: the group already paints the card, so
 * a Row in it stays transparent instead of repainting surfaceSecondary. */
const PaintedCardContext = React.createContext(false);

/** Rows under this paint their own fill again even inside a page Group --
 * for a row that slides over something (SwipeRow's resolve/delete
 * panels sit underneath it and would show through a transparent row). */
export function OpaqueRows({ children }: { children: React.ReactNode }) {
  return <PaintedCardContext.Provider value={false}>{children}</PaintedCardContext.Provider>;
}

const hexToRgba = (hex: string, alpha: number) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};
export { hexToRgba };

/** 44px round icon button on the card layer -- back, edit, close... */
export function CircleButton({
  icon,
  label,
  onPress,
  testID,
  tone,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  testID?: string;
  /** Filled variant (e.g. the "+" on Spații) -- the fill color. */
  tone?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const isBack = icon === "chevron-back" || icon === "chevron-forward";
  const iconColor = tone ? colors.surface : isBack ? colors.onSurface : colors.onSurfaceTertiary;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: tone ?? colors.surfaceSecondary,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Ionicons name={icon} size={isBack ? 22 : tone ? 22 : 18} color={iconColor} />
    </PressableScale>
  );
}

/**
 * The app-wide "ⓘ": opens that topic's explanation (lib/help.ts) in the
 * root HelpHost sheet. Small and quiet by default, sitting next to a
 * heading; `circle` is the 44px header-button variant. 44px hit area
 * either way.
 */
export function InfoButton({ topic, circle, color, testID }: { topic: HelpKey; circle?: boolean; color?: string; testID?: string }) {
  const { colors } = useTheme();
  const label = `Despre ${HELP[topic].title}`;
  if (circle) return <CircleButton testID={testID ?? `info-${topic}`} icon="information-circle-outline" label={label} onPress={() => showHelp(topic)} />;
  return (
    <Pressable
      testID={testID ?? `info-${topic}`}
      onPress={() => showHelp(topic)}
      // On web a "button" role renders a <button>, and the "ⓘ" often sits
      // inside a tappable card that already is one (invalid nesting).
      accessibilityRole={Platform.OS === "web" ? "link" : "button"}
      accessibilityLabel={label}
      hitSlop={13}
      style={({ pressed }) => ({ width: 18, height: 18, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}
    >
      <Ionicons name="information-circle-outline" size={18} color={color ?? colors.onSurfaceTertiary} />
    </Pressable>
  );
}

/** Back on the left, any number of CircleButtons on the right. */
export function TopBar({ onBack, backTestID = "space-back", children }: { onBack?: () => void; backTestID?: string; children?: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
      {onBack ? <CircleButton testID={backTestID} icon="chevron-back" label="Înapoi" onPress={onBack} /> : <View />}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>{children}</View>
    </View>
  );
}

/** Kind dot + small label, then the page title, then an optional line
 * under it -- the left-aligned header every Space page opens with. */
export function Identity({ color, kicker, title, subtitle, info }: { color?: string; kicker?: string; title: string; subtitle?: string | null; info?: HelpKey }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      {kicker ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }} numberOfLines={1}>{kicker}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text style={{ fontSize: 28, fontWeight: "600", letterSpacing: -0.6, color: colors.onSurface, flexShrink: 1 }} numberOfLines={2}>
          {title}
        </Text>
        {info ? <InfoButton topic={info} /> : null}
      </View>
      {subtitle ? <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{subtitle}</Text> : null}
    </View>
  );
}

/** Plain page title for the top-level tabs (Spații, Calendar, Buget). */
export function PageTitle({ children, right, info }: { children: React.ReactNode; right?: React.ReactNode; info?: HelpKey }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 }}>
        <Text style={{ fontSize: 28, fontWeight: "600", letterSpacing: -0.6, color: colors.onSurface, flexShrink: 1 }}>{children}</Text>
        {info ? <InfoButton topic={info} /> : null}
      </View>
      {right}
    </View>
  );
}

/** A section's heading, with an optional text action on the right. */
export function SectionHeader({
  title,
  action,
  muted,
  info,
}: {
  title: string;
  /** "ⓘ" right after the title -- see InfoButton. */
  info?: HelpKey;
  action?: { label: string; onPress: () => void; testID?: string; /** Emphasized action ("Gata"). */ tone?: string; /** Icon before the label, in the same colour ("add" for "Adaugă"). */ icon?: IconName };
  /** Smaller grey heading (month groups, settings groups). */
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: muted ? 4 : 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
        <Text style={muted ? { fontSize: 13, color: colors.onSurfaceTertiary } : { fontSize: 17, fontWeight: "600", color: colors.onSurface }}>
          {title}
        </Text>
        {info ? <InfoButton topic={info} /> : null}
      </View>
      {action ? (
        <Pressable
          testID={action.testID}
          onPress={action.onPress}
          accessibilityRole="button"
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 12 }}
        >
          {action.icon ? <Ionicons name={action.icon} size={17} color={action.tone ?? colors.onSurfaceTertiary} /> : null}
          <Text style={{ fontSize: 14, color: action.tone ?? colors.onSurfaceTertiary, fontWeight: action.tone ? "600" : "400" }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A card on the card layer. `group` = rows divided by hairlines. */
export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { card, radius, spacing } = useTheme();
  return (
    <View style={[card, { borderRadius: radius.lg, padding: padded ? spacing.gutter : 0 }, style]}>
      {children}
    </View>
  );
}

/** Rows on one card, separated by hairlines inset to where the row's
 * text starts (iOS grouped-list style). `inset` = that offset: 16 for a
 * text-only row, 68 after a 40px icon well, 54 after a checkbox. */
export function Group({ children, style, inset = 16 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; inset?: number }) {
  const { colors, card, radius } = useTheme();
  const level = React.useContext(SurfaceLevelContext);
  const items = React.Children.toArray(children).filter(Boolean);
  // Settings > Aspect styles groups on the page; inside a sheet they stay flat.
  const surface = level === "card" ? { backgroundColor: colors.surfaceTertiary } : card;
  return (
    <View style={[surface, { borderRadius: radius.card, overflow: "hidden" }, style]}>
      <PaintedCardContext.Provider value={level !== "card"}>
        {items.map((child, i) => (
          <View key={i}>
            {/* Inside a sheet the group is surfaceTertiary, where `border` vanishes. */}
            {i > 0 ? <View style={{ height: 1, marginLeft: inset, backgroundColor: level === "card" ? colors.borderStrong : colors.border }} /> : null}
            {child}
          </View>
        ))}
      </PaintedCardContext.Provider>
    </View>
  );
}

/** Tinted icon well -- the color says which Space/kind a row belongs to. */
export function IconWell({ icon, color, tint, size = 40 }: { icon: IconName; color: string; tint?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: hexToRgba(color, 0.16), alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={size * 0.45} color={tint ?? color} />
    </View>
  );
}

/** One row inside a Group: leading slot, title + subtitle, trailing slot. */
export function Row({
  leading,
  title,
  subtitle,
  subtitleColor,
  trailing,
  onPress,
  onLongPress,
  testID,
  chevron,
  strike,
  dim,
  destructive,
}: {
  leading?: React.ReactNode;
  title: string;
  /** Plain text, or nested <Text> runs (e.g. "Mogosesti · " + a colored
   * status) -- rendered inside the subtitle Text either way. */
  subtitle?: React.ReactNode;
  subtitleColor?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
  chevron?: boolean;
  strike?: boolean;
  dim?: boolean;
  /** Title in the error color (a "Șterge" action row). */
  destructive?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const onCard = React.useContext(SurfaceLevelContext) === "card";
  // In a page Group the group paints the card (fill, rim, shadow); an
  // opaque row would hide its rim and defeat Settings > Aspect's opacity.
  // (`!onCard`: a Sheet opened from inside such a Group still inherits the
  // context, but its rows sit on the sheet's own layer.)
  const painted = React.useContext(PaintedCardContext) && !onCard;
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, paddingVertical: spacing.sm + 2, opacity: dim ? 0.5 : 1 }}>
        <Text
          style={{ fontSize: 15, fontWeight: "500", color: destructive ? colors.error : colors.onSurface, textDecorationLine: strike ? "line-through" : "none" }}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ marginTop: 2, fontSize: 13, color: subtitleColor ?? colors.onSurfaceTertiary }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} /> : null}
    </>
  );
  const style = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 58,
    backgroundColor: painted ? "transparent" : onCard ? colors.surfaceTertiary : colors.surfaceSecondary,
  };
  if (!onPress && !onLongPress) return <View testID={testID} style={style}>{content}</View>;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      scaleTo={1}
      pressedStyle={{ backgroundColor: onCard ? colors.segmentActive : colors.surfaceTertiary }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={style}
    >
      {content}
    </PressableScale>
  );
}

/** Small tinted label -- urgency (Restant/Azi), status, counts. */
export function Chip({ label, color, filled = true, icon }: { label: string; color: string; filled?: boolean; icon?: IconName }) {
  const { radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: filled ? 8 : 0,
        paddingVertical: 4,
        borderRadius: radius.sm,
        backgroundColor: filled ? hexToRgba(color, 0.08) : "transparent",
      }}
    >
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={{ fontSize: 12, fontWeight: filled ? "600" : "500", color }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Pill button on the card layer (Documente / Arhivă / filters). */
export function Pill({
  label,
  icon,
  onPress,
  active,
  tone,
  testID,
  dashed,
  badge,
  a11yLabel,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  active?: boolean;
  /** Fill when active -- a Space color; defaults to the raised layer. */
  tone?: string;
  testID?: string;
  dashed?: boolean;
  /** A small red count after the label (e.g. expired documents). */
  badge?: number;
  /** Screen-reader label when the visible one isn't enough ("Documente, 1 expirat"). */
  a11yLabel?: string;
}) {
  const { colors, spacing, radius } = useTheme();
  const activeFill = tone ?? colors.surfaceTertiary;
  const fg = active && tone ? readableOn(tone) : active ? colors.onSurface : dashed ? colors.onSurfaceTertiary : colors.onSurface;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={a11yLabel ?? label}
      hitSlop={{ top: 2, bottom: 2 }}
      scaleTo={0.97}
      style={{
        height: 40,
        paddingHorizontal: spacing.md + 2,
        borderRadius: radius.pill,
        backgroundColor: active ? activeFill : dashed ? "transparent" : colors.surfaceSecondary,
        borderWidth: dashed ? 1.5 : 0,
        borderStyle: dashed ? "dashed" : "solid",
        borderColor: colors.borderStrong,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon ? <Ionicons name={icon} size={15} color={active ? fg : colors.onSurfaceTertiary} /> : null}
      <Text style={{ fontSize: 13, fontWeight: active ? "600" : "500", color: fg }} numberOfLines={1}>{label}</Text>
      {badge && badge > 0 ? (
        <View style={{ height: 18, minWidth: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: readableOn(colors.error) }}>{badge}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

/** Equal-width segmented filter on the card layer. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  /** `badge`: a small count after the label (red = overdue, amber =
   * today) -- Casă's "De rezolvat"; Mașină passes none. */
  options: { key: K; label: string; badge?: { count: number; tone: "error" | "warning" }; a11yLabel?: string }[];
  value: K;
  onChange: (key: K) => void;
  testIDPrefix?: string;
}) {
  const { colors, radius } = useTheme();
  const level = React.useContext(SurfaceLevelContext);
  return (
    <View style={{ flexDirection: "row", gap: 4, backgroundColor: level === "card" ? colors.surfaceTertiary : colors.segmentTrack, borderRadius: radius.md, padding: 4 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={testIDPrefix ? `${testIDPrefix}-${o.key}` : undefined}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.a11yLabel}
            hitSlop={{ top: 2, bottom: 2 }}
            style={{
              flex: 1,
              height: 40,
              borderRadius: radius.inner,
              backgroundColor: on ? colors.segmentActive : "transparent",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              paddingHorizontal: 4,
            }}
          >
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: on ? "600" : "400", color: on ? colors.onSurface : colors.onSurfaceTertiary }}>
              {o.label}
            </Text>
            {o.badge && o.badge.count > 0 ? (() => {
              const bg = o.badge.tone === "error" ? colors.error : colors.warning;
              return (
                <View style={{ height: 16, minWidth: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: readableOn(bg) }}>{o.badge.count}</Text>
                </View>
              );
            })() : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full-width action button. `tone` = fill color (a Space color for the
 * primary action inside that Space); `variant` picks the recipe. */
export function Button({
  label,
  onPress,
  icon,
  tone,
  variant = "primary",
  disabled,
  testID,
  compact,
  loading,
  a11yLabel,
}: {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  tone?: string;
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  disabled?: boolean;
  testID?: string;
  compact?: boolean;
  /** Shows a spinner in place of the label and blocks presses. */
  loading?: boolean;
  /** Screen-reader label when the visible one isn't enough ("Înainte, pasul 2 din 4"). */
  a11yLabel?: string;
}) {
  const { colors, radius, spacing, layout } = useTheme();
  // Settings > Aspect > Butoane: "outline" draws the same colour as a
  // border + label on no fill (ghost stays as is).
  const outline = layout.buttonStyle === "outline" && variant !== "ghost";
  const ink = variant === "primary" ? tone ?? colors.onSurface : variant === "destructive" ? colors.error : colors.borderStrong;
  const fill = outline
    ? "transparent"
    : variant === "primary" ? tone ?? colors.onSurface
      : variant === "secondary" ? colors.surfaceTertiary
        : variant === "destructive" ? hexToRgba(colors.error, 0.12)
          : "transparent";
  const fg = outline
    ? variant === "secondary" ? colors.onSurface : ink
    : variant === "primary" ? (tone ? readableOn(tone) : colors.surface)
      : variant === "destructive" ? colors.error
        : variant === "ghost" ? colors.onSurfaceTertiary
          : colors.onSurface;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={{
        // min, not fixed: a larger Settings text size can grow the label.
        minHeight: compact ? 44 : 52,
        borderRadius: layout.buttonShape === "pill" ? radius.pill : radius.control,
        backgroundColor: fill,
        ...(outline ? { borderWidth: 1.5, borderColor: ink } : null),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={{ fontSize: 15, fontWeight: "600", color: fg }} numberOfLines={1}>{label}</Text>
        </>
      )}
    </PressableScale>
  );
}

/** Black or white text, whichever reads better on a fill (WCAG). */
export function readableOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#FFFFFF";
  const ch = (i: number) => {
    const c = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "#FFFFFF" : "#12100A";
}

/** Labelled text field on the raised layer; the focus ring takes the
 * screen's tone. `suffix` = a unit ("lei", "km"). */
export function Field({
  label,
  suffix,
  tone,
  error,
  hint,
  style,
  big,
  right,
  ...input
}: TextInputProps & {
  label?: string;
  suffix?: string;
  /** A control at the input's end (e.g. a show-password eye). */
  right?: React.ReactNode;
  tone?: string;
  error?: string | null;
  hint?: string | null;
  big?: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{label}</Text> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 52,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceTertiary,
          borderWidth: 1.5,
          borderColor: error ? colors.error : focused ? tone ?? colors.onSurface : "transparent",
          paddingHorizontal: spacing.lg,
        }}
      >
        <TextInput
          placeholderTextColor={colors.onSurfaceTertiary}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[
            { flex: 1, color: colors.onSurface, fontSize: big ? 22 : 15, fontWeight: big ? "600" : "400", paddingVertical: input.multiline ? 12 : 0, minHeight: input.multiline ? 88 : undefined, textAlignVertical: input.multiline ? "top" : "center" },
            style,
          ]}
        />
        {suffix ? <Text style={{ fontSize: 15, color: colors.onSurfaceTertiary, marginLeft: 8 }}>{suffix}</Text> : null}
        {right}
      </View>
      {error ? <Text style={{ fontSize: 13, color: colors.error }}>{error}</Text> : hint ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{hint}</Text> : null}
    </View>
  );
}

/** A tappable field-shaped control (date pickers, selects). */
export function FieldButton({
  label,
  value,
  placeholder,
  icon = "calendar-outline",
  onPress,
  testID,
}: {
  label?: string;
  value?: string | null;
  placeholder?: string;
  icon?: IconName;
  onPress: () => void;
  testID?: string;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{label}</Text> : null}
      <PressableScale
        testID={testID}
        onPress={onPress}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 52,
          borderRadius: radius.control,
          backgroundColor: colors.surfaceTertiary,
          paddingHorizontal: spacing.lg,
          gap: spacing.sm,
        }}
      >
        <Text style={{ flex: 1, fontSize: 15, color: value ? colors.onSurface : colors.onSurfaceTertiary }} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name={icon} size={17} color={colors.onSurfaceTertiary} />
      </PressableScale>
    </View>
  );
}

/** Centered empty state -- an icon, a line, an optional action. */
export function EmptyState({ icon, title, message, action }: { icon: IconName; title?: string; message: string; action?: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.sm }}>
      <Ionicons name={icon} size={28} color={colors.onSurfaceTertiary} />
      {title ? <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface, textAlign: "center" }}>{title}</Text> : null}
      <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center", lineHeight: 20 }}>{message}</Text>
      {action}
    </View>
  );
}

/** An on/off row on the raised layer: optional icon, label, optional
 * hint under it, and a switch drawn in the screen's tone. `children`
 * render under the row while it's on (e.g. a frequency picker). */
export function ToggleRow({
  label,
  hint,
  icon,
  value,
  onChange,
  tone,
  testID,
  children,
}: {
  label: string;
  hint?: string | null;
  icon?: IconName;
  value: boolean;
  onChange: (next: boolean) => void;
  tone?: string;
  testID?: string;
  children?: React.ReactNode;
}) {
  const { colors, spacing, radius } = useTheme();
  const on = tone ?? colors.success;
  return (
    <View style={{ borderRadius: radius.control, backgroundColor: colors.surfaceTertiary, overflow: "hidden" }}>
      <Pressable
        testID={testID}
        onPress={() => onChange(!value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={label}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 }}
      >
        {icon ? <Ionicons name={icon} size={18} color={value ? on : colors.onSurfaceTertiary} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: colors.onSurface }}>{label}</Text>
          {hint ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2, lineHeight: 18 }}>{hint}</Text> : null}
        </View>
        <View style={{ width: 46, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? on : colors.control, alignItems: value ? "flex-end" : "flex-start" }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" }} />
        </View>
      </Pressable>
      {value && children ? (
        <SurfaceLevelContext.Provider value="raised">
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>{children}</View>
        </SurfaceLevelContext.Provider>
      ) : null}
    </View>
  );
}

/** "Mai multe detalii" -- a quiet +/- row that reveals a form's optional
 * fields. `label` is what it shows while closed (it may name what's
 * inside: "Mai multe detalii (sumă, repetare, notă)"). */
export function Disclosure({
  label,
  open,
  onToggle,
  testID,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44 }}
    >
      <Ionicons name={open ? "remove" : "add"} size={16} color={colors.onSurfaceTertiary} />
      <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{open ? "Mai puține detalii" : label}</Text>
    </Pressable>
  );
}
