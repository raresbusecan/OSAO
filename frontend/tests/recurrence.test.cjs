const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');
const { nextTaskOccurrence } = loadModule('lib/spaces/home/calculations/dashboard.calculations.ts', {
  '@/lib/format': {}, './spend.calculations': {},
});

test('monthly recurrence clamps month ends, leap years and year boundaries', () => {
  const before = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    for (const [from, to] of [['2026-01-31', '2026-02-28'], ['2028-01-31', '2028-02-29'], ['2026-03-31', '2026-04-30'], ['2026-12-31', '2027-01-31'], ['2026-01-15', '2026-02-15']]) {
      assert.equal(nextTaskOccurrence(`${from}T10:30:00.000Z`, 'monthly'), `${to}T10:30:00.000Z`);
    }
  } finally { process.env.TZ = before; }
});

test('daily and weekly recurrence preserve local clock time across DST', () => {
  const before = process.env.TZ;
  process.env.TZ = 'Europe/Bucharest';
  try {
    assert.equal(nextTaskOccurrence('2026-03-28T10:00:00.000Z', 'daily'), '2026-03-29T09:00:00.000Z');
    assert.equal(nextTaskOccurrence('2026-03-28T10:00:00.000Z', 'weekly'), '2026-04-04T09:00:00.000Z');
  } finally { process.env.TZ = before; }
});

test('home bills advance by the local calendar day in Romania', () => {
  const before = process.env.TZ;
  process.env.TZ = 'Europe/Bucharest';
  try {
    const { addRecurrenceInterval } = loadModule('components/spaces/home/homeCategoryConfig.ts', {
      '@/lib/format': {}, '@/lib/spaces/home/calculations/dashboard.calculations': {},
    });
    // A bill due 28 Oct is stored as local midnight (27 Oct 22:00Z); paying it must land on 28 Nov.
    assert.equal(addRecurrenceInterval('2026-10-27T22:00:00.000Z', 'monthly', 1), '2026-11-28');
    assert.equal(addRecurrenceInterval('2026-11-28', 'monthly', 1), '2026-12-28');
    assert.equal(addRecurrenceInterval('2026-10-29T22:00:00.000Z', 'weekly', 1), '2026-11-06');
    assert.equal(addRecurrenceInterval('2026-01-30T22:00:00.000Z', 'monthly', 1), '2026-02-28');
  } finally { process.env.TZ = before; }
});
