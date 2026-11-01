const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, loadEffect } = require('./helpers/load-ts.cjs');

function swipeRow(props = {}) {
  const calls = [];
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef: () => ({ current: { close: () => calls.push('close') } }) };
  const { SwipeRow } = loadModule('components/spaces/SwipeRow.tsx', {
    react: React,
    'react-native': { Pressable: 'Pressable', Dimensions: { get: () => ({ width: 400 }) } },
    'react-native-gesture-handler/ReanimatedSwipeable': { __esModule: true, default: 'Swipeable' },
    'react-native-reanimated': { __esModule: true, default: { View: 'Animated.View' }, Extrapolation: { CLAMP: 'clamp' }, useAnimatedStyle: (fn) => fn(), interpolate: (x) => 0.6 + Math.min(1, Math.max(0, x / 100)) * 0.55 },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    // SwipeRow keeps its row opaque over the action panels (OpaqueRows).
    '@/components/ui/primitives': { OpaqueRows: 'OpaqueRows' },
  });
  return { calls, row: SwipeRow({ cornerRadius: 12, colors: { success: 'green', error: 'red' }, onResolve: () => calls.push('resolve'), onDelete: () => calls.push('delete'), ...props }) };
}

test('SDK 58 swipes preserve resolve-right and delete-left, closing before either action', () => {
  const { row, calls } = swipeRow();
  row.props.onSwipeableOpen('right');
  row.props.onSwipeableOpen('left');
  assert.deepEqual(calls, ['close', 'resolve', 'close', 'delete']);
  assert.equal(row.props.dragOffsetFromLeft, 20);
  assert.equal(row.props.dragOffsetFromRight, -20);
  assert.equal(row.props.overshootLeft, false);
  assert.equal(row.props.overshootRight, false);
  const action = row.props.renderLeftActions({ value: 1 }, { value: 100 });
  action.props.onPress();
  assert.deepEqual(calls.slice(-2), ['close', 'resolve']);
});

test('read-only rows and absent resolve/delete actions do not acquire swipe actions', () => {
  assert.equal(swipeRow({ disabled: true }).row.props.onSwipeableOpen, undefined);
  assert.equal(swipeRow({ onResolve: undefined }).row.props.renderLeftActions, undefined);
  assert.equal(swipeRow({ onDelete: undefined }).row.props.renderRightActions, undefined);
});

test('native Back removal keeps its return listener until Router emits after unmount', () => {
  let callback;
  const pending = [], returned = [];
  let subscribed = true;
  const cleanup = loadEffect('app/record-action.tsx', 'navigation.addListener("removed"', {
    navigation: { addListener: (event, fn) => { assert.equal(event, 'removed'); callback = fn; return () => { subscribed = false; }; } },
    originSpace: '/7', markTrailReturn: (href) => returned.push(href), queueMicrotask: (fn) => pending.push(fn),
  })();
  cleanup();
  assert.equal(subscribed, true);
  callback();
  assert.deepEqual(returned, ['/7']);
  pending.forEach((fn) => fn());
  assert.equal(subscribed, false);
});
