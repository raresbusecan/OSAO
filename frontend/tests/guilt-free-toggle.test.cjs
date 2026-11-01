const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');

const load = (summary) => loadModule('components/dashboard/GuiltFree.tsx', {
  react: { createElement: (type, props) => ({ type, props }), useState: (initial) => [initial, () => {}] },
  'react-native': { View: 'View', Text: 'Text' },
  '@expo/vector-icons': { Ionicons: 'Ionicons' },
  '@/lib/theme': { useTheme: () => ({ colors: {}, spacing: {}, radius: {} }) },
  '@/lib/format': { lei: String },
  '@/lib/budget/plan': { useBudgetPlan: () => summary },
  '@/components/ui/primitives': { ToggleRow: 'ToggleRow' },
}).GuiltFreeToggle;

test('guilt-free shows on fitting forms once there is a plan; elsewhere only to undo a flag', () => {
  const Toggle = load({ plan: {}, guiltFree: { budget: 300 } });
  assert.equal(Toggle({ value: false, onChange() {} }).type, 'ToggleRow');
  assert.equal(Toggle({ value: false, onChange() {}, onlyIfSet: true }), null, 'fuel/services/documents/bills: hidden');
  assert.equal(Toggle({ value: true, onChange() {}, onlyIfSet: true }).type, 'ToggleRow', 'a flagged record can still be undone');
  const NoPlan = load(null);
  assert.equal(NoPlan({ value: false, onChange() {} }), null);
});

test('switching a flag off mid-edit keeps the toggle so it can be switched back', () => {
  let kept;
  const Toggle = loadModule('components/dashboard/GuiltFree.tsx', {
    react: { createElement: (type, props) => ({ type, props }), useState: (initial) => [kept ??= initial, () => {}] },
    'react-native': { View: 'View', Text: 'Text' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@/lib/theme': { useTheme: () => ({ colors: {}, spacing: {}, radius: {} }) },
    '@/lib/format': { lei: String },
    '@/lib/budget/plan': { useBudgetPlan: () => ({ plan: {}, guiltFree: { budget: 300 } }) },
    '@/components/ui/primitives': { ToggleRow: 'ToggleRow' },
  }).GuiltFreeToggle;
  assert.equal(Toggle({ value: true, onChange() {}, onlyIfSet: true }).type, 'ToggleRow');
  assert.equal(Toggle({ value: false, onChange() {}, onlyIfSet: true }).type, 'ToggleRow', 'still there after switching off');
});

test('a form whose values load after its first render still latches the flag', () => {
  let state;
  const Toggle = loadModule('components/dashboard/GuiltFree.tsx', {
    react: { createElement: (type, props) => ({ type, props }), useState: (initial) => { if (state === undefined) state = initial; return [state, (next) => { state = next; }]; } },
    'react-native': { View: 'View', Text: 'Text' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@/lib/theme': { useTheme: () => ({ colors: {}, spacing: {}, radius: {} }) },
    '@/lib/format': { lei: String },
    '@/lib/budget/plan': { useBudgetPlan: () => ({ plan: {}, guiltFree: { budget: 300 } }) },
    '@/components/ui/primitives': { ToggleRow: 'ToggleRow' },
  }).GuiltFreeToggle;
  assert.equal(Toggle({ value: false, onChange() {}, onlyIfSet: true }), null, 'first render, values not loaded yet');
  assert.equal(Toggle({ value: true, onChange() {}, onlyIfSet: true }).type, 'ToggleRow', 'the record loads flagged');
  assert.equal(Toggle({ value: false, onChange() {}, onlyIfSet: true }).type, 'ToggleRow', 'switched off: can be switched back');
});
