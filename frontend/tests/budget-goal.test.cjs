// Obiectiv de economii: per day / week / month to reach the target by its date.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');

const { goalPace, localDay } = loadModule('lib/budget/goal.ts');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ''} ${a} != ${b}`);

test('10.000 lei by a date 365 days away, 1.000 already saved', () => {
  const r = goalPace({ target: 10000, current: 1000, targetDate: '2027-11-02', today: '2026-11-02', setAside: 450 });
  assert.equal(r.status, 'ok');
  assert.equal(r.days, 365);
  assert.equal(r.remaining, 9000);
  near(r.perDay, 9000 / 365);
  near(r.perWeek, (9000 / 365) * 7);
  near(r.perMonth, (9000 / 365) * (365.25 / 12));
  assert.equal(r.onTrack, false, '450/month is short of ~750');
  assert.equal(goalPace({ target: 10000, current: 1000, targetDate: '2027-11-02', today: '2026-11-02', setAside: 800 }).onTrack, true);
  assert.equal(goalPace({ target: 10000, current: 1000, targetDate: '2027-11-02', today: '2026-11-02' }).onTrack, null, 'no plan');
});

test('the server sends target_date as a full ISO timestamp', () => {
  const r = goalPace({ target: 700, current: 0, targetDate: '2026-11-09T00:00:00.000000Z', today: '2026-11-02' });
  assert.equal(r.days, 7);
  near(r.perDay, 100);
  near(r.perWeek, 700);
  near(r.perMonth, 700, 'under a month: all of it this month');
});

test('no target, reached, no date, date passed', () => {
  assert.equal(goalPace({ target: 0, current: 50, targetDate: '2027-01-01', today: '2026-11-02' }).status, 'none');
  assert.equal(goalPace({ target: 500, current: 500, targetDate: '2027-01-01', today: '2026-11-02' }).status, 'reached');
  const noDate = goalPace({ target: 500, current: 100, targetDate: null, today: '2026-11-02' });
  assert.equal(noDate.status, 'no-date');
  assert.equal(noDate.remaining, 400);
  assert.equal(goalPace({ target: 500, current: 100, targetDate: '2026-11-01', today: '2026-11-02' }).status, 'overdue', 'yesterday is too late');
  const todayGoal = goalPace({ target: 500, current: 100, targetDate: '2026-11-02', today: '2026-11-02' });
  assert.equal(todayGoal.status, 'ok', 'today (the picker allows it) is one last day');
  assert.equal(todayGoal.days, 1);
  near(todayGoal.perDay, 400);
  assert.equal(goalPace({ target: 500, current: -200, targetDate: '2026-11-12', today: '2026-11-02' }).remaining, 500, 'negative savings never add to what is left');
});

test('localDay is the local calendar day', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
