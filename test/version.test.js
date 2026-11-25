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
