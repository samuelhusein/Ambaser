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
exports.store = exports.BAR_LIMIT = void 0;
exports.loadStore = loadStore;
// Pinned sites and the last session's tabs, mirrored to a JSON file in the app's userData folder.
// History lives in history.ts.
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const appearance_1 = require("../shared/appearance");
const network_1 = require("../shared/network");
exports.BAR_LIMIT = 8;
const barCount = () => data.pinned.filter((s) => s.bar).length;
let data = { pinned: [], lastSession: [], lastGroups: [], network: network_1.DEFAULT_NETWORK, appearance: (0, appearance_1.parseAppearance)(null), permissions: {}, certificates: {} };
const file = () => path.join(electron_1.app.getPath('userData'), 'browser-data.json');
const sites = (list) => Array.isArray(list) ? list.filter((e) => typeof e?.url === 'string' && typeof e?.title === 'string') : [];
const strings = (input) => typeof input === 'object' && input !== null ? Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'string')) : {};
const answers = (input) => typeof input === 'object' && input !== null ? Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'boolean')) : {};
function loadStore() {
    try {
        const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
        const network = (0, network_1.parseNetwork)(parsed?.network);
        data = { pinned: sites(parsed?.pinned), lastSession: sites(parsed?.lastSession), lastGroups: Array.isArray(parsed?.lastGroups) ? parsed.lastGroups : [], network: typeof network === 'string' ? network_1.DEFAULT_NETWORK : network, permissions: answers(parsed?.permissions), certificates: strings(parsed?.certificates), appearance: (0, appearance_1.parseAppearance)(parsed?.appearance) };
        // Favorites saved before the bar had a limit: the first ones are shown.
        let shown = data.pinned.filter((s) => s.bar === true).length;
        for (const site of data.pinned)
            if (typeof site.bar !== 'boolean')
                site.bar = shown < exports.BAR_LIMIT && ++shown > 0;
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            console.error(`store load: ${err.message}`);
    }
}
function save() {
    try {
        fs.writeFileSync(file(), JSON.stringify(data));
    }
    catch (err) {
        console.error(`store save: ${err.message}`);
    }
}
exports.store = {
    permission: (key) => (Object.hasOwn(data.permissions, key) ? data.permissions[key] : undefined),
    setPermission(key, allowed) {
        data.permissions[key] = allowed;
        save();
    },
    certificate: (host) => (Object.hasOwn(data.certificates, host) ? data.certificates[host] : undefined),
    setCertificate(host, fingerprint) {
        data.certificates[host] = fingerprint;
        save();
    },
    clearCertificates() {
        data.certificates = {};
        save();
    },
    removePermission(key) {
        delete data.permissions[key];
        save();
    },
    removeCertificate(host) {
        delete data.certificates[host];
        save();
    },
    clearPermissions() {
        data.permissions = {};
        save();
    },
    appearance: () => data.appearance,
    setAppearance(appearance) {
        data.appearance = appearance;
        save();
    },
    network: () => data.network,
    setNetwork(network) {
        data.network = network;
        save();
    },
    pinned: () => data.pinned,
    lastSession: () => data.lastSession,
    lastGroups: () => data.lastGroups,
    isPinned: (url) => data.pinned.some((s) => s.url === url),
    togglePin(entry) {
        if (exports.store.isPinned(entry.url))
            exports.store.unpin(entry.url);
        else {
            data.pinned.push({ ...entry, bar: barCount() < exports.BAR_LIMIT });
            save();
        }
    },
    // Returns false when the bar is full.
    setBar(url, on) {
        const site = data.pinned.find((s) => s.url === url);
        if (!site || (on && !site.bar && barCount() >= exports.BAR_LIMIT))
            return false;
        site.bar = on;
        save();
        return true;
    },
    unpin(url) {
        data.pinned = data.pinned.filter((s) => s.url !== url);
        save();
    },
    setLastSession(tabs, groups) {
        data.lastSession = tabs;
        data.lastGroups = groups;
        save();
    },
};
