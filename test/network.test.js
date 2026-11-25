const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNetwork, DEFAULT_NETWORK } = require('../dist/shared/network');

const manual = (proxyServer) => parseNetwork({ ...DEFAULT_NETWORK, proxyMode: 'manual', proxyServer });

test('accepts usual proxy addresses', () => {
  for (const server of ['127.0.0.1:8080', 'http://proxy.local:3128/', 'socks5://[::1]:1080']) {
    assert.equal(typeof manual(server), 'object', server);
  }
});

test('rejects bad proxy addresses and DNS addresses', () => {
  for (const server of ['', 'proxy.local', 'host:0', 'host:70000', 'ftp://host:1', 'http://user:pw@host:80', 'a:1;b:2']) {
    assert.equal(typeof manual(server), 'string', server);
  }
  assert.equal(typeof parseNetwork({ ...DEFAULT_NETWORK, dnsMode: 'custom', dnsUrl: '8.8.8.8' }), 'string');
  assert.equal(typeof parseNetwork(null), 'string');
});

test('tidies the bypass list', () => {
  assert.equal(parseNetwork({ ...DEFAULT_NETWORK, proxyBypass: ' *.local;10.0.0.1\n x.com ' }).proxyBypass, '*.local, 10.0.0.1, x.com');
});
