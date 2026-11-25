const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAppearance } = require('../dist/shared/appearance');

test('parseAppearance keeps valid choices and replaces the rest', () => {
  assert.deepEqual(parseAppearance({ mode: 'light', theme: 'rose' }), { mode: 'light', theme: 'rose' });
  assert.deepEqual(parseAppearance({ mode: 'x', theme: '__proto__' }), { mode: 'dark', theme: 'default' });
  assert.deepEqual(parseAppearance(null), { mode: 'dark', theme: 'default' });
});
