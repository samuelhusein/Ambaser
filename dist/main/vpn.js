"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.vpnRegistered = exports.onVpnChange = exports.vpnStatus = exports.vpnSupported = exports.WARP_TERMS = void 0;
exports.guardWebRtc = guardWebRtc;
exports.startVpn = startVpn;
exports.stopVpn = stopVpn;
// Built-in VPN for this app only: a Cloudflare WARP tunnel run by wireproxy, which offers it as a local
// SOCKS5 proxy. While it is on, everything is sent to that proxy and nowhere else, so a dropped tunnel
// stops traffic and never falls back to the normal connection. macOS only for now.
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const net = __importStar(require("net"));
const path = __importStar(require("path"));
const util_1 = require("util");
const vpn_1 = require("../shared/vpn");
const network_1 = require("./network");
const RELEASE = 'https://github.com/windtf/wireproxy/releases/download/v1.1.3';
// SHA-256 of that release's archives; anything else is refused.
const ARCHIVES = {
    arm64: { name: 'wireproxy_darwin_arm64.tar.gz', sha256: '28d34342c48c309b628d9c06ab4efc05b82fba49821f360605c02139c02547a5' },
    x64: { name: 'wireproxy_darwin_amd64.tar.gz', sha256: '5d89742a0f381d9508d3ad828a0d300dceee24fa49015427eaff42a23f7a50bd' },
};
const API = 'https://api.cloudflareclient.com/v0a2158';
exports.WARP_TERMS = 'https://www.cloudflare.com/application/terms/';
exports.vpnSupported = process.platform === 'darwin' && process.arch in ARCHIVES;
let status = 'off';
let child = null;
let port = 0;
let restarts = 0;
let run = 0; // bumped by every start and stop, so a slow older one gives up
let changed = () => { };
const folder = () => path.join(electron_1.app.getPath('userData'), 'vpn');
const binary = () => path.join(folder(), 'wireproxy-1.1.3');
const accountFile = () => path.join(folder(), 'warp.json');
// Its own session: setting up must work before the tunnel does, while everything else is already routed to it.
const setup = () => electron_1.session.fromPartition('vpn-setup');
const vpnStatus = () => status;
exports.vpnStatus = vpnStatus;
const onVpnChange = (listener) => void (changed = listener);
exports.onVpnChange = onVpnChange;
function setStatus(next) {
    status = next;
    changed();
}
// WebRTC would otherwise reach other people directly, showing them the real address.
function guardWebRtc(wc) {
    wc.setWebRTCIPHandlingPolicy(status === 'off' ? 'default' : 'disable_non_proxied_udp');
}
async function installBinary() {
    if (fs.existsSync(binary()))
        return;
    const archive = ARCHIVES[process.arch];
    const response = await setup().fetch(`${RELEASE}/${archive.name}`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok)
        throw new Error(`could not download the tunnel program (${response.status})`);
    const data = Buffer.from(await response.arrayBuffer());
    if ((0, crypto_1.createHash)('sha256').update(data).digest('hex') !== archive.sha256)
        throw new Error('the downloaded tunnel program does not match its checksum');
    const unpack = fs.mkdtempSync(path.join(folder(), 'unpack-'));
    try {
        fs.writeFileSync(path.join(unpack, archive.name), data);
        await (0, util_1.promisify)(child_process_1.execFile)('/usr/bin/tar', ['-xzf', path.join(unpack, archive.name), '-C', unpack, 'wireproxy']);
        fs.chmodSync(path.join(unpack, 'wireproxy'), 0o755);
        fs.renameSync(path.join(unpack, 'wireproxy'), binary());
    }
    finally {
        fs.rmSync(unpack, { recursive: true, force: true });
    }
}
function savedAccount() {
    try {
        return (0, vpn_1.parseAccount)(JSON.parse(fs.readFileSync(accountFile(), 'utf8')));
    }
    catch {
        return null;
    }
}
const vpnRegistered = () => savedAccount() !== null;
exports.vpnRegistered = vpnRegistered;
// An anonymous WARP account, made once. The caller must have had the user accept WARP_TERMS.
async function register() {
    const pair = (0, crypto_1.generateKeyPairSync)('x25519');
    const base64 = (value) => Buffer.from(value ?? '', 'base64url').toString('base64');
    const request = {
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
    if (!response.ok)
        throw new Error(`Cloudflare refused the registration (${response.status})`);
    const account = (0, vpn_1.parseRegistration)(await response.json(), base64(pair.privateKey.export({ format: 'jwk' }).d));
    if (!account)
        throw new Error('Cloudflare sent a registration this version cannot read');
    fs.writeFileSync(accountFile(), JSON.stringify(account), { mode: 0o600 });
    return account;
}
const freePort = () => new Promise((resolve, reject) => {
    const server = net.createServer().once('error', reject);
    server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        server.close(() => resolve(port));
    });
});
function killTunnel() {
    const old = child;
    child = null; // so its exit is not taken for a crash
    old?.kill();
}
process.on('exit', killTunnel); // also covers app.exit(), which skips the quit events
function launch(account, mine) {
    const config = path.join(folder(), 'tunnel.conf');
    fs.writeFileSync(config, (0, vpn_1.tunnelConfig)(account, port), { mode: 0o600 });
    const process_ = (0, child_process_1.spawn)(binary(), ['-s', '-c', config], { stdio: 'ignore' });
    child = process_;
    const ended = () => {
        if (child !== process_ || mine !== run)
            return;
        child = null;
        if (++restarts > 3)
            return setStatus('error');
        setTimeout(() => {
            if (mine === run)
                launch(account, mine);
        }, 2000);
    };
    process_.once('exit', ended);
    process_.once('error', ended);
}
// Asks Cloudflare, through the tunnel, whether this request really came through WARP.
async function reachable(through, mine) {
    const probe = electron_1.session.fromPartition('vpn-probe');
    await probe.setProxy({ mode: 'fixed_servers', proxyRules: through });
    for (const end = Date.now() + 20000; Date.now() < end && mine === run;) {
        try {
            const response = await probe.fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
            if (/^warp=(on|plus)$/m.test(await response.text()))
                return true;
        }
        catch {
            await probe.closeAllConnections(); // not up yet; try again
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
}
// Routes the app into the tunnel and brings it up. With `strict`, a failure leaves traffic blocked (the
// user had the VPN on); without it (first turn-on), a setup problem throws before anything is rerouted.
async function startVpn(reroute, strict) {
    const mine = ++run;
    restarts = 0;
    killTunnel();
    setStatus('connecting');
    try {
        port = port || (await freePort());
        const through = `socks5://127.0.0.1:${port}`;
        const route = async () => {
            (0, network_1.setVpnProxy)(through);
            electron_1.webContents.getAllWebContents().forEach(guardWebRtc);
            await reroute();
        };
        if (strict)
            await route();
        fs.mkdirSync(folder(), { recursive: true, mode: 0o700 });
        await installBinary();
        const account = savedAccount() ?? (await register());
        if (mine !== run)
            return;
        if (!strict)
            await route();
        launch(account, mine);
        const up = await reachable(through, mine);
        if (mine === run)
            setStatus(up ? 'on' : 'error');
    }
    catch (err) {
        if (mine === run)
            setStatus(strict ? 'error' : 'off');
        throw err;
    }
}
async function stopVpn(reroute) {
    run++;
    killTunnel();
    fs.rmSync(path.join(folder(), 'tunnel.conf'), { force: true });
    (0, network_1.setVpnProxy)(null);
    setStatus('off');
    electron_1.webContents.getAllWebContents().forEach(guardWebRtc);
    await reroute();
}
