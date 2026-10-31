const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');
const { parseLocaleNumber } = loadModule('lib/format.ts');

test('numbers typed the Romanian way keep their value', () => {
  for (const [typed, value] of [
    ['124.580', 124580], ['125.210', 125210], ['1.250,50', 1250.5], ['1.500', 1500], ['1 250', 1250],
    ['1.250.000', 1250000], ['312,45', 312.45], ['45,5', 45.5], ['12.50', 12.5], ['7.5', 7.5],
    ['0.500', 0.5], ['  42 ', 42], ['', 0],
  ]) assert.equal(parseLocaleNumber(typed), value, typed);
  assert.ok(Number.isNaN(parseLocaleNumber('abc')));
});

test('event times accept common Romanian spellings and reject impossible ones', () => {
  const { parseClockTime: parse } = loadModule('lib/format.ts');
  const parseClockTime = (raw) => { const r = parse(raw); return r && { ...r }; };
  assert.deepEqual(parseClockTime('14:30'), { hh: 14, mm: 30 });
  assert.deepEqual(parseClockTime('14.30'), { hh: 14, mm: 30 });
  assert.deepEqual(parseClockTime('9'), { hh: 9, mm: 0 });
  assert.deepEqual(parseClockTime(''), { hh: 9, mm: 0 });
  for (const bad of ['25:70', '24:00', '12:60', 'abc', '1430']) assert.equal(parseClockTime(bad), null, bad);
});
