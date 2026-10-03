import React, { useRef, useState } from "react";
import { Animated, Modal, View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView } from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";

import type { HomeSupplyEntry } from "@/lib/spaces/home/home.types";

// Drag-to-dismiss on the sheet's own handle bar -- same classic
// PanGestureHandler + React Native Animated pattern as
// ExpenseEditModal's sheet (not react-native-reanimated's newer
// Gesture.Pan()/worklet system, confirmed live on a real device to do
// nothing in this project's Expo Go install). This component is only
// ever mounted while its caller holds a non-null entry (see
// HomeDashboard's `{restockSheetEntry ? <HomeSupplyRestockSheet ... />
// : null}`), so -- unlike ExpenseEditModal, which stayed mounted with
// Modal's own `visible` toggling -- a fresh mount every open already
// gives this a clean Animated.Value for free, no remount-key trick
// needed.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HomeSupplyRestockSheetProps = {
  entry: HomeSupplyEntry;
  onCancel: () => void;
  onConfirm: (quantity: number) => void;
};

/** Opened from "Restocked" on HomeSuppliesPage. Asks how much was just
 * bought -- the raw day-gap between restocks isn't a reliable signal on
 * its own (1 unit vs. 5 units of the same product naturally lasts
 * different lengths of time), so getSupplyRestockEstimate needs the
 * quantity per event to learn an actual units/day consumption rate. */
export function HomeSupplyRestockSheet({ entry, onCancel, onConfirm }: HomeSupplyRestockSheetProps) {
  const { colors, spacing, radius } = useTheme();
  const [quantity, setQuantity] = useState(String(entry.quantity ?? ""));
  const [error, setError] = useState("");

  const translateY = useRef(new Animated.Value(0)).current;

  const onHandleGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: translateY } }],
    { useNativeDriver: true },
  );

  const onHandleStateChange = (event: {
    nativeEvent: { state: number; translationY: number; velocityY: number };
  }) => {
    const { state, translationY, velocityY } = event.nativeEvent;
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;

    const pastThreshold = translationY > DISMISS_DISTANCE || velocityY > DISMISS_VELOCITY;
    if (pastThreshold) {
      Animated.timing(translateY, {
        toValue: 600,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onCancel();
      });
    } else {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    }
  };

  // Clamped at 0 -- the handle can't be dragged UP past the sheet's own
  // resting position, only down to dismiss.
  const clampedTranslateY = translateY.interpolate({
    inputRange: [0, 600],
    outputRange: [0, 600],
    extrapolateLeft: "clamp",
  });

  // Backdrop fades out in step with the drag instead of staying flatly
  // opaque until the sheet's already gone.
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, DISMISS_DISTANCE],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const handleConfirm = () => {
    const value = Number(quantity.replace(",", "."));
    if (!quantity.trim() || Number.isNaN(value) || value <= 0) {
      setError("Introdu o cantitate validă.");
      return;
    }
    onConfirm(value);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <AnimatedPressable
          onPress={onCancel}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", opacity: backdropOpacity }}
        />
        <Animated.View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg + 4,
            borderTopRightRadius: radius.lg + 4,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.xl,
            transform: [{ translateY: clampedTranslateY }],
          }}
        >
          <PanGestureHandler
            activeOffsetY={10}
            failOffsetY={-10}
            onGestureEvent={onHandleGestureEvent}
            onHandlerStateChange={onHandleStateChange}
          >
            <Animated.View style={{ height: 56, alignItems: "center", justifyContent: "center" }}>
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                }}
              />
            </Animated.View>
          </PanGestureHandler>

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSecondary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="refresh-outline" size={16} color={colors.onSurface} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface }}>Restock</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, marginLeft: 42, marginBottom: spacing.xl }} numberOfLines={1}>
            {entry.name}
          </Text>

          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: spacing.sm }}>
            Cât ai cumpărat?
          </Text>
          <View
            style={{
              height: 56,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceSecondary,
              borderWidth: 2,
              borderColor: colors.onSurface,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: spacing.md,
              marginBottom: spacing.sm,
            }}
          >
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              placeholder="0"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="decimal-pad"
              style={[
                { flex: 1, fontSize: 20, fontWeight: "700", color: colors.onSurface, paddingVertical: 0, borderWidth: 0 },
                Platform.OS === "web" && ({ outlineStyle: "none" } as any),
              ]}
            />
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary }}>{entry.unit}</Text>
          </View>

          {error ? (
            <Text style={{ fontSize: 12, color: colors.error, marginBottom: spacing.sm }}>{error}</Text>
          ) : (
            <Text style={{ fontSize: 11.5, color: colors.onSurfaceTertiary, marginBottom: spacing.lg, lineHeight: 16 }}>
              Cantitatea contează pentru estimare -- perioada dintre restock-uri diferă în funcție de cât cumperi de fiecare dată.
            </Text>
          )}

          <Pressable
            onPress={handleConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirmă restock-ul"
            style={{
              height: 52,
              borderRadius: radius.md,
              backgroundColor: colors.onSurface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.surface }}>Confirmă</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
