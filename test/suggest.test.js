const test = require('node:test');
const assert = require('node:assert/strict');
const { addVisit, searchHistory, suggestQuery, parseSuggestions } = require('../dist/shared/suggest');

test('addVisit keeps newest first, deduplicated, web pages only', () => {
  let list = addVisit([], 'https://a.com/', 'A');
  list = addVisit(list, 'https://b.com/', 'B');
  list = addVisit(list, 'https://a.com/', 'A again');
  list = addVisit(list, 'about:blank', '');
  assert.deepEqual(list.map((e) => e.title), ['A again', 'B']);
});

test('searchHistory matches all words in title or url', () => {
  const list = [{ url: 'https://youtube.com/', title: 'YouTube' }, { url: 'https://a.com/kucing', title: 'Foto lucu' }];
  assert.equal(searchHistory(list, 'you')[0].title, 'YouTube');
  assert.equal(searchHistory(list, 'lucu KUCING')[0].title, 'Foto lucu');
  assert.equal(searchHistory(list, 'anjing').length, 0);
  assert.equal(searchHistory(list, '').length, 2);
});

test('suggestQuery never sends addresses to Google', () => {
  assert.equal(suggestQuery(' resep nasi '), 'resep nasi');
  for (const input of ['', 'example.com/secret?token=1', 'http://10.0.0.1', 'localhost:3000', 'file:///etc/passwd']) {
    assert.equal(suggestQuery(input), null, input);
  }
});

test('parseSuggestions tolerates bad responses', () => {
  assert.deepEqual(parseSuggestions(['ku', ['kucing', 5, 'kuda']]), ['kucing', 'kuda']);
  assert.deepEqual(parseSuggestions({ error: 1 }), []);
});
