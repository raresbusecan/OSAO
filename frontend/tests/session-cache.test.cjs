const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, loadCallback } = require('./helpers/load-ts.cjs');
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const react = { useState: (value) => [value, () => {}], useEffect() {} };

test('account change clears spaces, grocery lists and budget immediately', () => {
  const session = loadModule('lib/sessionCache.ts');
  const quick = loadModule('lib/quickAddCache.ts', { '@/lib/api': {}, '@/lib/sessionCache': session, '@/lib/spaces/grocery/groceryItems': {}, '@/lib/spaces/spaceProfile': {} });
  const budget = loadModule('lib/budget/plan.ts', { react, '@/lib/api': {}, '@/lib/sessionCache': session });
  quick.rememberQuickSpaces([{ id: '1', name: 'Private A' }]);
  quick.rememberGroceryLists('1', [{ name: 'List A' }]);
  budget.primeBudgetPlan({ plan: { monthly_income: 10000 } });
  session.resetSessionCaches();
  assert.equal(quick.cachedQuickSpaces(), null);
  assert.equal(quick.cachedGroceryLists('1'), null);
  assert.equal(budget.useBudgetPlan(), null);
});

test('late account A responses cannot overwrite account B cache or inflight request', async () => {
  const session = loadModule('lib/sessionCache.ts');
  const old = deferred(), current = deferred();
  let n = 0;
  const budget = loadModule('lib/budget/plan.ts', { react, '@/lib/sessionCache': session, '@/lib/api': { api: { getBudget: () => (++n === 1 ? old.promise : current.promise) } } });
  const a = budget.refreshBudgetPlan();
  session.resetSessionCaches();
  const b = budget.refreshBudgetPlan();
  old.resolve({ plan: { monthly_income: 99999 } });
  assert.equal(await a, null);
  assert.equal(budget.useBudgetPlan(), null);
  assert.equal(budget.refreshBudgetPlan(), b);
  current.resolve({ plan: { monthly_income: 100 } });
  await b;
  assert.equal(budget.useBudgetPlan().plan.monthly_income, 100);
});

test('late grocery prefetch cannot restore an old account after reset', async () => {
  const session = loadModule('lib/sessionCache.ts');
  const oldLists = deferred();
  const quick = loadModule('lib/quickAddCache.ts', {
    '@/lib/sessionCache': session,
    '@/lib/api': { api: { listSpaces: async () => ({ spaces: [{ id: 1, name: 'Private A', type: 'grocery' }] }) } },
    '@/lib/spaces/grocery/groceryItems': { loadMyGroceryData: () => oldLists.promise },
    '@/lib/spaces/spaceProfile': { detectSpaceType: (s) => s.type, profileFromSpace: () => null },
  });
  const pending = quick.prefetchQuickAdd();
  await Promise.resolve();
  session.resetSessionCaches();
  oldLists.resolve({ lists: [{ name: 'Private list A' }] });
  await pending;
  assert.equal(quick.cachedQuickSpaces(), null);
  assert.equal(quick.cachedGroceryLists('1'), null);
});

test('late API responses are rejected and a slow logout cannot remove the new token', async () => {
  const session = loadModule('lib/sessionCache.ts');
  const response = deferred();
  const values = new Map([['lifeos_token', 'old-token']]);
  const { api, setToken } = loadModule('lib/api.ts', {
    'expo-secure-store': {}, 'react-native': { Platform: { OS: 'web' } },
    '@/lib/i18n': { currentLanguage: () => 'ro' }, '@/lib/sessionCache': session,
  }, {
    process: { env: { EXPO_PUBLIC_BACKEND_URL: 'http://audit.test' } },
    localStorage: { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) },
    console: { log() {}, error() {} },
    fetch: () => response.promise,
  });
  const oldLogout = api.logout();
  await Promise.resolve();
  await setToken('new-token');
  response.resolve({ ok: true, text: async () => '{}' });
  assert.equal(await oldLogout, false);
  assert.equal(values.get('lifeos_token'), 'new-token');
});

for (const platform of ['android', 'ios']) {
  test(`${platform}: pending SecureStore deletion cannot erase a newer sign-in or clear its user`, async () => {
    const session = loadModule('lib/sessionCache.ts');
    const deletionStarted = deferred(), deletion = deferred();
    let stored = 'old-token', user = { id: 'A' };
    const { api, setToken } = loadModule('lib/api.ts', {
      'expo-secure-store': {
        getItemAsync: async () => stored,
        setItemAsync: async (_key, value) => { stored = value; },
        deleteItemAsync: async () => { deletionStarted.resolve(); await deletion.promise; stored = null; },
      },
      'react-native': { Platform: { OS: platform } },
      '@/lib/i18n': { currentLanguage: () => 'ro' }, '@/lib/sessionCache': session,
    }, {
      process: { env: { EXPO_PUBLIC_BACKEND_URL: 'http://audit.test' } },
      console: { log() {}, error() {} },
      fetch: async () => ({ ok: true, text: async () => '{}' }),
    });
    const common = { useCallback: (fn) => fn, setUser: (value) => { user = value; }, sessionVersion: session.sessionVersion };
    const signOut = loadCallback('providers/auth.tsx', 'signOut', { ...common, api });
    const signIn = loadCallback('providers/auth.tsx', 'signInWithToken', { ...common, setToken, normalizeUser: (value) => value });
    const oldLogout = signOut();
    await deletionStarted.promise;
    const newLogin = signIn({ id: 'B' }, 'new-token');
    deletion.resolve();
    await Promise.all([oldLogout, newLogin]);
    assert.equal(stored, 'new-token');
    assert.equal(user.id, 'B');
  });
}
