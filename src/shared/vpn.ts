// Reading a Cloudflare WARP registration and writing the tunnel config. No Electron imports so it can be unit tested.
export interface WarpAccount {
  privateKey: string;
  peerKey: string;
  endpoint: string;
  v4: string;
  v6: string;
}

const KEY = /^[A-Za-z0-9+/]{43}=$/;
const ENDPOINT = /^[a-z0-9.-]+:\d{1,5}$/i;
const V4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const V6 = /^[0-9a-f:]+$/i;

// Strict on purpose: these end up as lines of a config file, and the source is a server or a file on disk.
export function parseAccount(input: unknown): WarpAccount | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  const field = (name: keyof WarpAccount, pattern: RegExp): string | null => {
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

export function parseRegistration(body: unknown, privateKey: string): WarpAccount | null {
  const root = body as { result?: unknown; config?: unknown } | null;
  const config = ((root?.result as { config?: unknown } | undefined)?.config ?? root?.config) as
    | { peers?: { public_key?: unknown; endpoint?: { host?: unknown } }[]; interface?: { addresses?: { v4?: unknown; v6?: unknown } } }
    | undefined;
  const peer = config?.peers?.[0];
  const addresses = config?.interface?.addresses;
  return parseAccount({ privateKey, peerKey: peer?.public_key, endpoint: peer?.endpoint?.host, v4: addresses?.v4, v6: addresses?.v6 });
}

export function tunnelConfig(account: WarpAccount, port: number): string {
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
