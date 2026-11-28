// Validation for the proxy and DNS settings. No Electron imports so it can be unit tested.
import type { NetworkSettings } from './types';

export const DEFAULT_NETWORK: NetworkSettings = {
  proxyMode: 'system',
  proxyServer: '',
  proxyBypass: '',
  dnsMode: 'system',
  dnsUrl: '',
};

// "host:port", optionally with http://, https://, socks4:// or socks5://. No user names or paths.
const PROXY_SERVER = /^((https?|socks[45]):\/\/)?([a-z0-9.-]+|\[[0-9a-f:.]+\]):(\d{1,5})\/?$/i;

// Returns the cleaned settings, or a message saying what is wrong.
export function parseNetwork(input: unknown): NetworkSettings | string {
  if (typeof input !== 'object' || input === null) return 'Invalid settings.';
  const raw = input as Record<string, unknown>;
  const text = (key: string): string => (typeof raw[key] === 'string' ? (raw[key] as string).trim() : '');
  const proxyMode = text('proxyMode');
  const dnsMode = text('dnsMode');
  if (proxyMode !== 'system' && proxyMode !== 'direct' && proxyMode !== 'manual') return 'Choose a proxy option.';
  if (dnsMode !== 'system' && dnsMode !== 'cloudflare' && dnsMode !== 'custom') return 'Choose a DNS option.';

  const proxyServer = text('proxyServer').replace(/\/$/, '');
  if (proxyMode === 'manual') {
    const port = Number(PROXY_SERVER.exec(proxyServer)?.[4]);
    if (!(port >= 1 && port <= 65535)) return 'Proxy server must look like host:port, http://host:port or socks5://host:port.';
  }
  const proxyBypass = text('proxyBypass').split(/[\s,;]+/).filter(Boolean).join(', ');
  const dnsUrl = text('dnsUrl');
  if (dnsMode === 'custom' && !(/^https:\/\//i.test(dnsUrl) && URL.canParse(dnsUrl))) return 'DNS server must be a DNS-over-HTTPS address starting with https://';
  return { proxyMode, proxyServer, proxyBypass, dnsMode, dnsUrl };
}
