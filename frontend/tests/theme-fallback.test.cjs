const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers/load-ts.cjs');

test('missing or unspecified device theme falls back to light, and dark remains dark', () => {
  for (const scheme of [null, undefined, 'unspecified', 'light', 'dark']) {
    const { useThemeColor: readColor } = loadModule('hooks/use-theme-color.ts', {
      '@/constants/theme': { Colors: { light: { text: 'light' }, dark: { text: 'dark' } } },
      '@/hooks/use-color-scheme': { useColorScheme: () => scheme },
    });
    assert.equal(readColor({}, 'text'), scheme === 'dark' ? 'dark' : 'light');
  }
});
