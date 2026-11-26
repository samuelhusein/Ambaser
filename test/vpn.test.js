const test = require('node:test');
const assert = require('node:assert');
const { parseRegistration, tunnelConfig } = require('../dist/shared/vpn');

const key = `${'A'.repeat(43)}=`;
const body = (host) => ({ config: { peers: [{ public_key: key, endpoint: { host } }], interface: { addresses: { v4: '172.16.0.2', v6: '2606:4700:110:8a36::1' } } } });

test('parseRegistration reads a WARP answer', () => {
  const account = parseRegistration(body('engage.cloudflareclient.com:2408'), key);
  assert.strictEqual(account.endpoint, 'engage.cloudflareclient.com:2408');
  assert.match(tunnelConfig(account, 1234), /BindAddress = 127\.0\.0\.1:1234/);
});

test('parseRegistration refuses values that would add config lines', () => {
  assert.strictEqual(parseRegistration(body('a.com:1\n[Socks5]'), key), null);
  assert.strictEqual(parseRegistration({}, key), null);
});
