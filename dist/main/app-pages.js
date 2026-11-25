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
exports.registerScheme = registerScheme;
exports.isTrusted = isTrusted;
exports.hasAcceptedCertificate = hasAcceptedCertificate;
exports.forgetCertificate = forgetCertificate;
exports.forgetCertificates = forgetCertificates;
exports.runPageAction = runPageAction;
exports.registerPages = registerPages;
// The bundled home and certificate-warning pages, served on our own mybrowser: protocol.
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const url_1 = require("../shared/url");
const history_1 = require("./history");
const store_1 = require("./store");
const CONTENT_TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
// Bad certificates the user accepted: host -> fingerprint, so a different certificate warns again.
// Kept on disk for normal windows, in memory for incognito ones.
const temporary = new Map();
// The last certificate each session refused per host: what "Proceed anyway" accepts.
const refused = new WeakMap();
// Must run before app is ready.
function registerScheme() {
    electron_1.protocol.registerSchemesAsPrivileged([{ scheme: 'mybrowser', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}
function isTrusted(ses, url, fingerprint) {
    if (!URL.canParse(url))
        return false;
    const { host } = new URL(url);
    const accepted = ses.isPersistent() ? store_1.store.certificate(host) : temporary.get(ses)?.get(host);
    if (accepted === fingerprint)
        return true;
    const seen = refused.get(ses) ?? new Map();
    refused.set(ses, seen.set(host, fingerprint));
    return false;
}
function trust(ses, host) {
    const fingerprint = refused.get(ses)?.get(host);
    if (!fingerprint)
        return;
    if (ses.isPersistent())
        store_1.store.setCertificate(host, fingerprint);
    else
        temporary.set(ses, (temporary.get(ses) ?? new Map()).set(host, fingerprint));
}
function hasAcceptedCertificate(ses, host) {
    return (ses.isPersistent() ? store_1.store.certificate(host) : temporary.get(ses)?.get(host)) !== undefined;
}
function forgetCertificate(ses, host) {
    if (ses.isPersistent())
        store_1.store.removeCertificate(host);
    else
        temporary.get(ses)?.delete(host);
}
function forgetCertificates() {
    temporary.clear();
    store_1.store.clearCertificates();
}
// No file path ever comes from the request: only plain names inside the page's own folder.
function serveFile(folder, pathname) {
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!/^[a-z0-9-]+\.(html|css|js)$/i.test(file))
        return new Response('Not found', { status: 404 });
    try {
        return new Response(fs.readFileSync(path.join(__dirname, '..', folder, file)), {
            headers: { 'Content-Type': CONTENT_TYPES[file.split('.').pop() ?? ''] },
        });
    }
    catch {
        return new Response('Not found', { status: 404 });
    }
}
// Read-only: any website can send requests here, so nothing served by the protocol changes anything.
function handle(request, incognito) {
    const url = new URL(request.url);
    if (request.method !== 'GET' || !['home', url_1.CERT_ERROR_HOST, url_1.LOAD_ERROR_HOST].includes(url.hostname))
        return new Response('Not found', { status: 404 });
    if (url.hostname === 'home' && url.pathname === '/api/data') {
        // An incognito home page shows the pinned sites only, nothing about past browsing.
        // A page without a saved icon borrows one from another page of the same site.
        const known = new Map();
        for (const e of [...store_1.store.pinned(), ...(incognito ? [] : (0, history_1.allHistory)())])
            if (e.favicon && URL.canParse(e.url))
                known.set(new URL(e.url).host, e.favicon);
        const withIcon = (e) => ({ ...e, favicon: e.favicon || (URL.canParse(e.url) ? known.get(new URL(e.url).host) : undefined) });
        return Response.json({ incognito, theme: store_1.store.appearance().theme, pinned: store_1.store.pinned().map(withIcon), recent: incognito ? [] : (0, history_1.allHistory)().slice(0, 6).map(withIcon) });
    }
    return serveFile(url.hostname, url.pathname);
}
// What our pages can change is asked for by navigating to an action URL. Call this only for navigations
// the page itself started (will-navigate): it checks which of our pages the tab is on.
function runPageAction(wc, target) {
    if (!URL.canParse(target))
        return false;
    const from = wc.getURL();
    const action = new URL(target);
    const url = action.searchParams.get('url') ?? '';
    if (action.href.startsWith('mybrowser://home/unpin') && from.startsWith('mybrowser://home/')) {
        store_1.store.unpin(url);
        wc.reload();
        return true;
    }
    if (action.href.startsWith('mybrowser://home/open') && from.startsWith('mybrowser://home/')) {
        const target = (0, url_1.normalizeInput)(action.searchParams.get('q') ?? '');
        if (target)
            wc.loadURL(target).catch((err) => console.error(`loadURL ${target}: ${err.message}`));
        return true;
    }
    if (action.href.startsWith(`mybrowser://${url_1.CERT_ERROR_HOST}/trust`) && from.startsWith(`mybrowser://${url_1.CERT_ERROR_HOST}/`)) {
        if (/^https:/i.test(url) && URL.canParse(url)) {
            trust(wc.session, new URL(url).host);
            wc.loadURL(url).catch((err) => console.error(`loadURL ${url}: ${err.message}`));
        }
        return true;
    }
    return false;
}
// protocol.handle only covers the default session, so each tab partition needs its own registration.
const registered = new Set();
function registerPages(partition) {
    if (registered.has(partition))
        return;
    registered.add(partition);
    const ses = electron_1.session.fromPartition(partition);
    ses.protocol.handle('mybrowser', (request) => handle(request, !partition.startsWith('persist:')));
}
