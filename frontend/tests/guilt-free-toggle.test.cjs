const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');

const load = (summary) => loadModule('components/dashboard/GuiltFree.tsx', {
  react: { createElement: (type, props) => ({ type, props }) },
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
