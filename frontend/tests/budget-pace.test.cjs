const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');
const pace = loadModule('lib/budget/pace.ts');

// Spec §7.2 fixture = the approved mockup's data.
const ev = [{ day: 24, amount: 180, planned: true, title: 'ITP' }];
const base = { E: 3850, R: 520, pAhead: 180, S: 1840, t: 13, D: 30, events: ev };
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg ?? ''} ${a} != ${b}`);
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

test('6. first 5 days: state 3; day 6: state 4', () => {
  const r5 = pace.paceStatus({ ...base, t: 5 });
  assert.equal(r5.state, 3);
  assert.equal(pace.paceChip(r5), 'Început de lună');
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
  assert.match(text, /treci de cei 3.850 lei cu 350 lei/);
  assert.doesNotMatch(text, /pe zi/);
});

test('8. bills take the whole envelope: state 1', () => {
  const r = pace.paceStatus({ ...base, R: 3850 });
  assert.equal(r.state, 1);
  assert.equal(pace.paceChip(r), 'Facturile și ratele trec de buget');
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

test('11. weekly spend, the current week up to today', () => {
  const daily = Array.from({ length: 30 }, () => 0);
  daily[0] = 100; daily[9] = 50; daily[12] = 20; daily[13] = 999;
  const bars = pace.weekBars(daily, 30, 13, 0);
  assert.equal(bars[0].when, 'past');
  assert.equal(bars[0].value, 100);
  assert.equal(bars[1].when, 'current');
  assert.equal(bars[1].value, 70);
  assert.equal(bars[2].when, 'future');
  assert.equal('normal' in bars[0], false);
});

test('per-space pace is gone (2026-11-02: one Necesități envelope)', () => {
  assert.equal(pace.spacePace, undefined);
  assert.equal(pace.sortSpaceRows, undefined);
  assert.equal(pace.SPACE_STATUS_CHIP, undefined);
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

test('a Calendar purchase done before its day counts as of today (QA 2026-11-02)', () => {
  const p = pace.normalizePace({ month: '2026-11', today: 10, days_in_month: 30, labels: { Expenses: { daily: [], events: [
    { day: 20, amount: 300, planned: false, title: 'ITP' },
    { day: 24, amount: 180, planned: true, title: 'Revizie' },
    { day: 4, amount: 50, planned: false, title: 'Taxă' },
  ] } } });
  assert.deepEqual(plain(p.labels.Expenses.events.map((e) => e.day)), [10, 24, 4]);
});
