const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');
const { hitTest, moveKey, reorderSubset, menuPlacement } = loadModule('lib/holdGeometry.ts');

// Objects made inside the test sandbox have its own Object prototype.
const plain = (value) => JSON.parse(JSON.stringify(value));

test('the item under the finger, none in a gap', () => {
  const rects = new Map([
    ['a', { x: 16, y: 100, width: 160, height: 176 }],
    ['b', { x: 188, y: 100, width: 160, height: 176 }],
  ]);
  assert.equal(hitTest(rects, 20, 120), 'a');
  assert.equal(hitTest(rects, 300, 270), 'b');
  assert.equal(hitTest(rects, 182, 150), null, 'the gap between two grid tiles');
  assert.equal(hitTest(rects, 100, 400), null, 'below the cards');
});

test('a dragged key takes the hovered slot, the rest keep their order', () => {
  assert.deepEqual(plain(moveKey(['a', 'b', 'c', 'd'], 'a', 2)), ['b', 'c', 'a', 'd']);
  assert.deepEqual(plain(moveKey(['a', 'b', 'c', 'd'], 'd', 0)), ['d', 'a', 'b', 'c']);
  const same = ['a', 'b'];
  assert.equal(moveKey(same, 'a', 0), same, 'no move = the same array (no re-render)');
  assert.equal(moveKey(same, 'x', 1), same);
});

test('Acasă: a new order of the visible cards leaves hidden ones in their slots', () => {
  const all = [{ id: 'spend' }, { id: 'hidden', hidden: true }, { id: 'todo' }, { id: 'bills' }];
  const next = reorderSubset(all, (w) => w.id, ['bills', 'spend', 'todo']);
  assert.deepEqual(plain(next.map((w) => w.id)), ['bills', 'hidden', 'spend', 'todo']);
  assert.equal(next[1], all[1], 'the hidden card itself is untouched');
  assert.deepEqual(plain(reorderSubset(all, (w) => w.id, ['nope', 'todo', 'spend', 'bills']).map((w) => w.id)), ['todo', 'hidden', 'spend', 'bills']);
});

test('the menu goes under the item, else above, else pinned to the bottom', () => {
  const screen = { width: 390, height: 844, top: 47, bottom: 34 };
  const menu = { width: 248, height: 4 * 48 + 36 };
  assert.deepEqual(plain(menuPlacement({ x: 16, y: 150, width: 358, height: 120 }, menu, screen)), { left: 16, top: 280, side: 'below' });
  assert.deepEqual(plain(menuPlacement({ x: 16, y: 560, width: 358, height: 160 }, menu, screen)), { left: 16, top: 322, side: 'above' });
  assert.equal(menuPlacement({ x: 16, y: 120, width: 358, height: 690 }, menu, screen).side, 'over', 'a card taller than the room around it');
  assert.equal(menuPlacement({ x: 205, y: 150, width: 169, height: 176 }, menu, screen).left, 390 - 16 - 248, 'kept on screen for a right-column tile');
});
