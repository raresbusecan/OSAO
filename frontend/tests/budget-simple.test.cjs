// "Buget simplu" (2026-11-02): Venit -> Pui deoparte -> De cheltuit.
// Spec SPEC-SIMPLE §5 fixture: I 7000, A 1400, E 5600, bills 520, rates 610
// -> R 1130; a 180 lei Calendar purchase on day 24 (planned); S 1985
// (includes 145 that used to be guilt-free); t 13, D 30.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');

const pace = loadModule('lib/budget/pace.ts');
const format = loadModule('lib/format.ts');
const plan = loadModule('lib/budget/plan.ts', {
  react: { useEffect() {}, useState: (v) => [v, () => {}] },
  '@/lib/api': { api: {} },
  '@/lib/sessionCache': { onSessionReset() {}, sessionVersion: () => 0 },
  '@/lib/format': format,
});

const ev = [{ day: 24, amount: 180, planned: true, title: 'ITP' }];
// this_month per label folds in bills + planned (Home's bills, Expenses' event).
const spending = { Car: { this_month: 900 }, Home: { this_month: 1020 }, Grocery: { this_month: 425 }, Expenses: { this_month: 340 } };
const recurring = { Home: 520 };
const planned = { Expenses: 180 };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg ?? ''} ${a} != ${b}`);

test('1. monthSpend with credit rates: R = bills + rates, rates never "Cheltuit"', () => {
  const ms = plan.monthSpend(spending, recurring, planned, 610);
  assert.equal(ms.recurring, 1130);
  assert.equal(ms.bills, 520);
  assert.equal(ms.rates, 610);
  assert.equal(ms.committed, 3295);
  assert.equal(ms.recorded, 1985);
  assert.equal(ms.planned, 180);
  // no rates (default) = the old needsSpend numbers
  const none = plan.monthSpend(spending, recurring, planned);
  assert.equal(none.recurring, 520);
  assert.equal(none.committed, 2685);
});

const base = { E: 5600, R: 1130, pAhead: 180, S: 1985, t: 13, D: 30, events: ev };

test('2. pace on De cheltuit: flex 4290, ritm 1859, Δ 126 inside the band -> În ritm', () => {
  const r = pace.paceStatus(base);
  assert.equal(r.flex, 4290);
  near(r.ritm, 1859);
  near(r.delta, 126);
  near(r.band, 223.5);
  assert.equal(r.state, 6);
  assert.equal(pace.paceChip(r), 'În ritm');
  assert.equal(r.liber, 2305);
  assert.equal(r.daysLeft, 18);
  assert.equal(r.perDay, 128);
});

test('3. nothing put aside: E = income', () => {
  const r = pace.paceStatus({ ...base, E: 7000 });
  assert.equal(r.liber, 3705);
  assert.equal(r.perDay, 205);
});

test('4. bills + rates take all of E -> state 1', () => {
  const r = pace.paceStatus({ ...base, R: 5600 });
  assert.equal(r.state, 1);
  assert.equal(pace.paceChip(r), 'Facturile și ratele trec de buget');
  assert.match(pace.runsText(pace.paceSentence(r, { ...base, R: 5600 })), /^Facturile și ratele \(5\.600 lei\) iau tot ce ai de cheltuit \(5\.600 lei\)\.$/);
});

test('5. over: committed 5910 -> Liber −310 -> state 2', () => {
  const input = { ...base, S: 4600 };
  const r = pace.paceStatus(input);
  assert.equal(r.liber, -310);
  assert.equal(r.state, 2);
  assert.equal(pace.paceChip(r), 'Ai trecut de buget');
  assert.match(pace.runsText(pace.paceSentence(r, input)), /treci de cei 5\.600 lei cu 310 lei\./);
});

test('6. Pui deoparte presets: whole lei', () => {
  assert.deepEqual(Array.from(plan.SET_ASIDE_PRESETS), [0, 10, 20, 30]);
  assert.deepEqual(Array.from(plan.SET_ASIDE_PRESETS, (p) => plan.setAsideFromPercent(7000, p)), [0, 700, 1400, 2100]);
  assert.equal(plan.setAsideFromPercent(6543, 10), 654);
});

test('7. IncomeSheet validation: A > I invalid, A = I valid (E = 0 -> state 1)', () => {
  assert.equal(plan.planInputValid(7000, 7001), false);
  assert.equal(plan.planInputValid(7000, 7000), true);
  assert.equal(plan.planInputValid(7000, 0), true);
  assert.equal(plan.planInputValid(0, 0), false);
  assert.equal(plan.planInputValid(7000, -1), false);
  assert.equal(pace.paceStatus({ ...base, E: 0 }).state, 1);
});

test('8. Economii caption: with and without Pui deoparte', () => {
  const withA = plan.savingsCaption(1400, 5600, 'decembrie');
  assert.match(withA, /^Pe 1 decembrie: \+ 1\.400 lei puși deoparte și ce rămâne necheltuit din cei 5\.600 lei\./);
  const noA = plan.savingsCaption(0, 7000, 'decembrie');
  assert.ok(!/puși deoparte/.test(noA));
  assert.match(noA, /^Pe 1 decembrie: ce rămâne necheltuit din cei 7\.000 lei\. Dacă treci de ei, diferența se scade\.$/);
});

test('9. plan from GET /budget: null set_aside (before the migration) = 0, strings accepted', () => {
  assert.equal(plan.normalizePlan(null), null);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.normalizePlan({ monthly_income: '7000.00', set_aside: null, spendable: null }))), { monthly_income: 7000, set_aside: 0, spendable: 7000 });
  assert.deepEqual(JSON.parse(JSON.stringify(plan.normalizePlan({ monthly_income: 7000, set_aside: '1400.00', spendable: '5600.00' }))), { monthly_income: 7000, set_aside: 1400, spendable: 5600 });
  // old payload shape (split, no set_aside) still loads
  assert.equal(plan.normalizePlan({ monthly_income: 7000, split: { needs: 55 } }).spendable, 7000);
  const summary = plan.pickSummary({ plan: { monthly_income: 7000, set_aside: 1400, spendable: 5600 }, credit: { rates: '610', count: 1, items: [] }, guiltFree: { budget: 1 } });
  assert.equal(summary.credit.rates, 610);
  assert.ok(!('guiltFree' in summary));
});
