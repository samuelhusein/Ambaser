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
exports.currentProfile = void 0;
exports.listProfiles = listProfiles;
exports.useProfile = useProfile;
exports.watchProfiles = watchProfiles;
exports.openProfile = openProfile;
exports.addProfile = addProfile;
exports.updateProfile = updateProfile;
exports.whyKeep = whyKeep;
exports.removeProfile = removeProfile;
// Each profile is its own copy of the app with its own data folder, so logins, history, favorites and
// settings never mix. The default profile keeps the original folder; the others live inside it.
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const profiles_1 = require("../shared/profiles");
const SWITCH = 'ambaser-profile';
let root = ''; // the default profile's data folder; the list of profiles is kept there
let id = ''; // the profile this copy of the app is running
const listFile = () => path.join(root, 'profiles.json');
const folderOf = (profile) => (profile ? path.join(root, 'Profiles', profile) : root);
let cache = null;
function listProfiles() {
    if (cache)
        return cache;
    try {
        cache = (0, profiles_1.parseProfiles)(JSON.parse(fs.readFileSync(listFile(), 'utf8')));
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            console.error(`profiles load: ${err.message}`);
        cache = (0, profiles_1.parseProfiles)(null);
    }
    return cache;
}
const currentProfile = () => listProfiles().find((p) => p.id === id) ?? listProfiles()[0];
exports.currentProfile = currentProfile;
// Must run before anything reads the data folder, including the single instance lock.
function useProfile(dataFolder) {
    root = dataFolder;
    const asked = electron_1.app.commandLine.getSwitchValue(SWITCH);
    id = listProfiles().some((p) => p.id === asked) ? asked : '';
    fs.mkdirSync(folderOf(id), { recursive: true });
    electron_1.app.setPath('userData', folderOf(id));
}
// Every copy of the app shares the list, so each one watches it for changes made by the others.
function watchProfiles(changed) {
    fs.watchFile(listFile(), { interval: 1000 }, () => {
        cache = null;
        changed();
    });
}
function save(profiles) {
    try {
        fs.writeFileSync(listFile(), JSON.stringify(profiles));
        cache = profiles;
        return '';
    }
    catch (err) {
        return `Could not save: ${err.message}`;
    }
}
// A profile that is already open keeps its single instance lock, so this only brings it to the front.
function openProfile(target) {
    if (target === id || !listProfiles().some((p) => p.id === target))
        return;
    const args = [...(electron_1.app.isPackaged ? [] : [electron_1.app.getAppPath()]), `--user-data-dir=${root}`, ...(target ? [`--${SWITCH}=${target}`] : [])];
    const child = (0, child_process_1.spawn)(process.execPath, args, { detached: true, stdio: 'ignore' });
    child.on('error', (err) => console.error(`open profile: ${err.message}`));
    child.unref();
}
// Creates and opens a profile. Returns an error message, or ''.
function addProfile(name) {
    cache = null; // another copy may have just changed it
    const profile = (0, profiles_1.newProfile)(listProfiles(), name, (0, crypto_1.randomBytes)(6).toString('hex'));
    if (typeof profile === 'string')
        return profile;
    const error = save([...listProfiles(), profile]);
    if (!error)
        openProfile(profile.id);
    return error;
}
function updateProfile(target, name, color) {
    cache = null;
    const profiles = (0, profiles_1.editProfile)(listProfiles(), target, name, color);
    return typeof profiles === 'string' ? profiles : save(profiles);
}
// Whether a copy of the app holds that profile's single instance lock.
function isOpen(target) {
    const folder = folderOf(target);
    try {
        // Windows keeps the lock file open, so it can only be deleted once the profile is closed.
        if (process.platform === 'win32') {
            fs.rmSync(path.join(folder, 'lockfile'), { force: true });
            return false;
        }
        // Elsewhere it is a link naming the owner, "host-pid". A crash can leave it behind.
        const pid = Number(fs.readlinkSync(path.join(folder, 'SingletonLock')).split('-').pop());
        process.kill(pid, 0); // throws if there is no such process
        return true;
    }
    catch (err) {
        return process.platform === 'win32' || err.code === 'EPERM';
    }
}
// Why a profile cannot be deleted, or ''.
function whyKeep(target) {
    if (!target)
        return 'The first profile cannot be deleted';
    if (target === id)
        return 'This profile is in use. Delete it from another profile';
    if (!listProfiles().some((p) => p.id === target))
        return 'That profile no longer exists';
    return isOpen(target) ? 'Close that profile first' : '';
}
// Removes the profile and everything it stored. The caller must have asked the user.
function removeProfile(target) {
    cache = null;
    const reason = whyKeep(target); // checked again: it may have been opened while the user was asked
    if (reason)
        return reason;
    try {
        fs.rmSync(folderOf(target), { recursive: true, force: true });
    }
    catch (err) {
        return `Could not delete: ${err.message}`;
    }
    return save(listProfiles().filter((p) => p.id !== target));
}
