const test = require('node:test');
const assert = require('node:assert/strict');
const { isHarmless, question, kindsOf, secureOrigin } = require('../dist/shared/permissions');

test('only known permissions are harmless or asked about', () => {
  assert.equal(isHarmless('fullscreen'), true);
  assert.equal(isHarmless('geolocation'), false);
  assert.equal(isHarmless('persistent-storage'), true);
  assert.equal(isHarmless('background-sync'), true);
  assert.ok(question('notifications'));
  assert.equal(question('usb'), undefined);
  assert.equal(question('constructor'), undefined);
});

test('media is split into camera and microphone', () => {
  assert.deepEqual(kindsOf('media', ['video', 'audio']), ['camera', 'microphone']);
  assert.deepEqual(kindsOf('media', []), []);
  assert.deepEqual(kindsOf('geolocation'), ['geolocation']);
});

test('insecure pages get nothing', () => {
  assert.equal(secureOrigin('https://a.com/x'), 'https://a.com');
  assert.equal(secureOrigin('http://localhost:3000/'), 'http://localhost:3000');
  assert.equal(secureOrigin('http://a.com/'), null);
  assert.equal(secureOrigin('mybrowser://home/'), null);
  assert.equal(secureOrigin(''), null);
});
