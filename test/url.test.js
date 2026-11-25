// Run with: npm test (builds first). Covers the address-bar and scheme rules that guard navigation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedUrl, normalizeInput } = require('../dist/shared/url');

test('allows http, https, about:blank and our own pages only', () => {
  assert.equal(isAllowedUrl('https://example.com/a'), true);
  assert.equal(isAllowedUrl('http://10.243.210.86/'), true);
  assert.equal(isAllowedUrl('about:blank'), true);
  assert.equal(isAllowedUrl('mybrowser://home/'), true);
  assert.equal(isAllowedUrl('file:///C:/secret.txt'), false);
  assert.equal(isAllowedUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedUrl('data:text/html,hi'), false);
  assert.equal(isAllowedUrl('not a url'), false);
});

test('normalizeInput adds https to bare hosts', () => {
  assert.equal(normalizeInput('example.com'), 'https://example.com/');
  assert.equal(normalizeInput('  localhost:3000  '), 'https://localhost:3000/');
});

test('normalizeInput keeps explicit allowed schemes', () => {
  assert.equal(normalizeInput('http://10.243.210.86'), 'http://10.243.210.86/');
  assert.equal(normalizeInput('about:blank'), 'about:blank');
});

test('normalizeInput searches Google for anything that is not an address', () => {
  const search = 'https://www.google.com/search?q=';
  assert.equal(normalizeInput('kucing'), `${search}kucing`);
  assert.equal(normalizeInput('  resep nasi goreng '), `${search}resep%20nasi%20goreng`);
  assert.equal(normalizeInput('c++ & c#'), `${search}c%2B%2B%20%26%20c%23`);
  assert.equal(normalizeInput('apa itu node.js'), `${search}apa%20itu%20node.js`);
  assert.equal(normalizeInput('example.com/path?q=1'), 'https://example.com/path?q=1');
  assert.equal(normalizeInput('myserver:8080'), 'https://myserver:8080/');
});

test('normalizeInput rejects empty and blocked input', () => {
  assert.equal(normalizeInput(''), null);
  assert.equal(normalizeInput('   '), null);
  assert.equal(normalizeInput('file:///C:/secret.txt'), null);
  assert.equal(normalizeInput('mybrowser://cert-error/'), null); // our pages cannot be typed
  assert.equal(normalizeInput('javascript:alert(1)'), null);
});

test('unreadCount reads the number a site puts before its title', () => {
  const { unreadCount, withoutUnread } = require('../dist/shared/url');
  assert.equal(unreadCount('(2) WhatsApp'), 2);
  assert.equal(unreadCount('(99+) Inbox'), 99);
  assert.equal(unreadCount('WhatsApp'), 0);
  assert.equal(unreadCount('Film (2024)'), 0);
  assert.equal(withoutUnread('(2) WhatsApp'), 'WhatsApp');
});

test('displayUrl shows the failed address for error pages only', () => {
  const { displayUrl, loadErrorUrl, certErrorUrl } = require('../dist/shared/url');
  const target = 'https://nope.invalid/a?b=1&c=2';
  assert.equal(displayUrl(loadErrorUrl(target, -105, 'ERR_NAME_NOT_RESOLVED')), target);
  assert.equal(displayUrl(certErrorUrl(target, -202)), target);
  assert.equal(displayUrl('https://example.com/?url=x'), 'https://example.com/?url=x');
});
