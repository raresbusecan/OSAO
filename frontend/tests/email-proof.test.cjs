const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCallback } = require('./helpers/load-ts.cjs');

for (const sameAccount of [true, false]) test(`mailbox proof: ends only the matching local session (${sameAccount})`, async () => {
  const calls = [];
  const submit = loadCallback('app/verify-email.tsx', 'submit', {
    canSubmit: true, email: 'owner@example.test', token: 'proof', password: 'owner-password', sameAccount,
    setSaving() {}, setError() {}, setPassword() {}, setConfirm() {},
    setStatus: (status) => calls.push(status),
    signOut: async () => calls.push('signOut'),
    router: { replace: () => calls.push('login') },
    api: { verifyEmail: async (...args) => { calls.push(args); } },
  });
  await submit();
  assert.deepEqual(calls[0], ['owner@example.test', 'proof', 'owner-password']);
  assert.equal(calls.includes('signOut'), sameAccount);
  assert.equal(calls.at(-1), sameAccount ? 'login' : 'done');
});

test('invalid or expired proof remains an error and never signs out another account', async () => {
  let status, ended = false;
  const submit = loadCallback('app/verify-email.tsx', 'submit', {
    canSubmit: true, email: 'owner@example.test', token: 'expired', password: 'owner-password', sameAccount: true,
    setSaving() {}, setError() {}, setPassword() {}, setConfirm() {},
    setStatus: (next) => { status = next; },
    signOut: async () => { ended = true; }, apiErrorMessage: () => 'Expired',
    api: { verifyEmail: async () => { throw { body: { errors: { token: ['Expired'] } } }; } },
  });
  await submit();
  assert.equal(status, 'error');
  assert.equal(ended, false);
});
