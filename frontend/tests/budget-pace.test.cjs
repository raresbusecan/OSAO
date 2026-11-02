const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');
const pace = loadModule('lib/budget/pace.ts');

// Spec §7.2 fixture = the approved mockup's data.
const ev = [{ day: 24, amount: 180, planned: true, title: 'ITP' }];
const base = { E: 3850, R: 520, pAhead: 180, S: 1840, t: 13, D: 30, events: ev };
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg ?? ''} ${a} != ${b}`);
const spaces = (t = 13) => ({
  car: pace.spacePace({ L: 650, spent: 310, r: 0, pa: 0, events: [], t, D: 30 }),
  home: pace.spacePace({ L: 1500, spent: 640 + 520, r: 520, pa: 0, events: [], t, D: 30 }),
  grocery: pace.spacePace({ L: 1300, spent: 780, r: 0, pa: 0, events: [], t, D: 30 }),
  expenses: pace.spacePace({ L: 400, spent: 110 + 180, r: 0, pa: 180, events: ev, t, D: 30 }),
});

test('1. flex, ritm, delta, band -> state 4 in lei', () => {
  const r = pace.paceStatus(base);
  assert.equal(r.flex, 3150);
  near(r.ritm, 1365);
  near(r.delta, 475);
  near(r.band, 166.5);
  assert.equal(r.state, 4);
  assert.equal(r.tone, 'warning');
  assert.equal(pace.paceChip(r), 'Cu 475 lei peste ritm');
});

test('2. Liber, daysLeft, cel mult pe zi', () => {
  const r = pace.paceStatus(base);
  assert.equal(r.liber, 1310);
  assert.equal(r.daysLeft, 18);
  assert.equal(r.perDay, 72);
  assert.match(pace.runsText(pace.paceSentence(r, base)), /cel mult 72 lei pe zi\.$/);
});

test('3. ritm at the end of the month = E − R', () => {
  near(pace.ritmAt(30, 3150, 30, ev), 3330);
  const pts = pace.ritmPoints(3150, 30, ev);
  assert.deepEqual(plain(pts[pts.length - 1].map(Math.round)), [30, 3330]);
  // a vertical step on the event's day
  const day24 = pts.filter((p) => p[0] === 24);
  assert.equal(day24.length, 2);
  near(day24[1][1] - day24[0][1], 180);
});

test('4. spaces: status and sort by pace', () => {
  const s = spaces();
  near(s.grocery.ritm, 563.3); near(s.grocery.delta, 216.7); near(s.grocery.band, 65);
  assert.equal(s.grocery.status, 'fast');
  near(s.home.flex, 980); near(s.home.ritm, 424.7); near(s.home.delta, 215.3); near(s.home.band, 49);
  assert.equal(s.home.status, 'fast');
  near(s.car.ritm, 281.7); near(s.car.delta, 28.3); near(s.car.band, 32.5);
  assert.equal(s.car.status, 'on');
  near(s.expenses.flex, 220); near(s.expenses.ritm, 95.3); near(s.expenses.delta, 14.7); assert.equal(s.expenses.band, 20);
  assert.equal(s.expenses.status, 'on');
  const rows = ['car', 'home', 'grocery', 'expenses'].map((kind) => ({ kind, pace: s[kind] }));
  rows.push({ kind: 'car2', pace: null });
  assert.deepEqual(plain(pace.sortSpaceRows(rows).map((r) => r.kind)), ['grocery', 'home', 'car', 'expenses', 'car2']);
  // Depășit first, most over first
  const over = [
    { kind: 'car', pace: pace.spacePace({ L: 100, spent: 150, r: 0, pa: 0, events: [], t: 13, D: 30 }) },
    { kind: 'home', pace: pace.spacePace({ L: 100, spent: 300, r: 0, pa: 0, events: [], t: 13, D: 30 }) },
    { kind: 'grocery', pace: s.grocery },
  ];
  assert.deepEqual(plain(pace.sortSpaceRows(over).map((r) => r.kind)), ['home', 'car', 'grocery']);
});

test('5. Σ space ritm == total ritm when Σ L == E', () => {
  const s = spaces();
  near(s.car.ritm + s.home.ritm + s.grocery.ritm + s.expenses.ritm, pace.paceStatus(base).ritm);
});

test('6. first 5 days: state 3, no row chips or ticks; day 6: state 4', () => {
  const r5 = pace.paceStatus({ ...base, t: 5 });
  assert.equal(r5.state, 3);
  assert.equal(pace.paceChip(r5), 'Început de lună');
  Object.values(spaces(5)).forEach((p) => {
    assert.equal(p.status, 'early');
    assert.equal(p.todayAt, null);
    assert.equal(pace.SPACE_STATUS_CHIP[p.status], null);
  });
  const r6 = pace.paceStatus({ ...base, t: 6 });
  near(r6.ritm, 630);
  near(r6.delta, 1210);
  assert.equal(r6.state, 4);
});

test('7. over the envelope: state 2, no per-day', () => {
  const input = { ...base, S: 3500 };
  const r = pace.paceStatus(input);
  assert.equal(r.liber, -350);
  assert.equal(r.state, 2);
  const text = pace.runsText(pace.paceSentence(r, input));
  assert.match(text, /treci de necesități cu 350 lei/);
  assert.doesNotMatch(text, /pe zi/);
});

test('8. bills take the whole envelope: state 1', () => {
  const r = pace.paceStatus({ ...base, R: 3850 });
  assert.equal(r.state, 1);
  assert.equal(pace.paceChip(r), 'Facturile trec de necesități');
  // row ticks hidden too
  assert.equal(pace.spacePace({ L: 650, spent: 310, r: 0, pa: 0, events: [], t: 13, D: 30, hideTicks: true }).todayAt, null);
});

test('9. nothing spent on day 1', () => {
  const input = { ...base, S: 0, t: 1 };
  const r = pace.paceStatus(input);
  assert.equal(r.state, 3);
  assert.equal(r.liber, 3150);
  assert.equal(r.perDay, 105);
  assert.equal(pace.runsText(pace.paceSentence(r, input)), 'Nimic cheltuit încă luna asta. Mai ai 3.150 lei: cel mult 105 lei pe zi.');
});

test('10. week segments', () => {

  assert.deepEqual(plain(pace.weekSegments(30, 0)), [{ start: 1, end: 8 }, { start: 9, end: 15 }, { start: 16, end: 22 }, { start: 23, end: 30 }]);
  assert.deepEqual(plain(pace.weekSegments(28, 1)), [{ start: 1, end: 7 }, { start: 8, end: 14 }, { start: 15, end: 21 }, { start: 22, end: 28 }]);
});

test('11. weekly normal, and normal-to-date for the current week', () => {
  const daily = Array.from({ length: 30 }, () => 0);
  daily[0] = 100; daily[9] = 50; daily[12] = 20;
  const bars = pace.weekBars(daily, [], 1300, 30, 13, 0);
  near(bars[0].normal, 346.7);
  assert.equal(bars[0].when, 'past');
  assert.equal(bars[0].value, 100);
  near(bars[1].normal, 216.7);
  assert.equal(bars[1].when, 'current');
  assert.equal(bars[1].value, 70);
  assert.equal(bars[2].when, 'future');
});

test('12. Y < 1: the tail says what is left', () => {
  const input = { ...base, S: 3140 };
  const r = pace.paceStatus(input);
  assert.equal(r.liber, 10);
  assert.equal(r.daysLeft, 18);
  assert.match(pace.runsText(pace.paceSentence(r, input)), /Mai ai 10 lei până la final de lună\.$/);
});

test('invariant: the solid line ends on Cheltuit; merged labels; ahead line', () => {
  const D = 30;
  const zeros = () => Array.from({ length: D }, () => 0);
  const car = { daily: zeros(), events: [] };
  const exp = { daily: zeros(), events: [{ day: 24, amount: 180, planned: true }, { day: 3, amount: 40, planned: false }] };
  car.daily[2] = 310; exp.daily[2] = 40; exp.daily[10] = 70;
  const m = pace.mergeLabels([car, exp, undefined], D);
  assert.equal(pace.cumulative(m.daily)[13], 420);
  assert.deepEqual(plain(m.events.map((e) => e.day)), [3, 24]);
  assert.deepEqual(JSON.parse(JSON.stringify(pace.aheadPoints(420, 13, D, m.events))), [[13, 420], [24, 420], [24, 600], [30, 600]]);
});
