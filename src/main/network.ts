// Applies the proxy and DNS settings. They affect this app only, not the computer's own settings.
import { app, session } from 'electron';
import type { NetworkSettings } from '../shared/types';

// The default session serves the app's own requests (search suggestions); tabs use named partitions.
export async function applyProxy(settings: NetworkSettings, partitions: string[]): Promise<void> {
  const config: Electron.ProxyConfig =
    settings.proxyMode === 'manual' ? { mode: 'fixed_servers', proxyRules: settings.proxyServer, proxyBypassRules: settings.proxyBypass } : { mode: settings.proxyMode };
  await Promise.all(
    [session.defaultSession, ...partitions.map((p) => session.fromPartition(p))].map(async (ses) => {
      await ses.setProxy(config);
      await ses.closeAllConnections(); // so open connections do not keep using the old route
    }),
  );
}

// "automatic" falls back to the system DNS if the secure server fails, so internal names keep working.
export function applyDns(settings: NetworkSettings): void {
  const server = settings.dnsMode === 'custom' ? settings.dnsUrl : 'https://1.1.1.1/dns-query';
  app.configureHostResolver(settings.dnsMode === 'system' ? { secureDnsMode: 'off' } : { secureDnsMode: 'automatic', secureDnsServers: [server] });
}
