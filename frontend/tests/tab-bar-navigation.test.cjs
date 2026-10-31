const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');

function setup({ simple = false, current = 'home', inSpace = false, prevented = false, deep = false } = {}) {
  const calls = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: (current) => ({ current }), useState: (initial) => [initial, () => {}], useEffect() {},
  };
  class Value { interpolate() { return 0; } }
  const mocks = {
    react: React,
    'react-native': { View: 'View', Pressable: 'Pressable', Text: 'Text', Animated: { Value, View: 'Animated.View' }, StyleSheet: { hairlineWidth: 1 } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'expo-router': { usePathname: () => inSpace ? '/7' : '/' + current, useSegments: () => ['(tabs)', inSpace ? '[id]' : current] },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@/lib/theme': { useTheme: () => ({ colors: {} }) },
    '@/lib/motion': { motion: { scale: { control: 0.98 } } },
    '@/lib/navigation/returnTrail': { TAB_ORDER: ['home', 'spaces', 'calendar', 'budget'], isTabDeep: () => deep, recordTabLeave: (...args) => calls.push(['trail', ...args]), setTabBarHeight() {} },
    '@/lib/simpleSheets': { useSimpleSheets: () => ({ spaceAccent: null }), openQuickAdd: (id) => calls.push(['add', id]) },
    '@/components/ui/PressableScale': { PressableScale: 'PressableScale' },
    '@/components/ui/tourTargets': { useTourTarget: () => ({}) },
    '@/lib/appMode': { useAppMode: () => ({ isSimple: simple }) },
  };
  mocks['./SimpleTabBar'] = loadModule('components/navigation/SimpleTabBar.tsx', mocks);
  const { MainTabBar } = loadModule('components/navigation/MainTabBar.tsx', mocks);
  const names = ['home', 'spaces', 'calendar', 'budget', 'search', '[id]'];
  const routes = names.map((name) => ({ key: 'route-key-' + name, name }));
  // Exact SDK 58 tabBar contract: no navigation prop, navigation uses a route KEY.
  const props = {
    state: { routes, index: names.indexOf(inSpace ? '[id]' : current) },
    descriptors: Object.fromEntries(routes.map(({ key }) => [key, { options: {} }])),
    emitter: { emit: (event) => { calls.push(['event', event.type, event.target]); return { defaultPrevented: prevented }; } },
    navigateToTab: (key) => calls.push(['navigate', key]), insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  const render = (node) => {
    if (Array.isArray(node)) return node.flatMap(render);
    if (!node || typeof node !== 'object') return [];
    if (typeof node.type === 'function') return render(node.type(node.props));
    return [node, ...render(node.props.children)];
  };
  const nodes = render(MainTabBar(props));
  return { calls, press: (name) => {
    const button = nodes.find((node) => node.props.testID === 'main-tab-' + name);
    assert.ok(button, 'missing tab button: ' + name);
    button.props.onPress();
  }, nodes };
}

for (const simple of [false, true]) {
  for (const name of simple ? ['home', 'calendar'] : ['home', 'spaces', 'calendar', 'budget']) {
    test((simple ? 'Simple' : 'Full') + ' SDK 58 bar navigates to ' + name + ' using its route key', () => {
      const bar = setup({ simple, current: name === 'home' ? 'calendar' : 'home' });
      bar.press(name);
      assert.deepEqual(bar.calls[0], ['event', 'tabPress', 'route-key-' + name]);
      assert.deepEqual(bar.calls.at(-1), ['navigate', 'route-key-' + name]);
    });
  }
  test((simple ? 'Simple' : 'Full') + ' bar respects prevented presses and active-tab presses', () => {
    for (const options of [{ prevented: true }, { current: 'calendar' }]) {
      const bar = setup({ simple, ...options });
      bar.press('calendar');
      assert.equal(bar.calls.length, 1);
      assert.equal(bar.calls[0][0], 'event');
    }
  });
  test((simple ? 'Simple' : 'Full') + ' bar returns from a Space despite its highlighted parent tab', () => {
    const bar = setup({ simple, inSpace: true });
    const name = simple ? 'home' : 'spaces';
    bar.press(name);
    assert.deepEqual(bar.calls.at(-1), ['navigate', 'route-key-' + name]);
  });
}

test('Full bar records the deep return trail before navigation and hides internal routes', () => {
  const bar = setup({ current: 'budget', deep: true });
  bar.press('calendar');
  assert.deepEqual(bar.calls, [['event', 'tabPress', 'route-key-calendar'], ['trail', 'budget', '/budget', 'calendar', true], ['navigate', 'route-key-calendar']]);
  assert.equal(bar.nodes.filter((node) => node.props.testID?.startsWith('main-tab-')).length, 4);
});

test('Simple quick-add opens its sheet without navigating', () => {
  const bar = setup({ simple: true });
  bar.nodes.find((node) => node.props.testID === 'simple-tab-add').props.onPress();
  assert.deepEqual(bar.calls, [['add', null]]);
});


// Run the app's real screen declarations through the installed SDK's processor.
// SDK 58 turns href:null into hidden:true, which redirects a focused route.
function processedScreens(simple) {
  let processScreens;
  loadModule('node_modules/expo-router/build/layouts/TabsClient.js', {
    '../link/Link': {},
    '../react-navigation/bottom-tabs/navigators/createBottomTabNavigator': {},
    '../react-navigation/native': {},
    '../standard-navigation': { integrateWithRouter: (_factory, _router, options) => { processScreens = options.processScreens; return () => null; } },
    '../standard-navigation/appendMissingPlaceholderTabRoutes': {},
    './createBaseTabProps': {}, '../react-navigation/bottom-tabs': {},
  });
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  function Tabs() {}
  Tabs.Screen = 'Tabs.Screen';
  const { default: TabsLayout } = loadModule('app/(tabs)/_layout.tsx', {
    react: React, 'expo-router': { Tabs, useSegments: () => ['(tabs)', '[id]'] },
    'react-native': { View: 'View', Text: 'Text' }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@/lib/theme': { useTheme: () => ({ colors: {} }) },
    '@/components/navigation/TabSwipeEdges': { TabSwipeEdges: 'TabSwipeEdges' },
    '@/components/navigation/MainTabBar': { MainTabBar: 'MainTabBar' },
    '@/components/navigation/ReturnTrailHint': { ReturnTrailHint: 'ReturnTrailHint' },
    '@/lib/appMode': { useAppMode: () => ({ isSimple: simple }) },
    '@/components/simple/QuickAddSheet': { QuickAddHost: 'QuickAddHost' },
    '@/components/simple/EditRecordSheet': { EditRecordHost: 'EditRecordHost' },
    '@/lib/refresh': { REFRESH_EVENT: 'lifeos.refresh' },
  }, { React });
  const tabNode = TabsLayout().props.children.find(node => node?.type === Tabs);
  const declarations = tabNode.props.children.filter(node => node?.type === Tabs.Screen).map(node => node.props);
  const legacy = processScreens(declarations.map(screen => screen.name === '[id]' ? { ...screen, options: { href: null } } : screen));
  assert.equal(legacy.find(screen => screen.name === '[id]').options.hidden, true, 'the old declaration reproduces the SDK 58 redirect condition');
  return processScreens(declarations);
}

for (const simple of [false, true]) {
  test((simple ? 'Simple' : 'Full') + ' Space route remains navigable after SDK 58 screen processing', () => {
    const screens = processedScreens(simple);
    const space = screens.find(screen => screen.name === '[id]');
    assert.ok(space, 'Space route must stay registered');
    assert.notEqual(space.options?.hidden, true, 'hidden:true redirects the Space back to Home');
    assert.equal(screens.find(screen => screen.name === 'search').options.hidden, true, 'removed search stays inaccessible');
  });
}
