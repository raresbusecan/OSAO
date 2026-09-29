import React from "react";
import { Dimensions, StyleProp, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

/**
 * Piloted on Home's Tasks page first, per explicit user request -- the
 * standard iOS/Android "swipe from the left edge to go back" gesture,
 * as a shortcut on top of whatever back button/chevron a page already
 * has (never a replacement -- Apple's own HIG is explicit that a
 * shortcut gesture supplements the visible control, it doesn't hide
 * it). Most "pages" in this app aren't real navigator routes -- they're
 * conditionally-rendered views inside one Space screen, each with its
 * own `onBack` prop already wired to a visible back button -- so this
 * wraps that same content and fires the identical `onBack` a tap on
 * the chevron already would, not a second/parallel navigation path.
 *
 * Only the left EDGE (`EDGE_WIDTH`) is a gesture hot-zone, via
 * `hitSlop`, not the whole screen -- matches the real iOS edge-swipe
 * (which only activates from the very edge, not a swipe anywhere) and
 * keeps this from ever competing with a horizontal gesture already
 * live elsewhere on the same screen (SwipeRow's own resolve/delete
 * swipe on a list row, a horizontal ScrollView, ...).
 */
const SCREEN_WIDTH = Dimensions.get("window").width;
const EDGE_WIDTH = 24;
const TRIGGER_PERCENT = 0.3;
const TRIGGER_DISTANCE = SCREEN_WIDTH * TRIGGER_PERCENT;
const TRIGGER_VELOCITY = 800;

export type SwipeBackViewProps = {
  onBack: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SwipeBackView({ onBack, children, style }: SwipeBackViewProps) {
  const translateX = useSharedValue(0);

  const pan = Gesture.Pan()
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .activeOffsetX(10)
    .failOffsetX(-10)
    .onUpdate((e) => {
      translateX.value = Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      const pastThreshold = e.translationX > TRIGGER_DISTANCE || e.velocityX > TRIGGER_VELOCITY;
      if (pastThreshold) {
        // Slides the rest of the way off-screen, THEN fires onBack --
        // firing mid-animation would unmount this view (its parent
        // flips a boolean to hide it) while still visually sliding,
        // an abrupt cut instead of a completed motion.
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onBack)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}
