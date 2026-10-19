const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCallback } = require('./helpers/load-ts.cjs');

test('document form closes and reports renewal only after persistence succeeds', async () => {
  let resolve;
  const request = new Promise((done) => { resolve = done; });
  const events = [];
  const save = loadCallback('components/spaces/car/CarDashboard.tsx', 'handleDocumentSave', {
    documentRenewFrom: { documentType: 'RCA' },
    onDocumentSave: () => request,
    setDocumentFormVisible: (visible) => events.push(visible),
    setEditingDocumentEntry() {}, setDocumentRenewFrom() {}, formatCarDate: String,
    notifyAction: (title) => events.push(title),
  });
  const pending = save({ title: 'RCA', expiryDate: '01.01.2028' });
  assert.equal(events.length, 0);
  resolve();
  await pending;
  assert.deepEqual(events, [false, 'Reînnoit']);
});

test('failed document save keeps the form open and never reports success', async () => {
  const events = [];
  const save = loadCallback('components/spaces/car/CarDashboard.tsx', 'handleDocumentSave', {
    documentRenewFrom: { documentType: 'RCA' },
    onDocumentSave: async () => { throw new Error('Offline'); },
    setDocumentFormVisible: () => events.push('closed'),
    setEditingDocumentEntry() {}, setDocumentRenewFrom() {},
    notifyAction: () => events.push('success'),
  });
  await assert.rejects(save({ title: 'RCA' }), /Offline/);
  assert.deepEqual(events, []);
});

test('document form shows save errors inline and prevents duplicate submissions', async () => {
  let reject, attempts = 0, error = '';
  const request = new Promise((_, fail) => { reject = fail; });
  const save = loadCallback('components/spaces/car/forms/CarDocumentForm.tsx', 'handleSave', {
    saveLock: { current: false }, setSaving() {}, setError: (e) => { error = e; },
    documentType: 'RCA', title: 'RCA', price: '', issuer: '', issueDate: '01.01.2026', expiryDate: '31.12.2026', notes: '', guiltFree: false,
    entry: undefined, isRenewing: false, renewFrom: undefined,
    isValidDate: () => true, parseDate: (date) => date.startsWith('31') ? 2 : 1,
    onSave: () => { attempts++; return request; },
  });
  const pending = save();
  await save();
  assert.equal(attempts, 1);
  reject(new Error('Offline'));
  await pending;
  assert.equal(error, 'Offline');
});
