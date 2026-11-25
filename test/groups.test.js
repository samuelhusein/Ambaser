const test = require('node:test');
const assert = require('node:assert/strict');
const { moveToGroup, patchGroup, reviveGroups } = require('../dist/shared/groups');

const make = () => ['a', 'b', 'c', 'd'].map((id) => ({ id, groupId: null }));
const order = (tabs) => tabs.map((t) => `${t.id}${t.groupId ?? ''}`).join(' ');

test('moveToGroup keeps group members together', () => {
  const tabs = make();
  const [a, b, c, d] = tabs;
  moveToGroup(tabs, a, 1);
  moveToGroup(tabs, c, 1);
  assert.equal(order(tabs), 'a1 c1 b d');
  moveToGroup(tabs, d, 1);
  moveToGroup(tabs, a, null); // leaving from the front steps past the group
  assert.equal(order(tabs), 'c1 d1 a b');
  moveToGroup(tabs, c, 2); // a new group never splits the old one
  assert.equal(order(tabs), 'd1 c2 a b');
  moveToGroup(tabs, b, 2);
  assert.equal(order(tabs), 'd1 c2 b2 a');
});

test('patchGroup ignores invalid values', () => {
  const group = { id: 1, name: '', color: 'grey', icon: 'none', collapsed: false };
  patchGroup(group, { name: 'x'.repeat(50), color: 'blue', icon: 'star', collapsed: true, id: 9 });
  assert.deepEqual(group, { id: 1, name: 'x'.repeat(30), color: 'blue', icon: 'star', collapsed: true });
  patchGroup(group, { color: 'url(x)', icon: '__proto__', name: 5 });
  patchGroup(group, null);
  assert.equal(group.color, 'blue');
  assert.equal(group.icon, 'star');
});

test('placeTab reorders and takes the group of the drop target', () => {
  const { placeTab } = require('../dist/shared/groups');
  const tabs = make();
  const [a, b, c, d] = tabs;
  b.groupId = 1;
  c.groupId = 1;
  placeTab(tabs, d, b, true);
  assert.equal(order(tabs), 'a b1 d1 c1');
  placeTab(tabs, d, a, false);
  assert.equal(order(tabs), 'd a b1 c1');
  placeTab(tabs, b, null, false);
  assert.equal(order(tabs), 'd a c1 b');
  placeTab(tabs, a, a, true);
  assert.equal(order(tabs), 'd a c1 b');
});

test('reviveGroups keeps only used, valid groups under new ids', () => {
  let id = 10;
  const saved = [{ id: 3, name: 'Work', color: 'blue', icon: 'star', collapsed: true }, { id: 4, name: 'unused' }, null, { id: 5, color: 'nope' }];
  const groups = reviveGroups(saved, [3, 3, 5, null], () => id++);
  assert.deepEqual([...groups.keys()], [3, 5]);
  assert.deepEqual(groups.get(3), { id: 10, name: 'Work', color: 'blue', icon: 'star', collapsed: true });
  assert.equal(groups.get(5).color, 'grey');
  assert.equal(reviveGroups('junk', [1], () => 1).size, 0);
});
