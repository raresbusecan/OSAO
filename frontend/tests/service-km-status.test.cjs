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
