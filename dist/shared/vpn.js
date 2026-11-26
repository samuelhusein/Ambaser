"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAccount = parseAccount;
exports.parseRegistration = parseRegistration;
exports.tunnelConfig = tunnelConfig;
const KEY = /^[A-Za-z0-9+/]{43}=$/;
const ENDPOINT = /^[a-z0-9.-]+:\d{1,5}$/i;
const V4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const V6 = /^[0-9a-f:]+$/i;
// Strict on purpose: these end up as lines of a config file, and the source is a server or a file on disk.
function parseAccount(input) {
    const raw = (input ?? {});
    const field = (name, pattern) => {
        const value = raw[name];
        return typeof value === 'string' && pattern.test(value) ? value : null;
    };
    const privateKey = field('privateKey', KEY);
    const peerKey = field('peerKey', KEY);
    const endpoint = field('endpoint', ENDPOINT);
    const v4 = field('v4', V4);
    const v6 = field('v6', V6);
    return privateKey && peerKey && endpoint && v4 && v6 ? { privateKey, peerKey, endpoint, v4, v6 } : null;
}
function parseRegistration(body, privateKey) {
    const root = body;
    const config = (root?.result?.config ?? root?.config);
    const peer = config?.peers?.[0];
    const addresses = config?.interface?.addresses;
    return parseAccount({ privateKey, peerKey: peer?.public_key, endpoint: peer?.endpoint?.host, v4: addresses?.v4, v6: addresses?.v6 });
}
function tunnelConfig(account, port) {
    return [
        '[Interface]',
        `PrivateKey = ${account.privateKey}`,
        `Address = ${account.v4}/32, ${account.v6}/128`,
        'DNS = 1.1.1.1, 1.0.0.1',
        'MTU = 1280',
        '[Peer]',
        `PublicKey = ${account.peerKey}`,
        `Endpoint = ${account.endpoint}`,
        'AllowedIPs = 0.0.0.0/0, ::/0',
        'PersistentKeepalive = 25',
        '[Socks5]',
        `BindAddress = 127.0.0.1:${port}`,
        '',
    ].join('\n');
}
