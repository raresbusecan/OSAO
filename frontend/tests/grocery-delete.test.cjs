const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCallback } = require('./helpers/load-ts.cjs');

for (const [file, name, argument] of [
  ['components/spaces/grocery/GroceryDashboard.tsx', 'handleDeleteList', '10'],
  ['components/simple/space/SimpleGrocerySpace.tsx', 'deleteList', { id: '10', name: 'Test' }],
]) {
  for (const fail of [false, true]) test(`${name}: one atomic request, ${fail ? 'restores UI on failure' : 'removes list on success'}`, async () => {
    const lists = [{ id: '10' }, { id: '20' }];
    const items = [{ id: '1', listId: '10' }, { id: '2', listId: '20' }];
    let shownLists = lists, shownItems = items;
    const requests = [], notices = [];
    const apply = (next, current) => typeof next === 'function' ? next(current) : next;
    const callback = loadCallback(file, name, {
      lists, items, activeListId: '10',
      getItemsForList: (rows, id) => rows.filter((i) => i.listId === id),
      confirmAction: async () => true, roCount: String,
      isSavedItemId: (id) => /^\d+$/.test(id),
      setLists: (next) => { shownLists = apply(next, shownLists); },
      setItems: (next) => { shownItems = apply(next, shownItems); },
      setActiveListId() {}, setTargetId() {}, load() {},
      DeviceEventEmitter: { emit() {} }, REFRESH_EVENT: 'refresh',
      notifyAction: (...args) => notices.push(args),
      api: { deleteItem: async (id) => { requests.push(id); if (fail) throw new Error('Offline'); } },
    });
    await callback(argument);
    assert.deepEqual(requests, ['10']);
    assert.deepEqual(shownLists.map((i) => i.id), fail ? ['10', '20'] : ['20']);
    assert.deepEqual(shownItems.map((i) => i.id), fail ? ['1', '2'] : ['2']);
    assert.equal(notices.length, fail ? 1 : 0);
  });
}
