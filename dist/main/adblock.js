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
exports.watchAdblock = watchAdblock;
exports.applyAdblock = applyAdblock;
exports.loadAdblock = loadAdblock;
// Built-in ad and tracker blocking, using Ghostery's engine with the EasyList family of filter lists and a pop-up ad list.
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const adblocker_electron_1 = require("@ghostery/adblocker-electron");
const store_1 = require("./store");
// The EasyList family misses many pop-up and overlay ad networks, which move between throwaway domains.
const LISTS = [...adblocker_electron_1.adsAndTrackingLists, 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/popupads.txt'];
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // older filter lists are downloaded again at the next start
const sessions = new Set();
let blocker = null;
function apply(ses) {
    if (!blocker || store_1.store.adblock() === blocker.isBlockingEnabled(ses))
        return;
    if (!store_1.store.adblock())
        return blocker.disableBlockingInSession(ses);
    // The library registers these app-wide once per session, and Electron refuses a second handler.
    electron_1.ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters');
    electron_1.ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled');
    blocker.enableBlockingInSession(ses);
}
// The library fires all of a page's scripts at once and handles no failure: on YouTube that is dozens of
// load listeners and a stream of unhandled rejections. Run them one by one and drop the ones that fail.
// Each gets its own scope too: run bare, their helpers become page globals that collide with each other
// and with the site's own names (YouTube lost its icons and logo).
function queueScripts(engine) {
    const inject = engine.onInjectCosmeticFilters;
    engine.onInjectCosmeticFilters = (event, url, msg) => {
        let queue = Promise.resolve();
        const sender = {
            insertCSS: (css, options) => event.sender.insertCSS(css, options).catch(() => { }),
            executeJavaScript: (code, gesture) => {
                queue = queue.then(() => event.sender.executeJavaScript(`(() => {\n${code}\n})()`, gesture)).catch(() => { });
            },
        };
        return inject({ frameId: event.frameId, processId: event.processId, sender }, url, msg);
    };
}
function watchAdblock(partition) {
    const ses = electron_1.session.fromPartition(partition);
    sessions.add(ses);
    apply(ses);
}
function applyAdblock() {
    sessions.forEach(apply);
}
async function loadAdblock(partition) {
    // A new name when LISTS changes, or the copy built from the old lists stays in use until it is stale.
    const file = path.join(electron_1.app.getPath('userData'), 'adblock-engine-2.bin');
    const load = (maxAge) => 
    // Fetched through the web session, so the proxy setting applies.
    adblocker_electron_1.ElectronBlocker.fromLists((url) => electron_1.session.fromPartition(partition).fetch(url), LISTS, {}, {
        path: file,
        read: async (p) => {
            if (Date.now() - (await fs.promises.stat(p)).mtimeMs > maxAge)
                throw new Error('stale');
            return fs.promises.readFile(p);
        },
        write: fs.promises.writeFile,
    });
    try {
        // Without a connection, an old copy is better than none.
        blocker = await load(MAX_AGE_MS).catch(() => load(Infinity));
        queueScripts(blocker);
        applyAdblock();
        void fs.promises.rm(path.join(electron_1.app.getPath('userData'), 'adblock-engine.bin'), { force: true });
    }
    catch (err) {
        console.error(`adblock: ${err.message}`);
    }
}
