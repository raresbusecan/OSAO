import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, View, Text, ScrollView, KeyboardAvoidingView, Platform, Dimensions } from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { useReducedMotion } from "@/lib/motion";
import { CircleButton, InfoButton, readableOn, SurfaceLevelContext } from "./primitives";
import type { HelpKey } from "@/lib/help";
import { ConfirmHost, DialogLayerContext } from "@/lib/confirmHost";
import { dismissDialogAtLayer } from "@/lib/dialogCoordinator";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
const SCREEN_H = Dimensions.get("window").height;

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Leading icon well next to the title (filled in `tone`). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** The sheet's color -- a Space identity color inside a Space. */
  tone?: string;
  /** Pinned under the scrolling content (primary action). */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  /** Hide the round close button (e.g. a confirm step with its own buttons). */
  hideClose?: boolean;
  /** Center the header (small confirm/resolve sheets). */
  centered?: boolean;
  /** "ⓘ" next to the title: how this form/sheet works (lib/help.ts). */
  info?: HelpKey;
  /** A ‹ before the title: back to the sheet's previous step (e.g.
   * Simplu's "Adaugă": the space grid). Left-aligned header only. */
  onBack?: () => void;
  testID?: string;
  /** Resume a temporarily hidden source sheet at its previous scroll offset. */
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
};

/**
 * The redesign's one bottom sheet: slides up with a spring, the grab
 * handle drags it down to dismiss (backdrop fades with the drag), tap
 * outside closes. Built on the CLASSIC PanGestureHandler + RN Animated
 * -- the same combination ExpenseEditModal/SwipeBackView already proved
 * on-device; reanimated worklets don't run in this Expo Go install.
 *
 * Remounts its body on every open (keyed by an open counter) so a sheet
 * dragged away last time never reopens stuck half-way down.
 */
export function Sheet(props: SheetProps) {
  const dialogDepth = React.useContext(DialogLayerContext) + 1;
  const openCount = useRef(0);
  const wasVisible = useRef(false);
  if (props.visible && !wasVisible.current) openCount.current += 1;
  wasVisible.current = props.visible;

  return (
    <Modal visible={props.visible} transparent animationType="none" onRequestClose={() => { if (!dismissDialogAtLayer(dialogDepth)) props.onClose(); }} statusBarTranslucent>
      {props.visible ? (
        <DialogLayerContext.Provider value={dialogDepth}>
          <View style={{ flex: 1 }}>
            <SheetBody key={openCount.current} {...props} />
            <ConfirmHost inline />
          </View>
        </DialogLayerContext.Provider>
      ) : null}
    </Modal>
  );
}

function SheetBody({ onClose, title, subtitle, icon, tone, footer, children, hideClose, centered, info, onBack, testID, initialScrollOffset, onScrollOffsetChange }: SheetProps) {
  const { radius, colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const translateY = useRef(new Animated.Value(reduced ? 0 : SCREEN_H)).current;
  const drag = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 260, mass: 0.9 }).start();
  }, [reduced, translateY]);

  const close = () => {
    if (reduced) {
      onClose();
      return;
    }
    Animated.timing(translateY, { toValue: SCREEN_H, duration: 200, useNativeDriver: true }).start(() => onClose());
  };

  const onGesture = Animated.event([{ nativeEvent: { translationY: drag } }], { useNativeDriver: true });
  const onState = (e: { nativeEvent: { state: number; translationY: number; velocityY: number } }) => {
    const { state, translationY, velocityY } = e.nativeEvent;
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
    if (translationY > DISMISS_DISTANCE || velocityY > DISMISS_VELOCITY) {
      Animated.timing(drag, { toValue: SCREEN_H, duration: 180, useNativeDriver: true }).start(() => onClose());
    } else {
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 220 }).start();
    }
  };

  const offset = Animated.add(translateY, drag.interpolate({ inputRange: [0, SCREEN_H], outputRange: [0, SCREEN_H], extrapolateLeft: "clamp" }));
  const backdrop = offset.interpolate({ inputRange: [0, 300], outputRange: [1, 0], extrapolate: "clamp" });

  return (
    <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <AnimatedPressable
        onPress={close}
        accessibilityLabel="Închide"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(5,7,10,0.62)", opacity: backdrop }}
      />
      <Animated.View
        testID={testID}
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "92%",
          paddingBottom: Math.max(insets.bottom, spacing.lg),
          transform: [{ translateY: offset }],
        }}
      >
        <PanGestureHandler activeOffsetY={8} failOffsetY={-8} onGestureEvent={onGesture} onHandlerStateChange={onState}>
          <Animated.View style={{ paddingTop: 10, paddingBottom: spacing.sm, paddingHorizontal: spacing.gutter }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: spacing.md }} />
            {title ? (
              centered ? (
                <View style={{ alignItems: "center", gap: spacing.sm }}>
                  {icon ? (
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${tone ?? colors.onSurface}24`, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={icon} size={26} color={tone ?? colors.onSurface} />
                    </View>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface, textAlign: "center", flexShrink: 1 }}>{title}</Text>
                    {info ? <InfoButton topic={info} /> : null}
                  </View>
                  {subtitle ? <Text style={{ fontSize: 14, color: colors.onSurfaceTertiary, textAlign: "center", lineHeight: 20, maxWidth: 320 }}>{subtitle}</Text> : null}
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  {onBack ? <CircleButton icon="chevron-back" label="Înapoi" onPress={onBack} /> : null}
                  {icon ? (
                    <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: tone ?? colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={icon} size={19} color={tone ? readableOn(tone) : colors.onSurface} />
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <Text style={{ fontSize: 20, fontWeight: "600", color: colors.onSurface, flexShrink: 1 }} numberOfLines={2}>{title}</Text>
                      {info ? <InfoButton topic={info} /> : null}
                    </View>
                    {subtitle ? <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>{subtitle}</Text> : null}
                  </View>
                  {!hideClose ? <CircleButton icon="close" label="Închide" onPress={close} /> : null}
                </View>
              )
            ) : null}
          </Animated.View>
        </PanGestureHandler>

        <ScrollView
          contentOffset={initialScrollOffset == null ? undefined : { x: 0, y: initialScrollOffset }}
          onScroll={onScrollOffsetChange ? (event) => onScrollOffsetChange(event.nativeEvent.contentOffset.y) : undefined}
          scrollEventThrottle={onScrollOffsetChange ? 16 : undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: footer ? spacing.md : spacing.sm, gap: spacing.lg }}
          style={{ flexGrow: 0 }}
        >
          <SurfaceLevelContext.Provider value="card">{children}</SurfaceLevelContext.Provider>
        </ScrollView>
        {footer ? <View style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, gap: spacing.sm }}>{footer}</View> : null}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
