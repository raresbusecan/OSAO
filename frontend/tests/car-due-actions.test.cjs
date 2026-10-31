const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, loadCallback, loadEffect, loadPress } = require('./helpers/load-ts.cjs');
const routes = loadModule('lib/navigation/recordActionRoute.ts');
const { todoHref } = loadModule('lib/dashboard/spaceDue.ts', { '@/lib/format': {}, '@/lib/spaces/car/maintenanceLabels': {}, '@/lib/navigation/recordActionRoute': routes });
const source = { id: '42', title: 'RCA 2026', issueDate: '01.01.2026', expiryDate: '31.12.2026', documentType: 'RCA', issuer: 'Asigurator', price: 900, service: 'Oil Change', provider: 'Service' };

for (const type of ['car_document', 'car_maintenance']) {
  const item = { id: 42, type, title: source.title, due_at: '2026-01-01T12:00:00Z', space: { id: 7 }, overdue_km: type === 'car_maintenance' ? 1500 : null };
  const expected = '/record-action?id=7&itemId=42&itemType=' + type + '&action=renew';
  test(type + ': pending rows in Acasa open renewal from the todo sheet, dashboard card and Simple mode', () => {
    const visited = [];
    const router = { navigate: href => visited.push(href), push: href => visited.push(href) };
    loadCallback('components/dashboard/TodoCarouselSheet.tsx', 'openTarget', { todoHref, router, onClose: () => { throw Error('temporary action must preserve the source sheet'); } })(item);
    loadPress('components/home/HomeWidgets.tsx', 'home-due-', { todoHref, r: { top: item }, ctx: { preview: false, navigate: href => visited.push(href) } })();
    loadCallback('components/simple/home/UpcomingCard.tsx', 'open', { todoHref, router, it: item, canEditRecord: () => { throw Error('must not use generic edit'); } })();
    assert.deepEqual(visited, [expected, expected, expected]);
    assert.ok(!todoHref(item).includes('action='), 'history/edit navigation retains the original record');
    assert.equal(todoHref({ ...item, space: null, space_id: 7 }, 'resolve'), expected);
  });

  test(type + ': a pending deep link waits for its own record then uses the Car renewal handler', () => {
    const state = {}, carData = { documentEntries: [], maintenanceEntries: [], fuelEntries: [], expenseEntries: [] };
    const handleNextItemPress = loadCallback('components/spaces/car/CarDashboard.tsx', 'handleNextItemPress', {
      carData, closeAllForms: () => { state.cleared = true; },
      renewalPeriod: () => ({ issue: new Date(2027, 0, 1), expiry: new Date(2027, 11, 31) }), parseDocDate: () => new Date(2026, 11, 31),
      renewedTitle: () => 'RCA 2027', toCarDate: d => d.getFullYear() === 2027 && d.getMonth() === 0 ? '01.01.2027' : '31.12.2027',
      setDocumentRenewFrom: v => { state.document = v; }, setDocumentFormVisible: v => { state.documentVisible = v; },
      setMaintenanceRenewFrom: v => { state.maintenance = v; }, setMaintenanceFormVisible: v => { state.maintenanceVisible = v; },
    });
    const entryType = type === 'car_document' ? 'document' : 'maintenance';
    const list = type === 'car_document' ? carData.documentEntries : carData.maintenanceEntries;
    const context = { carData, initialOpenEntry: { id: '42', type: entryType, renew: true }, openedInitialEntryRef: { current: null }, setActiveTab() {}, handleNextItemPress, openEntryForEdit: () => { throw Error('pending action opened edit'); } };
    const run = () => loadEffect('components/spaces/car/CarDashboard.tsx', 'const key = ', context)();
    list.push({ ...source, id: '99' }); run(); assert.equal(context.openedInitialEntryRef.current, null);
    list.push(source); run(); assert.equal(state.cleared, true);
    const draft = type === 'car_document' ? state.document : state.maintenance;
    assert.equal(draft.sourceId, '42'); assert.equal(draft.id, undefined, 'draft must create a new record');
    if (type === 'car_document') { assert.equal(state.documentVisible, true); assert.equal(draft.issueDate, '01.01.2027'); assert.equal(draft.title, 'RCA 2027'); }
    else { assert.equal(state.maintenanceVisible, true); assert.equal(draft.service, source.service); }
  });
}

test('changing from editing to resolving the same loaded car record opens its renewal step', () => {
  const calls = [];
  const context = { initialOpenEntry: { id: '42', type: 'document', renew: false }, openedInitialEntryRef: { current: null }, carData: { documentEntries: [source] }, setActiveTab() {}, openEntryForEdit: () => calls.push('edit'), handleNextItemPress: () => calls.push('renew') };
  const run = () => loadEffect('components/spaces/car/CarDashboard.tsx', 'const key = ', context)();
  run(); context.initialOpenEntry = { ...context.initialOpenEntry, renew: true }; run(); run();
  assert.deepEqual(calls, ['edit', 'renew']);
});

test('saving the renewal creates a new document linked to its original rather than editing it', async () => {
  const saved = [];
  const save = loadCallback('components/spaces/car/forms/CarDocumentForm.tsx', 'handleSave', {
    saveLock: { current: false }, setSaving() {}, setError: message => { if (message) throw Error(message); },
    documentType: 'RCA', title: 'RCA 2027', issuer: 'Asigurator', price: '900', issueDate: '01.01.2027', expiryDate: '31.12.2027', notes: '', guiltFree: false,
    parseLocaleNumber: loadModule('lib/format.ts').parseLocaleNumber,
    entry: undefined, isRenewing: true, renewFrom: { sourceId: '42' }, isValidDate: () => true, parseDate: date => date.startsWith('31') ? 2 : 1,
    onSave: async record => saved.push(record),
  });
  await save(); assert.equal(saved.length, 1); assert.notEqual(saved[0].id, '42'); assert.equal(saved[0].renewedFromId, '42');
});
