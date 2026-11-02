const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, loadCallback, loadFunction, loadEffect, loadFocus, loadPress } = require('./helpers/load-ts.cjs');
const routes = loadModule('lib/navigation/recordActionRoute.ts');
const { todoHref } = loadModule('lib/dashboard/spaceDue.ts', {
  '@/lib/format': {}, '@/lib/spaces/car/maintenanceLabels': {}, '@/lib/spaces/car/maintenanceTiers': loadModule('lib/spaces/car/maintenanceTiers.ts'), '@/lib/navigation/recordActionRoute': routes,
});
const bill = { id: 42, type: 'home_recurring', title: 'Internet', space_id: 7, space: { id: 7 }, due_at: '2026-10-20T12:00:00Z', amount: 80 };
const destination = '/record-action?id=7&itemId=42&itemType=home_recurring';

test('all 15 Space record types route to their owner, with either API representation', () => {
  const types = ['car_fuel', 'car_maintenance', 'car_document', 'car_expense', 'home_document', 'home_expense', 'home_maintenance', 'home_recurring', 'home_supply', 'home_task', 'grocery_list', 'grocery_item', 'grocery_trip', 'expense_item', 'expense_credit'];
  for (const type of types) {
    const nested = todoHref({ id: 42, type, space: { id: 7 } });
    assert.equal(todoHref({ id: 42, type, space_id: 7 }), nested);
    assert.equal(new URL(nested, 'https://test.invalid').searchParams.get('itemId'), '42');
    assert.ok(nested.startsWith('/7?') || nested.startsWith('/record-action?id=7&'));
    assert.ok(!todoHref({ id: 42, type }).startsWith('/calendar'));
  }
  assert.equal(todoHref({ ...bill, space: { id: 99 } }), destination, 'stored owner wins over a display relation');
  assert.equal(todoHref({ ...bill, id: 'hs-42-3', item_id: 42 }), destination, 'a payment occurrence opens its source record');
  assert.equal(todoHref({ id: 1, type: 'custom_event', due_at: '2026-10-20T12:00:00' }), '/calendar?date=2026-10-20');
});

// GuiltFreePage is dead since "Buget simplu" (2026-11-02) -- only the space detail is tested.
test('Budget history rows open the original payment record', () => {
  const visited = [];
  const context = { it: { ...bill, id: 'hs-42-3', item_id: 42 }, router: { navigate: (href) => visited.push(href) }, todoHref };
  loadPress('components/dashboard/BudgetSpaceDetailPage.tsx', 'budget-space-item-', context)();
  assert.deepEqual(visited, [destination]);
});

test('shared form mutation waits, excludes save/delete overlap, and unlocks an editable form after failure', async () => {
  let writes = 0, failures = 0, finish;
  const { useRecordMutation } = loadModule('lib/navigation/useRecordMutation.ts', {
    react: { useRef: (current) => ({ current }), useState: () => [false, () => {}] },
    '@/lib/confirm': { notifyAction: () => { failures++; } },
  });
  const mutation = useRecordMutation();
  const request = new Promise((_, reject) => { finish = reject; });
  const saving = mutation.run(() => { writes++; return request; });
  assert.equal(mutation.canClose(), false);
  await mutation.run(() => { writes++; });
  assert.equal(writes, 1);
  finish(new Error('Offline')); await saving;
  assert.equal(mutation.canClose(), true); assert.equal(failures, 1);
  await mutation.run(async () => { writes++; });
  assert.equal(writes, 2);
});

for (const [file, callback, saved, closed] of [
  ['car/CarDashboard', 'handleFuelSave', 'onFuelSave', 'setFuelFormVisible'],
  ['car/CarDashboard', 'handleExpenseSave', 'onExpenseSave', 'setExpenseFormVisible'],
  ['home/HomeDashboard', 'handleSupplyFormSave', 'onSupplySave', 'setSupplyFormVisible'],
  ['home/HomeDashboard', 'handleTaskSave', 'onTaskSave', 'setTaskFormVisible'],
  ['expenses/ExpensesDashboard', 'handleEditSave', 'onEntrySave', 'setEditingEntry'],
  ['grocery/GroceryDashboard', 'handleHomeEditSave', 'handleEdit', 'setHomeEditingItem'],
]) test(`${callback}: failed writes do not close the owning record form`, async () => {
  let closes = 0;
  const context = { homeEditingItem: { id: '42' }, [saved]: async () => { throw new Error('Offline'); }, [closed]: () => { closes++; }, setEditingFuelEntry() {}, setEditingExpenseEntry() {}, setEditingSupplyEntry() {}, setEditingTaskEntry() {} };
  const run = loadCallback(`components/spaces/${file}.tsx`, callback, context);
  await assert.rejects(run({ id: '42' }), /Offline/); assert.equal(closes, 0);
  context[saved] = async () => {};
  await loadCallback(`components/spaces/${file}.tsx`, callback, context)({ id: '42' });
  assert.equal(closes, 1);
});

test('A paid purchase task from an older day opens its saved form even when absent from the active Tasks list', () => {
  const entry = { id: '42', completed: true, completedAt: '2026-10-01T10:00:00Z', isPurchase: true };
  const state = {};
  loadEffect('components/spaces/home/HomeDashboard.tsx', 'const key = `${initialOpenItem.type}', {
    initialOpenItem: { id: '42', type: 'home_task' }, homeData: { taskEntries: [entry] }, openedInitialItemRef: { current: null }, recordAction: {},
    setTasksPageVisible() {}, setEditingTaskEntry: (item) => { state.entry = item; }, setTaskFormVisible: (shown) => { state.form = shown; },
    setResolveSheetEntry: () => { throw new Error('A paid task must not be resolved again'); },
  })();
  assert.equal(state.entry, entry); assert.equal(state.form, true);
});

test('Car service history edits the existing record; only the explicit renewal action creates a next service', () => {
  const editRoute = loadFunction('lib/dashboard/itemActions.ts', 'editRoute', { todoHref });
  const item = { ...bill, type: 'car_maintenance' };
  assert.ok(!todoHref(item).includes('action='));
  assert.equal(editRoute(item), `${todoHref(item)}&action=renew&overlay=1`);
  for (const renew of [false, true]) {
    const calls = [];
    loadEffect('components/spaces/car/CarDashboard.tsx', 'const key = `${initialOpenEntry.type}', {
      initialOpenEntry: { id: '42', type: 'maintenance', renew }, openedInitialEntryRef: { current: null },
      carData: { maintenanceEntries: [{ id: '42' }] }, setActiveTab() {},
      openEntryForEdit: () => calls.push('edit'), handleNextItemPress: () => calls.push('renew'),
    })();
    assert.deepEqual(calls, [renew ? 'renew' : 'edit']);
  }
});

for (const [file, method] of [['BudgetSpaceDetailPage', 'getBudgetSpaceDetail']]) {
  test(`${file}: returning refreshes records and stale responses cannot overwrite a later save`, async () => {
    const pending = [], shown = [];
    let refresh, removed = false;
    const context = { category: 'Home', REFRESH_EVENT: 'refresh',
      DeviceEventEmitter: { addListener: (_, fn) => { refresh = fn; return { remove: () => { removed = true; } }; } },
      api: { [method]: () => new Promise((resolve) => pending.push(resolve)) },
      setData: (r) => shown.push(r.items), setItems: (items) => shown.push(items), setMonths() {}, setRecurringMonthly() {}, setPlanned() {}, setLoading() {},
    };
    const cleanup = loadFocus(`components/dashboard/${file}.tsx`, method, context)();
    refresh();
    pending[1]({ items: ['saved'] }); await new Promise(setImmediate);
    pending[0]({ items: ['stale'] }); await new Promise(setImmediate);
    assert.equal(shown.length, 1); assert.deepEqual(shown[0], ['saved']);
    cleanup(); assert.equal(removed, true);
    const stop = loadFocus(`components/dashboard/${file}.tsx`, method, context)();
    pending[2]({ items: ['refocused'] }); await new Promise(setImmediate);
    assert.deepEqual(shown[1], ['refocused']); stop();
  });
}

const jsx = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment' };
function find(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  for (const child of (Array.isArray(node) ? node : node.props?.children ?? [])) { const match = find(child, type); if (match) return match; }
  return null;
}
for (const size of ['compact', 'wide']) {
  test(`Internet: real ${size} dashboard card opens its Home bill, including preview and empty states`, () => {
    const visited = [];
    const render = loadFunction('components/home/HomeWidgets.tsx', 'BillsCard', {
      React: jsx, useTheme: () => ({ colors: {}, spacing: {} }), limitRows: (items) => items, todoHref,
      TapCard: 'TapCard', CardHeading: 'CardHeading', Text: 'Text', View: 'View', Group: 'Group',
      SectionHeader: 'SectionHeader', RecurringBillRow: 'RecurringBillRow', SwipeItemRow: 'SwipeItemRow', Missing: 'Missing',
      infoOf: () => undefined, lei: String, roDate: String,
    });
    const ctx = { bills: [bill], navigate: (href) => visited.push(href) };
    const target = size === 'compact' ? 'TapCard' : 'RecurringBillRow';
    find(render({ widget: { size }, ctx }), target).props.onPress();
    assert.deepEqual(visited, [`${destination}&overlay=1`]);
    assert.equal(find(render({ widget: { size }, ctx: { ...ctx, preview: true } }), target).props.onPress, undefined);
    const empty = render({ widget: { size }, ctx: { ...ctx, bills: [] } });
    assert.equal(size === 'compact' ? empty.props.onPress : empty.type, size === 'compact' ? undefined : 'Missing');
  });
}

test('Budget bill and credit rows use the owning record instead of Calendar or a budget subpage', () => {
  const visited = [];
  const router = { navigate: (href) => visited.push(href) };
  loadPress('app/(tabs)/budget.tsx', 'recurring-bill-', { bill, router, todoHref })();
  const c = { id: 65, space_id: 12, linked_space_id: 99 };
  loadPress('app/(tabs)/budget.tsx', 'recurring-credit-', { c, router, todoHref })();
  loadPress('components/dashboard/BudgetCreditPage.tsx', 'budget-credit-${c.id}', { c, router, todoHref })();
  assert.deepEqual(visited, [destination, '/record-action?id=12&itemId=65&itemType=expense_credit', '/record-action?id=12&itemId=65&itemType=expense_credit']);
});

test('Simple Calendar opens Space records in their owner before considering its generic editor', () => {
  const visited = [];
  const openRow = loadCallback('components/simple/SimpleCalendar.tsx', 'openRow', {
    router: { navigate: (href) => visited.push(href) }, todoHref,
    canEditRecord: () => { throw new Error('Space record reached the generic editor'); },
  });
  openRow(bill);
  openRow({ ...bill, space: null });
  assert.deepEqual(visited, [destination, destination]);
});

for (const type of ['home_recurring', 'home_document', 'home_maintenance', 'home_expense', 'home_supply', 'home_task']) {
  test(`${type}: waits for the exact record then opens its Home section once`, () => {
    const state = {};
    const context = { initialOpenItem: { type, id: '42' }, homeData: { taskEntries: [], supplyEntries: [] },
      openedInitialItemRef: { current: null }, recordAction: {},
      HOME_CATEGORIES: ['recurring', 'documents', 'maintenance', 'expenses'].map((key) => ({ key, entries: () => context.loaded ? [entry] : [] })),
    };
    const entry = { id: '42', completed: false };
    for (const name of ['TasksPageVisible', 'ResolveSheetEntry', 'SuppliesPageVisible', 'EditingSupplyEntry', 'SupplyFormVisible', 'ActiveCategory', 'InitialCategoryEditId']) context[`set${name}`] = (value) => { state[name] = value; };
    const run = () => loadEffect('components/spaces/home/HomeDashboard.tsx', 'const key = `${initialOpenItem.type}', context)();
    run();
    assert.equal(context.openedInitialItemRef.current, null);
    context.loaded = true;
    context.homeData = { taskEntries: [entry], supplyEntries: [entry] };
    run();
    assert.equal(context.openedInitialItemRef.current, `${type}:42`);
    if (type === 'home_supply') assert.equal(state.EditingSupplyEntry, entry);
    else if (type === 'home_task') assert.equal(state.ResolveSheetEntry, entry);
    else assert.equal(state.ActiveCategory, { home_recurring: 'recurring', home_document: 'documents', home_maintenance: 'maintenance', home_expense: 'expenses' }[type]);
    state.ActiveCategory = 'manual-choice';
    run();
    assert.equal(state.ActiveCategory, 'manual-choice');
  });
}

for (const type of ['fuel', 'expense', 'document', 'maintenance']) {
  test(`Car ${type}: another row cannot consume the deep link before the target loads`, () => {
    const opened = [];
    const field = { fuel: 'fuelEntries', expense: 'expenseEntries', document: 'documentEntries', maintenance: 'maintenanceEntries' }[type];
    const context = { initialOpenEntry: { type, id: '42' }, openedInitialEntryRef: { current: null },
      carData: { fuelEntries: [], expenseEntries: [], documentEntries: [], maintenanceEntries: [] },
      setActiveTab() {}, openEntryForEdit: (kind, id) => opened.push([kind, id]), handleNextItemPress: (item) => opened.push([item.sourceType, item.sourceId]),
    };
    context.carData[field] = [{ id: '41' }];
    const run = () => loadEffect('components/spaces/car/CarDashboard.tsx', 'const key = `${initialOpenEntry.type}', context)();
    run(); assert.equal(context.openedInitialEntryRef.current, null);
    context.carData[field].push({ id: '42' }); run(); run();
    assert.deepEqual(opened, [[type, '42']]);
  });
}

test('Grocery links select the requested second list and the product inside it after loading', () => {
  const selected = [];
  const product = { id: '42', listId: '9' };
  const context = { initialOpenItem: { id: '42', type: 'grocery_item' }, openedInitialItemRef: { current: null }, items: [], lists: [{ id: '8' }, { id: '9' }],
    setActiveListId: (id) => selected.push(id), setView() {}, setHomeEditingItem: (item) => assert.equal(item, product),
  };
  const run = () => loadEffect('components/spaces/grocery/GroceryDashboard.tsx', 'const key = `${initialOpenItem.type}', context)();
  run(); assert.deepEqual(selected, []);
  context.items = [product]; run(); run(); assert.deepEqual(selected, ['9']);
  context.initialOpenItem = { id: '8', type: 'grocery_list' }; run(); assert.deepEqual(selected, ['9', '8']);
});

test('Closing a product editor returns only a direct product link; shopping-list browsing stays in its list', () => {
  for (const type of ['grocery_item', 'grocery_list']) {
    let cancels = 0, closes = 0;
    loadCallback('components/spaces/grocery/GroceryDashboard.tsx', 'closeHomeEditor', {
      initialOpenItem: { type }, setHomeEditingItem: () => { closes++; }, recordAction: { cancel: () => { cancels++; } },
    })();
    assert.equal(closes, 1); assert.equal(cancels, type === 'grocery_item' ? 1 : 0);
  }
});

test('An old expense opens its own month; credit opens its own sheet, including ended loans', () => {
  const entry = { id: '42', date: '2025-02-04' };
  const state = {};
  loadEffect('components/spaces/expenses/ExpensesDashboard.tsx', 'openedInitialItemRef.current === initialOpenItem.id', {
    initialOpenItem: { id: '42', type: 'expense_item' }, openedInitialItemRef: { current: null }, expensesData: { entries: [entry] },
    monthKey: () => '2025-02', setSelectedMonth: (month) => { state.month = month; }, setEditingEntry: (item) => { state.entry = item; },
  })();
  assert.equal(state.month, '2025-02'); assert.equal(state.entry, entry);
  loadEffect('components/spaces/expenses/ExpensesCreditsSection.tsx', 'openedInitialCreditRef.current === initialEditId', {
    initialEditId: '42', credits: [entry], openedInitialCreditRef: { current: null }, isCreditActive: () => false,
    setEndedOpen: (value) => { state.ended = value; }, setEditing: (item) => { state.credit = item; },
  })();
  assert.equal(state.ended, true); assert.equal(state.credit, entry);
});
