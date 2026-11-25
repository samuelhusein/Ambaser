const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAppearance } = require('../dist/shared/appearance');
const dft = { mode: 'dark', theme: 'default', wallpaper: 'daily' };

test('parseAppearance keeps valid choices and replaces the rest', () => {
  assert.deepEqual(parseAppearance({ mode: 'light', theme: 'rose', wallpaper: 'none' }), { mode: 'light', theme: 'rose', wallpaper: 'none' });
  assert.deepEqual(parseAppearance({ mode: 'x', theme: '__proto__', wallpaper: 'nope' }), dft);
  assert.deepEqual(parseAppearance(null), dft);
});
