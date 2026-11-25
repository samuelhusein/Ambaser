// Pinned sites and the last session's tabs, mirrored to a JSON file in the app's userData folder.
// History lives in history.ts.
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { parseAppearance } from '../shared/appearance';
import { DEFAULT_NETWORK, parseNetwork } from '../shared/network';
import type { Appearance, GroupState, NetworkSettings } from '../shared/types';

export interface SiteEntry {
  url: string;
  title: string;
  favicon: string | null;
  bar?: boolean; // shown in the favorites bar
}

export const BAR_LIMIT = 8;

// A tab as it was when its window closed.
export interface SavedTab extends SiteEntry {
  groupId?: number | null;
  active?: boolean;
}

interface StoreData {
  pinned: SiteEntry[];
  lastSession: SavedTab[];
  lastGroups: GroupState[]; // checked by reviveGroups when used
  network: NetworkSettings;
  appearance: Appearance;
  permissions: Record<string, boolean>; // "origin kind" -> allowed
  certificates: Record<string, string>; // host -> fingerprint of the bad certificate the user accepted
}

const barCount = (): number => data.pinned.filter((s) => s.bar).length;

let data: StoreData = { pinned: [], lastSession: [], lastGroups: [], network: DEFAULT_NETWORK, appearance: parseAppearance(null), permissions: {}, certificates: {} };
const file = (): string => path.join(app.getPath('userData'), 'browser-data.json');

const sites = (list: unknown): SiteEntry[] =>
  Array.isArray(list) ? list.filter((e) => typeof e?.url === 'string' && typeof e?.title === 'string') : [];

const strings = (input: unknown): Record<string, string> =>
  typeof input === 'object' && input !== null ? Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'string')) : {};

const answers = (input: unknown): Record<string, boolean> =>
  typeof input === 'object' && input !== null ? Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'boolean')) : {};

export function loadStore(): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const network = parseNetwork(parsed?.network);
    data = { pinned: sites(parsed?.pinned), lastSession: sites(parsed?.lastSession), lastGroups: Array.isArray(parsed?.lastGroups) ? parsed.lastGroups : [], network: typeof network === 'string' ? DEFAULT_NETWORK : network, permissions: answers(parsed?.permissions), certificates: strings(parsed?.certificates), appearance: parseAppearance(parsed?.appearance) };
    // Favorites saved before the bar had a limit: the first ones are shown.
    let shown = data.pinned.filter((s) => s.bar === true).length;
    for (const site of data.pinned) if (typeof site.bar !== 'boolean') site.bar = shown < BAR_LIMIT && ++shown > 0;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`store load: ${(err as Error).message}`);
  }
}

function save(): void {
  try {
    fs.writeFileSync(file(), JSON.stringify(data));
  } catch (err) {
    console.error(`store save: ${(err as Error).message}`);
  }
}

export const store = {
  permission: (key: string): boolean | undefined => (Object.hasOwn(data.permissions, key) ? data.permissions[key] : undefined),
  setPermission(key: string, allowed: boolean): void {
    data.permissions[key] = allowed;
    save();
  },
  certificate: (host: string): string | undefined => (Object.hasOwn(data.certificates, host) ? data.certificates[host] : undefined),
  setCertificate(host: string, fingerprint: string): void {
    data.certificates[host] = fingerprint;
    save();
  },
  clearCertificates(): void {
    data.certificates = {};
    save();
  },
  removePermission(key: string): void {
    delete data.permissions[key];
    save();
  },
  removeCertificate(host: string): void {
    delete data.certificates[host];
    save();
  },
  clearPermissions(): void {
    data.permissions = {};
    save();
  },
  appearance: (): Appearance => data.appearance,
  setAppearance(appearance: Appearance): void {
    data.appearance = appearance;
    save();
  },
  network: (): NetworkSettings => data.network,
  setNetwork(network: NetworkSettings): void {
    data.network = network;
    save();
  },
  pinned: (): SiteEntry[] => data.pinned,
  lastSession: (): SavedTab[] => data.lastSession,
  lastGroups: (): GroupState[] => data.lastGroups,
  isPinned: (url: string): boolean => data.pinned.some((s) => s.url === url),
  togglePin(entry: SiteEntry): void {
    if (store.isPinned(entry.url)) store.unpin(entry.url);
    else {
      data.pinned.push({ ...entry, bar: barCount() < BAR_LIMIT });
      save();
    }
  },
  // Returns false when the bar is full.
  setBar(url: string, on: boolean): boolean {
    const site = data.pinned.find((s) => s.url === url);
    if (!site || (on && !site.bar && barCount() >= BAR_LIMIT)) return false;
    site.bar = on;
    save();
    return true;
  },
  unpin(url: string): void {
    data.pinned = data.pinned.filter((s) => s.url !== url);
    save();
  },
  setLastSession(tabs: SavedTab[], groups: GroupState[]): void {
    data.lastSession = tabs;
    data.lastGroups = groups;
    save();
  },
};
