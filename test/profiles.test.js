const test = require('node:test');
const assert = require('node:assert');
const { MAX_PROFILES, editProfile, newProfile, parseProfiles } = require('../dist/shared/profiles');

test('the default profile is always first', () => {
  assert.deepStrictEqual(parseProfiles(null), [{ id: '', name: 'Default', color: 'blue' }]);
  const list = parseProfiles([{ id: 'ab12', name: 'Work', color: 'red' }, { id: '', name: 'Home', color: 'nope' }]);
  assert.deepStrictEqual(list.map((p) => [p.name, p.color]), [['Home', 'blue'], ['Work', 'red']]);
});

test('ids that could leave the profile folder are dropped', () => {
  const bad = [{ id: '..', name: 'a' }, { id: 'a/b', name: 'b' }, { id: 'ok', name: 3 }];
  assert.strictEqual(parseProfiles(bad).length, 1);
});

test('a new profile needs an unused name and gets an unused colour', () => {
  const list = parseProfiles(null);
  assert.deepStrictEqual(newProfile(list, '  My   work ', 'ab'), { id: 'ab', name: 'My work', color: 'red' });
  assert.strictEqual(typeof newProfile(list, '   ', 'ab'), 'string');
  assert.strictEqual(typeof newProfile(list, 'default', 'ab'), 'string');
  const full = Array.from({ length: MAX_PROFILES }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 'red' }));
  assert.strictEqual(typeof newProfile(full, 'One more', 'ab'), 'string');
});

test('editing renames and recolours, keeping names unique', () => {
  const list = parseProfiles([{ id: 'ab', name: 'Work', color: 'red' }]);
  assert.deepStrictEqual(editProfile(list, 'ab', 'work', 'green')[1], { id: 'ab', name: 'work', color: 'green' });
  assert.strictEqual(editProfile(list, '', 'Mine', 'bogus')[0].color, 'blue');
  assert.strictEqual(typeof editProfile(list, 'ab', 'Default', 'red'), 'string');
  assert.strictEqual(typeof editProfile(list, 'zz', 'New', 'red'), 'string');
});
