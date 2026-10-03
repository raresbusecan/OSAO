import React, { useRef, useState } from "react";
import { Animated, View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { confirmAction } from "@/lib/confirm";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { ExpenseDatePickerSheet } from "./ExpenseDatePickerSheet";

// Drag-to-dismiss on the sheet's own handle bar -- built on the classic
// PanGestureHandler + React Native's own Animated API (not
// react-native-reanimated's newer Gesture.Pan()/worklet system), same
// choice SwipeBackView settled on after confirming live on a real
// device that reanimated v4's worklets silently do nothing in this
// project's Expo Go install. Scoped to the handle bar specifically
// (not the whole sheet) so it never competes with the form's own
// ScrollView for vertical drags.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

// Plain Pressable isn't an Animated-aware component -- wrapping it this
// way is RN's own documented pattern for animating a style prop (here,
// the backdrop's opacity) on a component that doesn't extend
// Animated.Component natively.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ExpenseEditModalProps = {
  entry: ExpenseEntry | null;
  onClose: () => void;
  onSave: (entry: ExpenseEntry) => void;
  onDelete: (id: string) => void;
};

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Astăzi";
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

/** Opened by tapping a row in ExpensesListSection -- was previously not
 * possible at all (rows were plain, non-pressable Views). Same fields
 * ExpensesAddBar collects (name, price, date, notes).
 *
 * Just the Modal wrapper -- the actual sheet (ExpenseEditSheet below)
 * is keyed on `entry.id` and only ever rendered while `entry` is
 * non-null, so every open is a genuinely fresh mount. Without that key,
 * dragging the sheet closed left its `translateY` Animated.Value
 * sitting at its off-screen dismiss position (this same component
 * instance stays alive, Modal's `visible` prop hides it but doesn't
 * unmount its children) -- the next open reused that same stale
 * instance and rendered the sheet fully translated off-screen, visible
 * only as the empty dark backdrop. */
export function ExpenseEditModal({ entry, onClose, onSave, onDelete }: ExpenseEditModalProps) {
  return (
    <Modal visible={!!entry} transparent animationType="slide" onRequestClose={onClose}>
      {entry ? (
        <ExpenseEditSheet
          key={entry.id}
          entry={entry}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
        />
      ) : null}
    </Modal>
  );
}

function ExpenseEditSheet({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: ExpenseEntry;
  onClose: () => void;
  onSave: (entry: ExpenseEntry) => void;
  onDelete: (id: string) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState(entry.name);
  const [price, setPrice] = useState(String(entry.price));
  const [date, setDate] = useState(entry.date);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [datePickerVisible, setDatePickerVisible] = useState(false);
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
        if (finished) onClose();
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
  // opaque until the sheet's already gone -- reaches 0 well before
  // DISMISS_DISTANCE so it's basically invisible by the point a
  // release would actually dismiss, not still visibly dark then.
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, DISMISS_DISTANCE],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const parsedPrice = Number(price.replace(",", "."));
  const canSubmit = name.trim().length > 0 && price.trim().length > 0 && !Number.isNaN(parsedPrice) && parsedPrice >= 0;

  const handleSave = () => {
    if (!canSubmit) {
      setError("Introdu un nume și un preț valid.");
      return;
    }
    onSave({ ...entry, name: name.trim(), price: parsedPrice, date, notes: notes.trim() || undefined });
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      "Șterge cheltuiala",
      `Ștergi "${entry.name}" definitiv?`,
      { confirmLabel: "Șterge", destructive: true },
    );
    if (confirmed) onDelete(entry.id);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, justifyContent: "flex-end" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AnimatedPressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", opacity: backdropOpacity }}
      />
      <Animated.View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          maxHeight: "85%",
          transform: [{ translateY: clampedTranslateY }],
        }}
      >
        <PanGestureHandler
          activeOffsetY={10}
          failOffsetY={-10}
          onGestureEvent={onHandleGestureEvent}
          onHandlerStateChange={onHandleStateChange}
        >
          <Animated.View
            style={{ height: 56, alignItems: "center", justifyContent: "center" }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                alignSelf: "center",
              }}
            />
          </Animated.View>
        </PanGestureHandler>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.onSurface }}>Editează cheltuiala</Text>

          <TextInput
            testID="expense-edit-name"
            value={name}
            onChangeText={setName}
            placeholder="What did you buy?"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={{
              height: 48,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.sm,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.onSurface,
              fontSize: 14,
            }}
          />

          <TextInput
            testID="expense-edit-price"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="Price"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={{
              height: 48,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.sm,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.onSurface,
              fontSize: 14,
            }}
          />

          <Pressable
            testID="expense-edit-date"
            onPress={() => setDatePickerVisible(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              height: 48,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.sm,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 14, color: colors.onSurface }}>{date ? formatShortDate(date) : ""}</Text>
            <Ionicons name="calendar-outline" size={16} color={colors.onSurfaceTertiary} />
          </Pressable>

          <TextInput
            testID="expense-edit-notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Notă (opțional)"
            placeholderTextColor={colors.onSurfaceTertiary}
            multiline
            style={{
              minHeight: 60,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderRadius: radius.sm,
              backgroundColor: "transparent",
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.onSurface,
              fontSize: 14,
              textAlignVertical: "top",
            }}
          />

          {error ? <Text style={{ fontSize: 12, color: colors.error }}>{error}</Text> : null}

          <Pressable
            testID="expense-edit-save"
            onPress={handleSave}
            style={{
              height: 50,
              borderRadius: radius.sm,
              backgroundColor: colors.onSurface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.surface }}>Salvează</Text>
          </Pressable>

          <Pressable
            testID="expense-edit-delete"
            onPress={handleDelete}
            style={{ height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.error }}>Șterge</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>

      {datePickerVisible ? (
        <ExpenseDatePickerSheet
          value={date}
          onCancel={() => setDatePickerVisible(false)}
          onSelect={(picked) => {
            setDate(picked);
            setDatePickerVisible(false);
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
