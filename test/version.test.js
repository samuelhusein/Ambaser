const test = require('node:test');
const assert = require('node:assert/strict');
const { isNewer } = require('../dist/shared/version');

test('isNewer compares each part as a number', () => {
  assert.equal(isNewer('0.1.2', '0.1.1'), true);
  assert.equal(isNewer('0.10.0', '0.9.9'), true);
  assert.equal(isNewer('1.0.0', '0.9.9'), true);
  assert.equal(isNewer('0.1.1', '0.1.1'), false);
  assert.equal(isNewer('0.1.0', '0.1.1'), false);
});

test('releaseNotes sorts commit subjects and drops release bumps', () => {
  const { releaseNotes } = require('../dist/shared/version');
  assert.deepStrictEqual(releaseNotes(['feat: add tabs', 'fix(ui): stuck spinner', 'chore: release v1.2.3 [skip ci]', 'Tidy up']), {
    features: ['Add tabs'],
    fixes: ['Stuck spinner'],
    other: ['Tidy up'],
  });
});
