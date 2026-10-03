import React, { useRef } from "react";
import { Animated, Dimensions, StyleProp, View, ViewStyle } from "react-native";
import { PanGestureHandler, State } from "react-native-gesture-handler";

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
 * Only the left EDGE (`EDGE_WIDTH`) is a gesture hot-zone -- a real,
 * separately-positioned narrow `View` carrying its own gesture handler,
 * not a hitSlop restriction on the full-width content (an earlier
 * version tried that; it traced correctly through gesture-handler's
 * web implementation but did nothing on a real device).
 *
 * Built on the CLASSIC `PanGestureHandler` + React Native's own
 * `Animated` API, not `react-native-reanimated`'s newer
 * Gesture.Pan()/worklet system -- confirmed live on a real device that
 * `react-native-reanimated` v4's worklets silently do nothing in this
 * project's Expo Go install (almost certainly a native-code version
 * mismatch between the project's reanimated/react-native-worklets
 * version and whatever's baked into that Expo Go binary -- Expo Go
 * ships fixed native code per SDK version and can't run a mismatched
 * native module, unlike pure-JS changes). `SwipeRow`'s own resolve/
 * delete swipe uses this exact same classic-API/Animated combination
 * (via `Swipeable`) and was confirmed working on the same device, so
 * this mirrors a proven-functional code path instead of the broken one.
 *
 * EDGE_WIDTH widened to 32px per explicit user request (was 24, matching
 * the page's own horizontal padding, spacing.xl). Past that padding a
 * row's own content starts, so on a page with SwipeRow-wrapped rows at
 * the very top (Home Tasks, the category pages, Supplies) this now
 * overlaps ~8px into each row's own touch area -- not yet reported as a
 * real conflict, but worth checking first if a future bug report
 * describes a swipe near a page's top-left corner misfiring as the
 * wrong gesture.
 */
const SCREEN_WIDTH = Dimensions.get("window").width;
const EDGE_WIDTH = 32;
const TRIGGER_PERCENT = 0.3;
const TRIGGER_DISTANCE = SCREEN_WIDTH * TRIGGER_PERCENT;
const TRIGGER_VELOCITY = 800;

export type SwipeBackViewProps = {
  onBack: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SwipeBackView({ onBack, children, style }: SwipeBackViewProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true },
  );

  const onHandlerStateChange = (event: {
    nativeEvent: { state: number; translationX: number; velocityX: number };
  }) => {
    const { state, translationX, velocityX } = event.nativeEvent;
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;

    const pastThreshold = translationX > TRIGGER_DISTANCE || velocityX > TRIGGER_VELOCITY;
    if (pastThreshold) {
      // Slides the rest of the way off-screen, THEN fires onBack --
      // firing mid-animation would unmount this view (its parent flips
      // a boolean to hide it) while still visually sliding, an abrupt
      // cut instead of a completed motion.
      Animated.timing(translateX, {
        toValue: SCREEN_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onBack();
      });
    } else {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    }
  };

  // Clamped at 0 -- a drag starting at the very edge can still report a
  // few px of negative translationX before failOffsetX cancels the
  // gesture; without this the content would flash a sliver to the left
  // of its resting position for that one frame.
  const clampedTranslateX = translateX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [0, SCREEN_WIDTH],
    extrapolateLeft: "clamp",
  });

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[{ flex: 1 }, style, { transform: [{ translateX: clampedTranslateX }] }]}
      >
        {children}
      </Animated.View>
      {/* On top of (not inside) the animated content, so it keeps
          catching the next swipe even mid-animation. */}
      <PanGestureHandler
        activeOffsetX={10}
        failOffsetX={-10}
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
      >
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: EDGE_WIDTH,
          }}
        />
      </PanGestureHandler>
    </View>
  );
}
