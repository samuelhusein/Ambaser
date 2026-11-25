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
exports.runPageAction = runPageAction;
exports.registerPages = registerPages;
// The bundled home and certificate-warning pages, served on our own mybrowser: protocol.
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const url_1 = require("../shared/url");
const store_1 = require("./store");
const CONTENT_TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
// Hosts the user chose to trust despite a bad certificate: per session, in memory only.
const trustedHosts = new Map();
// Must run before app is ready.
function registerScheme() {
    electron_1.protocol.registerSchemesAsPrivileged([{ scheme: 'mybrowser', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}
function isTrusted(ses, url) {
    try {
        return trustedHosts.get(ses)?.has(new URL(url).host) ?? false;
    }
    catch {
        return false;
    }
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
function handle(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET' || !['home', url_1.CERT_ERROR_HOST, url_1.LOAD_ERROR_HOST].includes(url.hostname))
        return new Response('Not found', { status: 404 });
    if (url.hostname === 'home' && url.pathname === '/api/data')
        return Response.json({ pinned: store_1.store.pinned(), lastSession: store_1.store.lastSession() });
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
    if (action.href.startsWith(`mybrowser://${url_1.CERT_ERROR_HOST}/trust`) && from.startsWith(`mybrowser://${url_1.CERT_ERROR_HOST}/`)) {
        if (/^https:/i.test(url) && URL.canParse(url)) {
            trustedHosts.get(wc.session)?.add(new URL(url).host);
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
    trustedHosts.set(ses, new Set());
    ses.protocol.handle('mybrowser', handle);
}
