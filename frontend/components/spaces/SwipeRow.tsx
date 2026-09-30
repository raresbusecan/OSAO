import React, { useRef } from "react";
import { Pressable, Animated, Dimensions } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";

/**
 * Shared across every Space's row lists (piloted on Home's Tasks list
 * first, per explicit user request -- see BACKLOG.md) -- swipe right
 * reveals a green resolve action, swipe left reveals a red delete
 * action, same as iOS Mail/Reminders. A shortcut on top of whatever
 * checkbox/trash icon a row already has, never a replacement: both
 * stay visible, and this only ever fires the exact same onResolve/
 * onDelete callback a tap on them already would -- no parallel action
 * path, no new confirm/prompt logic.
 *
 * A swipe that clears TRIGGER_PERCENT of the screen width auto-fires
 * on release, no extra tap needed (Mail/Gmail's "commit swipe"). A
 * shorter swipe still reveals the panel, still tappable, but springs
 * back without firing if released before that point -- Swipeable only
 * has the one open/closed snap threshold, so it can't do both "always
 * stay open for a later tap" and "commit past a point."
 *
 * The action panel's width is a FIXED `TRIGGER_DISTANCE`, not `flex: 1`
 * -- flex sizing here looked right at rest, but confused Swipeable's
 * own leftWidth/rightWidth measurement (it expanded to the full row
 * width once overshoot was enabled), which made the open-snap
 * animation fling to nearly the full row width before firing/closing
 * instead of stopping crisply at the trigger point. A fixed width
 * equal to the trigger distance gives the same "fills the revealed
 * strip" look (the panel is already wide enough for any reveal up to
 * the trigger) without that side effect.
 */
const TRIGGER_PERCENT = 0.25;
const TRIGGER_DISTANCE = Dimensions.get("window").width * TRIGGER_PERCENT;

export type SwipeRowProps = {
  /** Omit entirely for a row with no resolve concept (e.g. Documents,
   * Expenses) -- no left-swipe reveal is rendered at all then, same
   * as those categories' own checkbox being conditionally omitted. */
  onResolve?: () => void;
  onDelete: () => void;
  /** Matches whatever the wrapped row's own corner radius is (0 for a
   * flat divided-list row) so the action panel's outer edge lines up. */
  cornerRadius: number;
  colors: { success: string; error: string };
  children: React.ReactNode;
};

export function SwipeRow({ onResolve, onDelete, cornerRadius, colors, children }: SwipeRowProps) {
  const ref = useRef<Swipeable>(null);

  return (
    <Swipeable
      ref={ref}
      friction={2}
      // Default is 10px each side (react-native-gesture-handler's own
      // Swipeable.js maps this straight to activeOffsetX: [-10, 10] on
      // its internal PanGestureHandler) -- comfortably inside normal
      // hand jitter during a long-press hold. Rows wrapped in this now
      // also carry a drag-to-reorder long-press (see HomeTasksPage's
      // UpcomingRow, the pilot for that feature) on the same nested
      // Pressable; qa-lead flagged that jitter crossing this row's own
      // swipe-activation threshold mid-hold would let the Swipeable
      // steal the gesture and silently cancel the pending long-press.
      // Widened well past normal jitter -- a real intentional swipe
      // moves far more than 20px before its own trigger point anyway
      // (see TRIGGER_DISTANCE below), so this costs nothing there.
      dragOffsetFromLeftEdge={20}
      dragOffsetFromRightEdge={20}
      // Overshoot OFF, now that the action panel's own width IS
      // TRIGGER_DISTANCE (see the panel width comment above) -- with
      // overshoot disabled, Swipeable clamps the drag flat at
      // leftWidth/rightWidth (which now equals TRIGGER_DISTANCE), so
      // the row physically cannot be dragged past where the colored
      // panel ends. qa-lead caught this: with overshoot left ON, nothing
      // clamped the drag at all (overshootFriction defaults to 1, i.e.
      // no resistance), so an ordinary swipe past ~100px outran the
      // fixed-width panel and showed a gap of the row's own background
      // -- a scaled-down repeat of the bug the fixed-width panel itself
      // was meant to fix. Clamping the drag at the panel's edge removes
      // the gap entirely instead of just narrowing it.
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={TRIGGER_DISTANCE}
      rightThreshold={TRIGGER_DISTANCE}
      onSwipeableOpen={(direction) => {
        ref.current?.close();
        if (direction === "left") onResolve?.();
        else onDelete();
      }}
      renderLeftActions={
        onResolve
          ? (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => (
              <Pressable
                onPress={() => {
                  ref.current?.close();
                  onResolve();
                }}
                accessibilityRole="button"
                accessibilityLabel="Swipe to resolve"
                style={{
                  width: TRIGGER_DISTANCE,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.success,
                  borderTopLeftRadius: cornerRadius,
                  borderBottomLeftRadius: cornerRadius,
                }}
              >
                <Animated.View
                  style={{
                    transform: [
                      { scale: dragX.interpolate({ inputRange: [0, TRIGGER_DISTANCE], outputRange: [0.6, 1.15], extrapolate: "clamp" }) },
                    ],
                  }}
                >
                  <Ionicons name="checkmark" size={20} color="#fff" />
                </Animated.View>
              </Pressable>
            )
          : undefined
      }
      renderRightActions={(_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => (
        <Pressable
          onPress={() => {
            ref.current?.close();
            onDelete();
          }}
          accessibilityRole="button"
          accessibilityLabel="Swipe to delete"
          style={{
            width: TRIGGER_DISTANCE,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.error,
            borderTopRightRadius: cornerRadius,
            borderBottomRightRadius: cornerRadius,
          }}
        >
          <Animated.View
            style={{
              transform: [
                { scale: dragX.interpolate({ inputRange: [-TRIGGER_DISTANCE, 0], outputRange: [1.15, 0.6], extrapolate: "clamp" }) },
              ],
            }}
          >
            <Ionicons name="trash" size={20} color="#fff" />
          </Animated.View>
        </Pressable>
      )}
    >
      {children}
    </Swipeable>
  );
}
