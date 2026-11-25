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
exports.allHistory = void 0;
exports.loadHistory = loadHistory;
exports.recordVisit = recordVisit;
exports.retitle = retitle;
exports.setFavicon = setFavicon;
exports.removeVisit = removeVisit;
exports.clearHistory = clearHistory;
// History kept in memory and mirrored to a JSON file in the app's userData folder.
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const suggest_1 = require("../shared/suggest");
let entries = [];
const file = () => path.join(electron_1.app.getPath('userData'), 'history.json');
function loadHistory() {
    try {
        const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
        if (Array.isArray(data))
            entries = data.filter((e) => typeof e?.url === 'string' && typeof e?.title === 'string');
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            console.error(`history load: ${err.message}`);
    }
}
function save() {
    try {
        fs.writeFileSync(file(), JSON.stringify(entries));
    }
    catch (err) {
        console.error(`history save: ${err.message}`);
    }
}
const allHistory = () => entries;
exports.allHistory = allHistory;
function recordVisit(url, title) {
    entries = (0, suggest_1.addVisit)(entries, url, title);
    save();
}
// Titles arrive after the navigation; update in place so the order is unchanged.
function retitle(url, title) {
    const entry = entries.find((e) => e.url === url);
    if (!entry || entry.title === title)
        return;
    entry.title = title;
    save();
}
// Icons arrive after the navigation too. Huge inline ones are skipped to keep the file small.
function setFavicon(url, favicon) {
    const entry = entries.find((e) => e.url === url);
    if (!entry || entry.favicon === favicon || favicon.length > 8192)
        return;
    entry.favicon = favicon;
    save();
}
function removeVisit(url) {
    entries = entries.filter((e) => e.url !== url);
    save();
}
function clearHistory() {
    entries = [];
    save();
}
