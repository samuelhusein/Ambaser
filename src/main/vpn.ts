// Built-in VPN for this app only: a Cloudflare WARP tunnel run by wireproxy, which offers it as a local
// SOCKS5 proxy. While it is on, everything is sent to that proxy and nowhere else, so a dropped tunnel
// stops traffic and never falls back to the normal connection. macOS and Windows x64.
import { app, session, webContents, WebContents } from 'electron';
import { ChildProcess, execFile, spawn } from 'child_process';
import { createHash, generateKeyPairSync } from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { promisify } from 'util';
import { parseAccount, parseRegistration, tunnelConfig, WarpAccount } from '../shared/vpn';
import type { VpnStatus } from '../shared/types';
import { setVpnProxy } from './network';

const RELEASE = 'https://github.com/windtf/wireproxy/releases/download/v1.1.3';
// SHA-256 of that release's archives; anything else is refused.
const ARCHIVES: Record<string, { name: string; sha256: string }> = {
  'darwin-arm64': { name: 'wireproxy_darwin_arm64.tar.gz', sha256: '28d34342c48c309b628d9c06ab4efc05b82fba49821f360605c02139c02547a5' },
  'darwin-x64': { name: 'wireproxy_darwin_amd64.tar.gz', sha256: '5d89742a0f381d9508d3ad828a0d300dceee24fa49015427eaff42a23f7a50bd' },
  'win32-x64': { name: 'wireproxy_windows_amd64.tar.gz', sha256: 'bce041ea9fe0f8a3351301dcbe29cdf6a523bb25cf9c62f17ebb5699a8051d0f' },
};
const TARGET = `${process.platform}-${process.arch}`;
const EXE = process.platform === 'win32' ? '.exe' : '';
// Windows by full path: a GNU tar earlier on PATH would read "C:\..." as a remote host.
const TAR = process.platform === 'win32' ? `${process.env.SystemRoot}\\System32\\tar.exe` : '/usr/bin/tar';
const API = 'https://api.cloudflareclient.com/v0a2158';
export const WARP_TERMS = 'https://www.cloudflare.com/application/terms/';
export const vpnSupported = TARGET in ARCHIVES;

let status: VpnStatus = 'off';
let child: ChildProcess | null = null;
let port = 0;
let restarts = 0;
let run = 0; // bumped by every start and stop, so a slow older one gives up
let changed: () => void = () => {};

const folder = (): string => path.join(app.getPath('userData'), 'vpn');
const binary = (): string => path.join(folder(), `wireproxy-1.1.3${EXE}`);
const accountFile = (): string => path.join(folder(), 'warp.json');
// Its own session: setting up must work before the tunnel does, while everything else is already routed to it.
const setup = (): Electron.Session => session.fromPartition('vpn-setup');

export const vpnStatus = (): VpnStatus => status;
export const onVpnChange = (listener: () => void): void => void (changed = listener);

function setStatus(next: VpnStatus): void {
  status = next;
  changed();
}

// WebRTC would otherwise reach other people directly, showing them the real address.
export function guardWebRtc(wc: WebContents): void {
  wc.setWebRTCIPHandlingPolicy(status === 'off' ? 'default' : 'disable_non_proxied_udp');
}

async function installBinary(): Promise<void> {
  if (fs.existsSync(binary())) return;
  const archive = ARCHIVES[TARGET];
  const response = await setup().fetch(`${RELEASE}/${archive.name}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`could not download the tunnel program (${response.status})`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== archive.sha256) throw new Error('the downloaded tunnel program does not match its checksum');
  const unpack = fs.mkdtempSync(path.join(folder(), 'unpack-'));
  try {
    fs.writeFileSync(path.join(unpack, archive.name), data);
    await promisify(execFile)(TAR, ['-xzf', path.join(unpack, archive.name), '-C', unpack, `wireproxy${EXE}`], { windowsHide: true });
    fs.chmodSync(path.join(unpack, `wireproxy${EXE}`), 0o755);
    fs.renameSync(path.join(unpack, `wireproxy${EXE}`), binary());
  } finally {
    fs.rmSync(unpack, { recursive: true, force: true });
  }
}

function savedAccount(): WarpAccount | null {
  try {
    return parseAccount(JSON.parse(fs.readFileSync(accountFile(), 'utf8')));
  } catch {
    return null;
  }
}

export const vpnRegistered = (): boolean => savedAccount() !== null;

// An anonymous WARP account, made once. The caller must have had the user accept WARP_TERMS.
async function register(): Promise<WarpAccount> {
  const pair = generateKeyPairSync('x25519');
  const base64 = (value: string | undefined): string => Buffer.from(value ?? '', 'base64url').toString('base64');
  const request: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Client-Version': 'a-6.11-2223' },
    body: JSON.stringify({ key: base64(pair.publicKey.export({ format: 'jwk' }).x), install_id: '', fcm_token: '', tos: new Date().toISOString(), model: 'PC', type: 'Android', locale: 'en_US' }),
    signal: AbortSignal.timeout(20000),
  };
  const response = await setup()
    .fetch(`${API}/reg`, request)
    .catch(() => {
      throw new Error('Cloudflare could not be reached. This network may be blocking WARP; try once on another network.');
    });
  if (!response.ok) throw new Error(`Cloudflare refused the registration (${response.status})`);
  const account = parseRegistration(await response.json(), base64(pair.privateKey.export({ format: 'jwk' }).d));
  if (!account) throw new Error('Cloudflare sent a registration this version cannot read');
  fs.writeFileSync(accountFile(), JSON.stringify(account), { mode: 0o600 });
  return account;
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer().once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });

function killTunnel(): void {
  const old = child;
  child = null; // so its exit is not taken for a crash
  old?.kill();
}
process.on('exit', killTunnel); // also covers app.exit(), which skips the quit events

function launch(account: WarpAccount, mine: number): void {
  const config = path.join(folder(), 'tunnel.conf');
  fs.writeFileSync(config, tunnelConfig(account, port), { mode: 0o600 });
  const process_ = spawn(binary(), ['-s', '-c', config], { stdio: 'ignore', windowsHide: true });
  child = process_;
  const ended = (): void => {
    if (child !== process_ || mine !== run) return;
    child = null;
    if (++restarts > 3) return setStatus('error');
    setTimeout(() => {
      if (mine === run) launch(account, mine);
    }, 2000);
  };
  process_.once('exit', ended);
  process_.once('error', ended);
}

// Asks Cloudflare, through the tunnel, whether this request really came through WARP.
async function reachable(through: string, mine: number): Promise<boolean> {
  const probe = session.fromPartition('vpn-probe');
  await probe.setProxy({ mode: 'fixed_servers', proxyRules: through });
  for (const end = Date.now() + 20000; Date.now() < end && mine === run; ) {
    try {
      const response = await probe.fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (/^warp=(on|plus)$/m.test(await response.text())) return true;
    } catch {
      await probe.closeAllConnections(); // not up yet; try again
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// Routes the app into the tunnel and brings it up. With `strict`, a failure leaves traffic blocked (the
// user had the VPN on); without it (first turn-on), a setup problem throws before anything is rerouted.
export async function startVpn(reroute: () => Promise<void>, strict: boolean): Promise<void> {
  const mine = ++run;
  restarts = 0;
  killTunnel();
  setStatus('connecting');
  try {
    port = port || (await freePort());
    const through = `socks5://127.0.0.1:${port}`;
    const route = async (): Promise<void> => {
      setVpnProxy(through);
      webContents.getAllWebContents().forEach(guardWebRtc);
      await reroute();
    };
    if (strict) await route();
    fs.mkdirSync(folder(), { recursive: true, mode: 0o700 });
    await installBinary();
    const account = savedAccount() ?? (await register());
    if (mine !== run) return;
    if (!strict) await route();
    launch(account, mine);
    const up = await reachable(through, mine);
    if (mine === run) setStatus(up ? 'on' : 'error');
  } catch (err) {
    if (mine === run) setStatus(strict ? 'error' : 'off');
    throw err;
  }
}

export async function stopVpn(reroute: () => Promise<void>): Promise<void> {
  run++;
  killTunnel();
  fs.rmSync(path.join(folder(), 'tunnel.conf'), { force: true });
  setVpnProxy(null);
  setStatus('off');
  webContents.getAllWebContents().forEach(guardWebRtc);
  await reroute();
}
