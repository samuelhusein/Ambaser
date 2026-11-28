const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMedia } = require('../dist/shared/media');

test('parseMedia keeps a well-formed report', () => {
  const media = parseMedia({ title: 'Love and Shine', artist: 'Someone', artwork: 'https://i.example/a.jpg', playing: true, duration: 200, time: 90, canPrevious: true, canNext: true, canPip: false });
  assert.deepEqual(media, { title: 'Love and Shine', artist: 'Someone', artwork: 'https://i.example/a.jpg', playing: true, duration: 200, time: 90, canPrevious: true, canNext: true, canPip: false });
});

test('parseMedia rejects junk and unsafe artwork', () => {
  assert.equal(parseMedia(null), null);
  assert.equal(parseMedia('x'), null);
  const media = parseMedia({ title: 5, artwork: 'javascript:alert(1)', playing: 'yes', duration: Infinity, time: 50, canNext: 1 });
  assert.equal(media.title, '');
  assert.equal(media.artwork, '');
  assert.equal(media.playing, false);
  assert.equal(media.duration, 0);
  assert.equal(media.time, 0); // never past the end
  assert.equal(media.canNext, false);
  assert.equal(parseMedia({ title: 'a'.repeat(1000) }).title.length, 300);
});
