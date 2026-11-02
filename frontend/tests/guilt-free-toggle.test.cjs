/* global __dirname */
// "Buget simplu" (2026-11-02, user decision): the guilt_free flag is ignored
// everywhere, so the "Bani fără vină" toggle and chip are gone from every
// live screen. This used to test GuiltFreeToggle's visibility rules; it now
// guards that no live file mounts it again. components/dashboard/GuiltFree.tsx
// (and GuiltFreePage.tsx) stay on disk as dead files -- deletion is denied.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const DEAD = new Set([
  'components/dashboard/GuiltFree.tsx',
  'components/dashboard/GuiltFreePage.tsx',
  'components/dashboard/IncomeSplitCard.tsx',
  'components/dashboard/SplitSheet.tsx',
  'components/dashboard/BudgetCreditPage.tsx',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('no live file imports the guilt-free toggle/chip or the dead Buget pages', () => {
  const offenders = [];
  for (const dir of ['app', 'components', 'lib']) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (DEAD.has(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (/from\s+["']@\/components\/dashboard\/(GuiltFree|GuiltFreePage|IncomeSplitCard|SplitSheet|BudgetCreditPage)["']/.test(src)) offenders.push(rel);
      if (/<GuiltFree(Toggle|Chip)\b/.test(src)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});

test('no live request body sends guilt_free any more (the server strips it)', () => {
  for (const rel of ['app/(tabs)/calendar.tsx', 'components/spaces/grocery/GroceryFinishShoppingSheet.tsx', 'components/spaces/home/HomeTaskResolveSheet.tsx']) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.ok(!/guilt_free\s*:/.test(src), `${rel} still sends guilt_free`);
  }
});
