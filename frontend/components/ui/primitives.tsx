import React from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, type TextInputProps, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { PressableScale } from "./PressableScale";

/**
 * Shared building blocks for the 2026-10 redesign -- one place for the
 * pieces every screen repeats (round header buttons, the identity block
 * under them, card groups, section headers, chips, segmented filters,
 * buttons, form fields), so ~60 screens read as one system instead of
 * each re-deriving radii and paddings. Mockup: the "orgOS redesign"
 * canvas artifact. Values come from lib/theme.tsx's tokens.
 */

type IconName = keyof typeof Ionicons.glyphMap;

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
  const isBack = icon === "chevron-back";
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
export function Identity({ color, kicker, title, subtitle }: { color?: string; kicker?: string; title: string; subtitle?: string | null }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      {kicker ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }} numberOfLines={1}>{kicker}</Text>
        </View>
      ) : null}
      <Text style={{ fontSize: 28, fontWeight: "600", letterSpacing: -0.6, color: colors.onSurface }} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{subtitle}</Text> : null}
    </View>
  );
}

/** Plain page title for the top-level tabs (Spații, Calendar, Buget). */
export function PageTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
      <Text style={{ fontSize: 28, fontWeight: "600", letterSpacing: -0.6, color: colors.onSurface, flexShrink: 1 }}>{children}</Text>
      {right}
    </View>
  );
}

/** A section's heading, with an optional text action on the right. */
export function SectionHeader({
  title,
  action,
  muted,
}: {
  title: string;
  action?: { label: string; onPress: () => void; testID?: string };
  /** Smaller grey heading (month groups, settings groups). */
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: muted ? 4 : 0 }}>
      <Text style={muted ? { fontSize: 13, color: colors.onSurfaceTertiary } : { fontSize: 17, fontWeight: "600", color: colors.onSurface }}>
        {title}
      </Text>
      {action ? (
        <Pressable
          testID={action.testID}
          onPress={action.onPress}
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: "center", paddingLeft: 12 }}
        >
          <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A card on the card layer. `group` = rows divided by hairlines. */
export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={[{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: padded ? spacing.gutter : 0 }, style]}>
      {children}
    </View>
  );
}

/** Rows on one card, separated by hairlines inset to where the row's
 * text starts (iOS grouped-list style). `inset` = that offset: 16 for a
 * text-only row, 68 after a 40px icon well, 54 after a checkbox. */
export function Group({ children, style, inset = 16 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; inset?: number }) {
  const { colors, radius } = useTheme();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.card, overflow: "hidden" }, style]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <View style={{ height: 1, marginLeft: inset, backgroundColor: colors.border }} /> : null}
          {child}
        </View>
      ))}
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
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string | null;
  subtitleColor?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
  chevron?: boolean;
  strike?: boolean;
  dim?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, paddingVertical: spacing.sm + 2, opacity: dim ? 0.5 : 1 }}>
        <Text
          style={{ fontSize: 15, fontWeight: "500", color: colors.onSurface, textDecorationLine: strike ? "line-through" : "none" }}
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
    backgroundColor: colors.surfaceSecondary,
  };
  if (!onPress && !onLongPress) return <View testID={testID} style={style}>{content}</View>;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={1}
      pressedStyle={{ backgroundColor: colors.surfaceTertiary }}
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
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: filled ? 8 : 0,
        paddingVertical: 4,
        borderRadius: 6,
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
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  active?: boolean;
  /** Fill when active -- a Space color; defaults to the raised layer. */
  tone?: string;
  testID?: string;
  dashed?: boolean;
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
      accessibilityLabel={label}
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
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  testIDPrefix?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4, backgroundColor: colors.segmentTrack, borderRadius: radius.md, padding: 4 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={testIDPrefix ? `${testIDPrefix}-${o.key}` : undefined}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            hitSlop={{ top: 2, bottom: 2 }}
            style={{
              flex: 1,
              height: 40,
              borderRadius: radius.inner,
              backgroundColor: on ? colors.segmentActive : "transparent",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 4,
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: on ? "600" : "400", color: on ? colors.onSurface : colors.onSurfaceTertiary }}>
              {o.label}
            </Text>
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
}) {
  const { colors, radius } = useTheme();
  const fill =
    variant === "primary" ? tone ?? colors.onSurface
      : variant === "secondary" ? colors.surfaceTertiary
        : variant === "destructive" ? hexToRgba(colors.error, 0.12)
          : "transparent";
  const fg =
    variant === "primary" ? (tone ? readableOn(tone) : colors.surface)
      : variant === "destructive" ? colors.error
        : variant === "ghost" ? colors.onSurfaceTertiary
          : colors.onSurface;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={{
        height: compact ? 44 : 52,
        borderRadius: radius.control,
        backgroundColor: fill,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 16,
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
  ...input
}: TextInputProps & {
  label?: string;
  suffix?: string;
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
