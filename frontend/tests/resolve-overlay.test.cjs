const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');
const routes = loadModule('lib/navigation/recordActionRoute.ts');
const { todoHref } = loadModule('lib/dashboard/spaceDue.ts', { '@/lib/format': {}, '@/lib/spaces/car/maintenanceLabels': {}, '@/lib/navigation/recordActionRoute': routes });

test('only a resolve that opens record-action shows over its origin screen', () => {
  const task = { id: 42, type: 'home_task', space: { id: 7 } };
  assert.equal(todoHref(task, 'resolve'), '/record-action?id=7&itemId=42&itemType=home_task&overlay=1');
  assert.equal(todoHref(task), '/record-action?id=7&itemId=42&itemType=home_task', 'viewing a record keeps the full page');
  assert.equal(todoHref({ id: 42, type: 'unknown', space: { id: 7 } }, 'resolve'), '/7?itemId=42&itemType=unknown', 'a Space route is never an overlay');
  assert.equal(todoHref({ id: 1, type: 'custom_event', due_at: '2026-10-20T12:00:00' }, 'resolve'), '/calendar?date=2026-10-20');
});

test('visible Sheets are counted and announced; the root dialog host is not a Sheet', () => {
  const dialogs = loadModule('lib/dialogCoordinator.ts');
  let calls = 0;
  const off = dialogs.subscribeSheets(() => { calls++; });
  const root = dialogs.registerDialogHost(0, () => {});
  assert.equal(dialogs.visibleSheetCount(), 0);
  const sheet = dialogs.registerDialogHost(1, () => {});
  const nested = dialogs.registerDialogHost(2, () => {});
  assert.equal(dialogs.visibleSheetCount(), 2);
  nested();
  sheet();
  assert.equal(dialogs.visibleSheetCount(), 0);
  assert.equal(calls, 5, 'every register and unregister notifies');
  off();
  dialogs.registerDialogHost(1, () => {})();
  assert.equal(calls, 5, 'unsubscribed listeners stay quiet');
  root();
});
