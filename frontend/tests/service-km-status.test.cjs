const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');
const tiers = loadModule('lib/spaces/car/maintenanceTiers.ts');
const { serviceKmStatus } = loadModule('lib/dashboard/spaceDue.ts', {
  '@/lib/format': { roNumber: (n) => n.toLocaleString('ro-RO') },
  '@/lib/spaces/car/maintenanceLabels': {},
  '@/lib/spaces/car/maintenanceTiers': tiers,
  '@/lib/navigation/recordActionRoute': {},
});

test('the Mașină space km window: 2,000 / 1,000 / 500', () => {
  assert.equal(tiers.kmUrgencyTier(2001), null);
  assert.equal(tiers.kmUrgencyTier(2000), 'light');
  assert.equal(tiers.kmUrgencyTier(1001), 'light');
  assert.equal(tiers.kmUrgencyTier(1000), 'medium');
  assert.equal(tiers.kmUrgencyTier(501), 'medium');
  assert.equal(tiers.kmUrgencyTier(500), 'critical');
  assert.equal(tiers.kmUrgencyTier(-300), 'critical');
});

// Objects made inside the test sandbox have its own Object prototype.
const plain = (value) => JSON.parse(JSON.stringify(value));

test('De făcut rows read a car service by km, with the space tier', () => {
  assert.deepEqual(plain(serviceKmStatus({ km_left: 200 })), { label: 'În 200 km', tier: 'critical' });
  assert.deepEqual(plain(serviceKmStatus({ km_left: 1500 })), { label: 'În 1.500 km', tier: 'light' });
  assert.deepEqual(plain(serviceKmStatus({ overdue_km: 500 })), { label: 'Depășit cu 500 km', tier: 'critical' });
  assert.equal(serviceKmStatus({ km_left: 0 }).label, 'Acum');
  assert.equal(serviceKmStatus({}), null, 'a dated item keeps its date label');
});

test('logging a service again from Acasă keeps its day interval from the VISIT, not the due day', async () => {
  let created;
  const { loadFunction } = require('./helpers/load-ts.cjs');
  const parse = (dmy) => { const [d, m, y] = dmy.split('.').map(Number); return new Date(y, m - 1, d).toISOString(); };
  const logCarServiceAgain = loadFunction('lib/dashboard/itemActions.ts', 'logCarServiceAgain', {
    api: { createItem: async (body) => { created = body; } },
    amountOf: () => 300, isValidDateInput: () => true, parseDateInput: parse,
    formatDateInput: (date) => date,
  });
  // /dashboard row for a km_left service: due_at = tomorrow, service_date = the visit.
  const visit = new Date(); visit.setFullYear(visit.getFullYear() - 1);
  const nextDate = new Date(visit); nextDate.setFullYear(nextDate.getFullYear() + 1);
  const dmy = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  await logCarServiceAgain({
    id: 2094, title: 'Oil Change', space: { id: 217 }, current_odometer: 10200,
    due_at: new Date(Date.now() + 86400000).toISOString(), service_date: visit.toISOString(),
    metadata: { odometer: 400, nextServiceOdometer: 10400, nextServiceDate: dmy(nextDate) },
  });
  const days = Math.round((created.metadata.nextServiceDate.getTime() - Date.now()) / 86400000);
  assert.ok(Math.abs(days - 365) <= 1, `interval kept (${days} days)`);
  assert.equal(created.metadata.nextServiceOdometer, 20200);
});
