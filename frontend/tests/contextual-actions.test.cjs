const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, loadCallback } = require('./helpers/load-ts.cjs');
const route = loadModule('lib/navigation/recordActionRoute.ts');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('all actionable record types use a temporary route; ordinary browsing keeps its destination', () => {
  for (const type of route.RECORD_ACTION_TYPES) {
    const href = route.recordActionHref({ id: 42, type, space: { id: '3' } });
    assert.equal(href, `/record-action?id=3&itemId=42&itemType=${type}`);
    assert.equal(route.validRecordAction('3', '42', type), true);
  }
  assert.equal(route.recordActionHref({ id: 42, type: 'unknown', space: { id: 3 } }), '/3?itemId=42&itemType=unknown');
  for (const [id, item, type] of [['0', '42', 'home_task'], ['3', '../42', 'home_task'], [['3'], '42', 'home_task'], ['3', '42', ['home_task']], ['3', '42', 'unknown']]) {
    assert.equal(route.validRecordAction(id, item, type), false);
  }
});

test('return from an action preserves the originating Space, without inventing a destination for tab roots or cold links', () => {
  const state = (screen) => ({ index: 1, routes: [{ name: '(tabs)', state: { index: 0, routes: [screen] } }, { name: 'record-action' }] });
  assert.equal(route.actionOriginSpaceHref(state({ name: '[id]', params: { id: '12' } })), '/12');
  const expoWrapped = { index: 0, routes: [{ name: '__root', state: state({ name: '[id]', params: { id: '12' } }) }] };
  assert.equal(route.actionOriginSpaceHref(expoWrapped), '/12');
  assert.equal(route.actionOriginSpaceHref(state({ name: 'calendar', params: { date: '2026-10-21' } })), null);
  assert.equal(route.actionOriginSpaceHref(state({ name: '[id]', params: { id: 'https://outside.test' } })), null);
  assert.equal(route.actionOriginSpaceHref({ index: 0, routes: [{ name: 'record-action' }] }), null);
});

const mutations = [
  ['handleFuelSave', 'fuelEntries', 'car'], ['handleFuelDelete', 'fuelEntries', 'car'],
  ['handleExpenseSave', 'expenseEntries', 'car'], ['handleExpenseDelete', 'expenseEntries', 'car'],
  ['handleHomeExpenseSave', 'expenseEntries', 'home'], ['handleHomeExpenseDelete', 'expenseEntries', 'home'],
  ['handleHomeSupplySave', 'supplyEntries', 'home'], ['handleHomeSupplyDelete', 'supplyEntries', 'home'],
  ['handleExpenseEntrySave', 'entries', 'expenses'], ['handleExpenseEntryDelete', 'entries', 'expenses'],
  ['handleMaintenanceSave', 'maintenanceEntries', 'car'], ['handleDocumentSave', 'documentEntries', 'car'],
  ['handleMaintenanceDelete', 'maintenanceEntries', 'car'], ['handleDocumentDelete', 'documentEntries', 'car'],
  ['handleHomeDocumentSave', 'documentEntries', 'home'], ['handleHomeDocumentDelete', 'documentEntries', 'home'],
  ['handleHomeMaintenanceSave', 'maintenanceEntries', 'home'], ['handleHomeMaintenanceDelete', 'maintenanceEntries', 'home'],
  ['handleHomeRecurringSave', 'recurringEntries', 'home'], ['handleHomeRecurringDelete', 'recurringEntries', 'home'],
  ['handleHomeTaskSave', 'taskEntries', 'home'], ['handleHomeTaskDelete', 'taskEntries', 'home'],
];
for (const [name, field, kind] of mutations) {
  test(`${name}: return waits for persistence; failed writes preserve the record and never return`, async () => {
    const setup = () => {
      const request = deferred();
      const initial = { id: '42', title: 'Before' };
      let data = { fuelEntries: [initial], expenseEntries: [initial], supplyEntries: [initial], entries: [initial], maintenanceEntries: [initial], documentEntries: [initial], recurringEntries: [initial], taskEntries: [initial] };
      let returns = 0;
      const write = () => request.promise;
      const context = {
        carData: data, homeData: data, expensesData: data, space: { id: '3' },
        setCarData: (update) => { data = update(data); }, setHomeData: (update) => { data = update(data); },
        setExpensesData: (update) => { data = update(data); },
        api: { updateItem: write, createItem: write, deleteItem: write }, isSavedItemId: () => true,
        recordAction: { complete: () => { returns++; } }, notifyAction() {},
      };
      for (const mapper of ['fuelEntryToItemBody', 'expenseEntryToItemBody', 'homeExpenseEntryToItemBody', 'supplyEntryToItemBody', 'expensesSpaceEntryToItemBody', 'maintenanceEntryToItemBody', 'documentEntryToItemBody', 'homeDocumentEntryToItemBody', 'homeMaintenanceEntryToItemBody', 'recurringEntryToItemBody', 'taskEntryToItemBody']) context[mapper] = () => ({});
      const callback = loadCallback('app/(tabs)/[id].tsx', name, context);
      const argument = name.endsWith('Delete') ? '42' : { id: '42', title: 'After' };
      return { request, run: () => callback(argument), get data() { return data; }, get returns() { return returns; }, initial };
    };
    const good = setup();
    const pending = good.run();
    assert.equal(good.returns, 0);
    good.request.resolve({ id: 42 });
    await pending;
    assert.equal(good.returns, 1);
    const bad = setup();
    const failed = bad.run();
    bad.request.reject(new Error(`${kind} offline`));
    await assert.rejects(failed, /offline/);
    assert.equal(bad.returns, 0);
    assert.equal(bad.data[field].length, 1);
    assert.equal(bad.data[field][0], bad.initial);
  });
}

test('category editing keeps unsaved fields open on failure, prevents duplicate writes, and closes only after success', async () => {
  const request = deferred();
  let writes = 0, closes = 0, error = '';
  const context = { canSubmit: true, mutationLock: { current: false }, values: { title: 'Keep me' }, editingId: '42',
    setSaving() {}, setPendingAction() {}, setSaveError: (value) => { error = value; }, closeForm: () => { closes++; },
    onSubmit: () => { writes++; return request.promise; },
  };
  const submit = loadCallback('components/spaces/home/HomeCategoryPage.tsx', 'submit', context);
  const pending = submit();
  await submit();
  assert.equal(writes, 1);
  assert.equal(closes, 0);
  request.reject(new Error('No network'));
  await pending;
  assert.equal(error, 'No network');
  assert.equal(closes, 0);
  assert.equal(context.values.title, 'Keep me');
  context.onSubmit = async () => {};
  const retry = loadCallback('components/spaces/home/HomeCategoryPage.tsx', 'submit', context);
  await retry();
  assert.equal(closes, 1);
});

for (const file of ['HomeTaskResolveSheet', 'HomeMaintenanceResolveSheet']) {
  test(`${file}: failed or duplicate confirmations stay editable`, async () => {
    const request = deferred();
    let calls = 0, error = '';
    const resolve = loadCallback(`components/spaces/home/${file}.tsx`, 'resolveWith', {
      saveLock: { current: false }, setSaving() {}, setPendingAction() {}, setError: (value) => { error = value; },
      onResolve: () => { calls++; return request.promise; }, nextDueDate: undefined, guiltFree: false,
    });
    const pending = resolve(20);
    await resolve(20);
    assert.equal(calls, 1);
    request.reject(new Error('Offline'));
    await pending;
    assert.equal(error, 'Offline');
  });
}

test('a pending category resolve excludes another resolve, save and delete until it finishes', async () => {
  const request = deferred();
  let resolves = 0, writes = 0, confirmations = 0, error = '';
  const context = {
    editingId: '42', values: { title: 'Keep me' }, canSubmit: true, mutationLock: { current: false },
    setSaving() {}, setPendingAction() {}, setSaveError: (value) => { error = value; }, closeForm() {},
    onResolve: () => { resolves++; return request.promise; },
    onSubmit: async () => { writes++; }, onDelete: async () => { writes++; },
    confirmAction: async () => { confirmations++; return true; },
  };
  const resolve = loadCallback('components/spaces/home/HomeCategoryPage.tsx', 'resolve', context);
  const save = loadCallback('components/spaces/home/HomeCategoryPage.tsx', 'submit', context);
  const remove = loadCallback('components/spaces/home/HomeCategoryPage.tsx', 'remove', context);
  const pending = resolve();
  await resolve(); await save(); await remove('42');
  assert.equal(resolves, 1);
  assert.equal(writes, 0);
  assert.equal(confirmations, 0);
  request.reject(new Error('Offline'));
  await pending;
  assert.equal(error, 'Offline');
  assert.equal(context.mutationLock.current, false);
  await save();
  assert.equal(writes, 1);
});

test('task completion keeps its resolve sheet until the actual save succeeds', async () => {
  const request = deferred();
  let closed = false;
  const confirm = loadCallback('components/spaces/home/HomeDashboard.tsx', 'handleResolveConfirm', {
    resolveSheetEntry: { id: '42' }, resolveTask: () => request.promise,
    setResolveSheetEntry: () => { closed = true; },
  });
  const pending = confirm(20);
  assert.equal(closed, false);
  request.resolve();
  await pending;
  assert.equal(closed, true);
});

test('completion refreshes saved data even after leaving, without a delayed navigation', () => {
  let backs = 0, replacements = 0, refreshes = 0;
  const active = { current: true }, leaving = { current: false };
  const refreshed = { current: false };
  const cancel = loadCallback('app/record-action.tsx', 'cancel', {
    useCallback: (fn) => fn, active, leaving,
    router: { canGoBack: () => true, back: () => { backs++; }, replace: () => { replacements++; } },
  });
  const complete = loadCallback('app/record-action.tsx', 'complete', {
    useCallback: (fn) => fn, active, leaving, refreshed, cancel,
    DeviceEventEmitter: { emit: () => { refreshes++; } }, REFRESH_EVENT: 'lifeos.refresh', refreshBudgetPlan() {},
  });
  complete(); complete();
  assert.equal(backs, 1);
  assert.equal(replacements, 0);
  assert.equal(refreshes, 1);
  refreshed.current = false; leaving.current = true; active.current = false;
  complete();
  assert.equal(backs, 1);
  assert.equal(refreshes, 2);
});

for (const retryAfterFailure of [true, false]) {
  test(`nonrecurring maintenance launched directly handles failure with retry=${retryAfterFailure}`, async () => {
    let writes = 0, errors = 0, cancelled = 0, successes = 0;
    const recordAction = { cancel: () => { cancelled++; } };
    const confirmAction = async (title) => {
      if (title === 'Nu am putut rezolva') { errors++; return retryAfterFailure; }
      return true;
    };
    const resolveCategoryEntry = loadCallback('components/spaces/home/HomeDashboard.tsx', 'resolveCategoryEntry', {
      HOME_CATEGORIES: [{ key: 'maintenance', entries: () => [{ id: '42', isRecurring: false }], resolveEntry: (entry) => ({ ...entry, completed: true }) }],
      homeData: {}, confirmAction, recordAction,
      saveHandlers: { maintenance: async () => { writes++; if (writes === 1) throw new Error('Offline'); } },
      notifyAction: () => { successes++; },
    });
    const run = loadCallback('components/spaces/home/HomeDashboard.tsx', 'resolveInitialAction', {
      resolveCategoryEntry, confirmAction, recordAction,
    });
    await run('maintenance', '42');
    assert.equal(errors, 1);
    assert.equal(writes, retryAfterFailure ? 2 : 1);
    assert.equal(cancelled, retryAfterFailure ? 0 : 1);
    assert.equal(successes, retryAfterFailure ? 1 : 0);
  });
}

test('the source todo sheet remains open for action return, while a calendar visit closes it normally', () => {
  let closes = 0;
  const destinations = [];
  const open = loadCallback('components/dashboard/TodoCarouselSheet.tsx', 'openTarget', {
    todoHref: (item) => item.href, onClose: () => { closes++; }, router: { navigate: (href) => destinations.push(href) },
  });
  open({ href: '/record-action?id=3&itemId=42&itemType=home_task' });
  assert.equal(closes, 0);
  open({ href: '/calendar?date=2026-10-21' });
  assert.equal(closes, 1);
  assert.equal(destinations.length, 2);
});
