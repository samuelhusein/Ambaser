// Each profile is its own copy of the app with its own data folder, so logins, history, favorites and
// settings never mix. The default profile keeps the original folder; the others live inside it.
import { app } from 'electron';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { editProfile, newProfile, parseProfiles } from '../shared/profiles';
import type { Profile } from '../shared/types';

const SWITCH = 'ambaser-profile';
let root = ''; // the default profile's data folder; the list of profiles is kept there
let id = ''; // the profile this copy of the app is running

const listFile = (): string => path.join(root, 'profiles.json');
const folderOf = (profile: string): string => (profile ? path.join(root, 'Profiles', profile) : root);
let cache: Profile[] | null = null;

export function listProfiles(): Profile[] {
  if (cache) return cache;
  try {
    cache = parseProfiles(JSON.parse(fs.readFileSync(listFile(), 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`profiles load: ${(err as Error).message}`);
    cache = parseProfiles(null);
  }
  return cache;
}

export const currentProfile = (): Profile => listProfiles().find((p) => p.id === id) ?? listProfiles()[0];

// Must run before anything reads the data folder, including the single instance lock.
export function useProfile(dataFolder: string): void {
  root = dataFolder;
  const asked = app.commandLine.getSwitchValue(SWITCH);
  id = listProfiles().some((p) => p.id === asked) ? asked : '';
  fs.mkdirSync(folderOf(id), { recursive: true });
  app.setPath('userData', folderOf(id));
}

// Every copy of the app shares the list, so each one watches it for changes made by the others.
export function watchProfiles(changed: () => void): void {
  fs.watchFile(listFile(), { interval: 1000 }, () => {
    cache = null;
    changed();
  });
}

function save(profiles: Profile[]): string {
  try {
    fs.writeFileSync(listFile(), JSON.stringify(profiles));
    cache = profiles;
    return '';
  } catch (err) {
    return `Could not save: ${(err as Error).message}`;
  }
}

// A profile that is already open keeps its single instance lock, so this only brings it to the front.
export function openProfile(target: string): void {
  if (target === id || !listProfiles().some((p) => p.id === target)) return;
  const args = [...(app.isPackaged ? [] : [app.getAppPath()]), `--user-data-dir=${root}`, ...(target ? [`--${SWITCH}=${target}`] : [])];
  const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
  child.on('error', (err) => console.error(`open profile: ${err.message}`));
  child.unref();
}

// Creates and opens a profile. Returns an error message, or ''.
export function addProfile(name: string): string {
  cache = null; // another copy may have just changed it
  const profile = newProfile(listProfiles(), name, randomBytes(6).toString('hex'));
  if (typeof profile === 'string') return profile;
  const error = save([...listProfiles(), profile]);
  if (!error) openProfile(profile.id);
  return error;
}

export function updateProfile(target: string, name: string, color: unknown): string {
  cache = null;
  const profiles = editProfile(listProfiles(), target, name, color);
  return typeof profiles === 'string' ? profiles : save(profiles);
}

// Whether a copy of the app holds that profile's single instance lock.
function isOpen(target: string): boolean {
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
  } catch (err) {
    return process.platform === 'win32' || (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// Why a profile cannot be deleted, or ''.
export function whyKeep(target: string): string {
  if (!target) return 'The first profile cannot be deleted';
  if (target === id) return 'This profile is in use. Delete it from another profile';
  if (!listProfiles().some((p) => p.id === target)) return 'That profile no longer exists';
  return isOpen(target) ? 'Close that profile first' : '';
}

// Removes the profile and everything it stored. The caller must have asked the user.
export function removeProfile(target: string): string {
  cache = null;
  const reason = whyKeep(target); // checked again: it may have been opened while the user was asked
  if (reason) return reason;
  try {
    fs.rmSync(folderOf(target), { recursive: true, force: true });
  } catch (err) {
    return `Could not delete: ${(err as Error).message}`;
  }
  return save(listProfiles().filter((p) => p.id !== target));
}
