const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, loadFunction, loadCallback } = require('./helpers/load-ts.cjs');
const fresh = () => loadModule('lib/dialogCoordinator.ts');
const flush = () => new Promise(setImmediate);

test('confirmations use the highest visible Sheet even when child effects register before root effects', async () => {
  const d = fresh(), shown = {};
  const stops = [d.registerDialogHost(2, (r) => { shown.nested = r; }), d.registerDialogHost(1, (r) => { shown.form = r; }), d.registerDialogHost(0, (r) => { shown.root = r; })];
  const answer = d.showConfirmDialog({ title: 'Internet', message: 'Rezolvi?' });
  assert.equal(shown.nested.title, 'Internet');
  assert.equal(shown.form, null); assert.equal(shown.root, null);
  assert.equal(d.isDialogOpen(), true);
  d.settleDialog(shown.nested, true);
  assert.equal(await answer, true); assert.equal(d.isDialogOpen(), false);
  stops.forEach((stop) => stop());
});

test('concurrent prompts queue without overwriting a pending confirmation or resolving it twice', async () => {
  const d = fresh(); let shown;
  const stop = d.registerDialogHost(0, (r) => { shown = r; });
  const one = d.showConfirmDialog({ title: 'First', message: '' });
  const first = shown;
  const two = d.showChoiceDialog({ title: 'Second', message: '', choices: [{ key: 'saved', label: 'Saved' }] });
  assert.equal(shown, first);
  d.settleDialog(first, true); assert.equal(await one, true);
  assert.equal(shown.title, 'Second');
  d.settleDialog(first, false); assert.equal(shown.title, 'Second');
  d.settleDialog(shown, 'saved'); assert.equal(await two, 'saved'); stop();
});

test('unmounting a form releases its confirmation; the root remains available for later dialogs', async () => {
  const d = fresh(); let root, form;
  const stopRoot = d.registerDialogHost(0, (r) => { root = r; });
  const stopForm = d.registerDialogHost(1, (r) => { form = r; });
  const answer = d.showConfirmDialog({ title: 'Delete', message: '' });
  assert.ok(form); stopForm();
  assert.equal(await answer, false); assert.equal(root, null);
  const choice = d.showChoiceDialog({ title: 'New', message: '', choices: [] });
  d.settleDialog(root, false); assert.equal(await choice, null); stopRoot();
  assert.equal(await d.showConfirmDialog({ title: 'No host', message: '' }), false);
});

test('success notifications survive the originating form closing, and Back dismisses the dialog before the Sheet', () => {
  const d = fresh(); let root, form;
  const stopRoot = d.registerDialogHost(0, (r) => { root = r; });
  const stopForm = d.registerDialogHost(1, (r) => { form = r; });
  d.showNotifyDialog('Rezolvat', 'Internet');
  assert.equal(form.kind, 'notify'); assert.equal(d.dismissDialogAtLayer(0), false);
  stopForm(); assert.equal(root.title, 'Rezolvat');
  assert.equal(d.dismissDialogAtLayer(0), true); assert.equal(d.dismissDialogAtLayer(0), false);
  stopRoot();
});

const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useContext: () => 1 };
const children = (node) => (Array.isArray(node) ? node : node?.props?.children ?? []).flat(Infinity);
function find(node, type) { if (node?.type === type) return node; for (const child of children(node)) { const match = child && typeof child === 'object' ? find(child, type) : null; if (match) return match; } return null; }
test('a visible Sheet renders an inline confirmation host inside its native Modal, hidden Sheets do not register a host', () => {
  let closed = 0, handled = true;
  const Sheet = loadFunction('components/ui/Sheet.tsx', 'Sheet', {
    React, useRef: (current) => ({ current }), Modal: 'Modal', View: 'View', SheetBody: 'SheetBody', ConfirmHost: 'ConfirmHost',
    DialogLayerContext: { Provider: 'Provider' }, dismissDialogAtLayer: (depth) => { assert.equal(depth, 2); return handled; },
  });
  const tree = Sheet({ visible: true, onClose: () => { closed++; } });
  assert.equal(tree.type, 'Modal'); assert.equal(find(tree, 'ConfirmHost').props.inline, true);
  tree.props.onRequestClose(); assert.equal(closed, 0);
  handled = false; tree.props.onRequestClose(); assert.equal(closed, 1);
  assert.equal(find(Sheet({ visible: false }), 'ConfirmHost'), null);
});

test('an inline ConfirmHost returns an overlay View instead of presenting a second native Modal', () => {
  const request = { kind: 'confirm', title: 'Internet' };
  const host = loadFunction('lib/confirmHost.tsx', 'ConfirmHost', {
    React, useState: () => [request, () => {}], useEffect() {}, DialogLayerContext: {}, Dialog: 'Dialog', View: 'View', Modal: 'Modal', settleDialog() {},
  });
  assert.equal(host({ inline: true }).type, 'View'); assert.equal(host({}).type, 'Modal');
});

test('cancelling the early-payment choice from summary lists never writes a bill, task or maintenance record', async () => {
  let writes = 0, notices = 0;
  const run = loadFunction('lib/dashboard/itemActions.ts', 'resolveWithSaved', {
    amountOf: () => 80, nextDateAfterResolve: async () => null,
    addRecurrenceInterval() {}, nextTaskOccurrence() {},
    api: { updateItem: () => { writes++; } }, notifyAction: () => { notices++; },
  });
  for (const type of ['home_recurring', 'home_task', 'home_maintenance']) {
    assert.equal(await run({ id: '42', type, amount: 80, recurrence: 'monthly', due_at: '2026-11-01', metadata: {} }), false);
  }
  assert.equal(writes, 0); assert.equal(notices, 0);
});

for (const outcome of ['success', 'cancel', 'offline', 'schedule_cancel', 'back', 'unmount']) test(`Internet from its form: visible confirmation, early-payment choice, then ${outcome} releases loading`, async () => {
  const d = fresh(); let root, dialog, saving = false, action = null, error = '', closes = 0, writes = 0, returned = 0;
  const stopRoot = d.registerDialogHost(0, (r) => { root = r; });
  const stopForm = d.registerDialogHost(1, (r) => { dialog = r; });
  const entry = { id: '42', title: 'Internet', nextDueDate: '2026-11-01', frequency: 'monthly', amount: 80 };
  const nextDateAfterResolve = loadFunction('lib/dashboard/itemActions.ts', 'nextDateAfterResolve', { daysFromToday: () => 2, roDate: String, chooseAction: (title, message, choices) => d.showChoiceDialog({ title, message, choices }) });
  let finish;
  const persist = new Promise((resolve, reject) => { finish = outcome === 'offline' ? () => reject(new Error('Offline')) : resolve; });
  const onResolve = loadCallback('components/spaces/home/HomeDashboard.tsx', 'resolveCategoryEntry', {
    HOME_CATEGORIES: [{ key: 'recurring', entries: () => [entry], resolveEntry: (e) => ({ ...e, nextDueDate: '2026-12-01' }) }], homeData: {}, roDate: String,
    confirmAction: (title, message, options) => d.showConfirmDialog({ title, message, ...options }), nextDateAfterResolve,
    addRecurrenceInterval: () => '2026-12-01', recordAction: { cancel: () => { returned++; } },
    saveHandlers: { recurring: async () => { writes++; await persist; returned++; } }, notifyAction: d.showNotifyDialog,
  });
  const context = { editingId: '42', onResolve: () => onResolve('recurring', '42'), mutationLock: { current: false },
    setSaving: (value) => { saving = value; }, setPendingAction: (value) => { action = value; }, setSaveError: (value) => { error = value; }, closeForm: () => { closes++; },
  };
  const resolve = loadCallback('components/spaces/home/HomeCategoryPage.tsx', 'resolve', context);
  const pending = resolve();
  assert.equal(saving, true); assert.equal(action, 'resolve'); assert.equal(writes, 0); assert.equal(root, null);
  assert.equal(dialog.title, 'Marchezi ca rezolvat?');
  d.settleDialog(dialog, outcome !== 'cancel'); await flush();
  if (outcome !== 'cancel') {
    assert.equal(dialog.title, 'Văd că rezolvi mai devreme');
    if (outcome === 'unmount') stopForm();
    else if (outcome === 'back') assert.equal(d.dismissDialogAtLayer(1), true);
    else d.settleDialog(dialog, outcome === 'schedule_cancel' ? null : 'schedule');
    await flush();
    if (outcome === 'success' || outcome === 'offline') {
      await resolve(); assert.equal(writes, 1); assert.equal(saving, true);
      finish();
    } else assert.equal(writes, 0);
  }
  await pending;
  assert.equal(saving, false); assert.equal(action, null); assert.equal(context.mutationLock.current, false);
  assert.equal(returned, outcome === 'offline' ? 0 : 1);
  assert.equal(closes, outcome === 'offline' ? 0 : 1);
  assert.equal(error, outcome === 'offline' ? 'Offline' : '');
  stopForm(); stopRoot();
});
