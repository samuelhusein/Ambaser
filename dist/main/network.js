"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setVpnProxy = void 0;
exports.applyProxy = applyProxy;
exports.applyDns = applyDns;
// Applies the proxy and DNS settings. They affect this app only, not the computer's own settings.
const electron_1 = require("electron");
let vpnProxy = null; // while set, it replaces the proxy settings, with no direct fallback
const setVpnProxy = (rules) => void (vpnProxy = rules);
exports.setVpnProxy = setVpnProxy;
// The default session serves the app's own requests (search suggestions); tabs use named partitions.
async function applyProxy(settings, partitions) {
    const config = vpnProxy
        ? { mode: 'fixed_servers', proxyRules: vpnProxy }
        : settings.proxyMode === 'manual'
            ? { mode: 'fixed_servers', proxyRules: settings.proxyServer, proxyBypassRules: settings.proxyBypass }
            : { mode: settings.proxyMode };
    await Promise.all([electron_1.session.defaultSession, ...partitions.map((p) => electron_1.session.fromPartition(p))].map(async (ses) => {
        await ses.setProxy(config);
        await ses.closeAllConnections(); // so open connections do not keep using the old route
    }));
}
// "automatic" falls back to the system DNS if the secure server fails, so internal names keep working.
function applyDns(settings) {
    const server = settings.dnsMode === 'custom' ? settings.dnsUrl : 'https://1.1.1.1/dns-query';
    electron_1.app.configureHostResolver(settings.dnsMode === 'system' ? { secureDnsMode: 'off' } : { secureDnsMode: 'automatic', secureDnsServers: [server] });
}
