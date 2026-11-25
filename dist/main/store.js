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
exports.store = void 0;
exports.loadStore = loadStore;
// Pinned sites and the last session's tabs, mirrored to a JSON file in the app's userData folder.
// History lives in history.ts.
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const network_1 = require("../shared/network");
let data = { pinned: [], lastSession: [], network: network_1.DEFAULT_NETWORK, permissions: {} };
const file = () => path.join(electron_1.app.getPath('userData'), 'browser-data.json');
const sites = (list) => Array.isArray(list) ? list.filter((e) => typeof e?.url === 'string' && typeof e?.title === 'string') : [];
const answers = (input) => typeof input === 'object' && input !== null ? Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'boolean')) : {};
function loadStore() {
    try {
        const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
        const network = (0, network_1.parseNetwork)(parsed?.network);
        data = { pinned: sites(parsed?.pinned), lastSession: sites(parsed?.lastSession), network: typeof network === 'string' ? network_1.DEFAULT_NETWORK : network, permissions: answers(parsed?.permissions) };
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
    clearPermissions() {
        data.permissions = {};
        save();
    },
    network: () => data.network,
    setNetwork(network) {
        data.network = network;
        save();
    },
    pinned: () => data.pinned,
    lastSession: () => data.lastSession,
    isPinned: (url) => data.pinned.some((s) => s.url === url),
    togglePin(entry) {
        if (exports.store.isPinned(entry.url))
            exports.store.unpin(entry.url);
        else {
            data.pinned.push(entry);
            save();
        }
    },
    unpin(url) {
        data.pinned = data.pinned.filter((s) => s.url !== url);
        save();
    },
    setLastSession(entries) {
        data.lastSession = entries;
        save();
    },
};
