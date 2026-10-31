const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness(responses) {
  const timers = new Map(), states = [], effects = [];
  let id = 0, requests = 0, listener, removed = false;
  const appState = { currentState: 'active', addEventListener: (_, fn) => { listener = fn; return { remove: () => { removed = true; } }; } };
  const { useSocialProviders } = loadModule('lib/socialAuth.ts', {
    react: { useState: initial => [initial, state => states.push(state)], useEffect: fn => effects.push(fn) },
    'react-native': { Platform: { OS: 'ios' }, AppState: appState },
    'expo-apple-authentication': { isAvailableAsync: async () => true }, 'expo-web-browser': {}, 'expo-linking': {},
    '@/lib/api': { api: { authProviders: async () => { const next = responses[requests++]; if (next instanceof Error) throw next; return await next; } } },
  }, { setTimeout: (fn, delay) => { const key = ++id; timers.set(key, { fn, delay }); return key; }, clearTimeout: key => timers.delete(key) });
  function mount() { useSocialProviders(); return effects.shift()(); }
  return { states, timers, mount, get requests() { return requests; }, get removed() { return removed; }, change: state => { appState.currentState = state; listener(state); }, retry: () => { const [key, timer] = timers.entries().next().value; timers.delete(key); timer.fn(); } };
}

test('Google appears without remounting when the backend recovers after the first login-screen request', async () => {
  const h = harness([new Error('upstream 502'), { apple: true, google: true, facebook: false }]);
  h.mount(); await flush();
  assert.equal(h.states.at(-1).apple, true); assert.equal(h.states.at(-1).google, false);
  assert.equal([...h.timers.values()][0].delay, 2000);
  h.retry(); await flush();
  assert.equal(h.requests, 2); assert.equal(h.states.at(-1).google, true); assert.equal(h.timers.size, 0);
});

test('repeated outages back off and retry work pauses in background, resuming on foreground', async () => {
  const h = harness([new Error('offline'), new Error('offline'), { apple: true, google: true, facebook: false }]);
  h.mount(); await flush(); h.retry(); await flush();
  assert.equal([...h.timers.values()][0].delay, 4000);
  h.change('background'); assert.equal(h.timers.size, 0);
  h.change('active'); await flush(); assert.equal(h.requests, 3); assert.equal(h.states.at(-1).google, true);
});

test('provider configuration is revalidated after returning to login rather than cached for the whole app session', async () => {
  const h = harness([{ apple: false, google: false, facebook: false }, { apple: true, google: true, facebook: false }]);
  const cleanup = h.mount(); await flush(); assert.equal(h.states.at(-1).apple, false); cleanup();
  h.mount(); await flush(); assert.equal(h.states.at(-1).google, true); assert.equal(h.requests, 2);
});

test('unmount cancels retries and ignores requests that finish after the screen is gone', async () => {
  let finish;
  const h = harness([new Promise(resolve => { finish = resolve; })]);
  const cleanup = h.mount(); await flush(); const count = h.states.length; cleanup();
  finish({ apple: true, google: true, facebook: false }); await flush();
  assert.equal(h.states.length, count); assert.equal(h.timers.size, 0); assert.equal(h.removed, true);
  const offline = harness([new Error('offline')]); const stop = offline.mount(); await flush(); stop(); assert.equal(offline.timers.size, 0);
});


test('a tunnel HTML response is retried instead of being accepted as all providers disabled', async () => {
  const h = harness(['<html>tunnel not ready</html>', { apple: true, google: true, facebook: false }]);
  h.mount(); await flush(); assert.equal(h.timers.size, 1);
  h.retry(); await flush(); assert.equal(h.states.at(-1).google, true);
});
