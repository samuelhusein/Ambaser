"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyProxy = applyProxy;
exports.applyDns = applyDns;
// Applies the proxy and DNS settings. They affect this app only, not the computer's own settings.
const electron_1 = require("electron");
// The default session serves the app's own requests (search suggestions); tabs use named partitions.
async function applyProxy(settings, partitions) {
    const config = settings.proxyMode === 'manual'
        ? { mode: 'fixed_servers', proxyRules: settings.proxyServer, proxyBypassRules: settings.proxyBypass }
        : { mode: settings.proxyMode };
    for (const ses of [electron_1.session.defaultSession, ...partitions.map((p) => electron_1.session.fromPartition(p))]) {
        await ses.setProxy(config);
        await ses.closeAllConnections(); // so open connections do not keep using the old route
    }
}
// "automatic" falls back to the system DNS if the secure server fails, so internal names keep working.
function applyDns(settings) {
    const server = settings.dnsMode === 'custom' ? settings.dnsUrl : 'https://1.1.1.1/dns-query';
    electron_1.app.configureHostResolver(settings.dnsMode === 'system' ? { secureDnsMode: 'off' } : { secureDnsMode: 'automatic', secureDnsServers: [server] });
}
