// Pinned sites and the last session's tabs, mirrored to a JSON file in the app's userData folder.
// History lives in history.ts.
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_NETWORK, parseNetwork } from '../shared/network';
import type { NetworkSettings } from '../shared/types';

export interface SiteEntry {
  url: string;
  title: string;
  favicon: string | null;
}

interface StoreData {
  pinned: SiteEntry[];
  lastSession: SiteEntry[];
  network: NetworkSettings;
  permissions: Record<string, boolean>; // "origin kind" -> allowed
  trustedHosts: string[]; // hosts the user chose to open despite a bad certificate
}

let data: StoreData = { pinned: [], lastSession: [], network: DEFAULT_NETWORK, permissions: {}, trustedHosts: [] };
const file = (): string => path.join(app.getPath('userData'), 'browser-data.json');

const sites = (list: unknown): SiteEntry[] =>
  Array.isArray(list) ? list.filter((e) => typeof e?.url === 'string' && typeof e?.title === 'string') : [];

const answers = (input: unknown): Record<string, boolean> =>
  typeof input === 'object' && input !== null ? Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === 'boolean')) : {};

export function loadStore(): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const network = parseNetwork(parsed?.network);
    data = { pinned: sites(parsed?.pinned), lastSession: sites(parsed?.lastSession), network: typeof network === 'string' ? DEFAULT_NETWORK : network, permissions: answers(parsed?.permissions), trustedHosts: Array.isArray(parsed?.trustedHosts) ? parsed.trustedHosts.filter((h: unknown) => typeof h === 'string') : [] };
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
  clearPermissions(): void {
    data.permissions = {};
    save();
  },
  isTrustedHost: (host: string): boolean => data.trustedHosts.includes(host),
  trustHost(host: string): void {
    if (!data.trustedHosts.includes(host)) data.trustedHosts.push(host);
    save();
  },
  clearTrustedHosts(): void {
    data.trustedHosts = [];
    save();
  },
  network: (): NetworkSettings => data.network,
  setNetwork(network: NetworkSettings): void {
    data.network = network;
    save();
  },
  pinned: (): SiteEntry[] => data.pinned,
  lastSession: (): SiteEntry[] => data.lastSession,
  isPinned: (url: string): boolean => data.pinned.some((s) => s.url === url),
  togglePin(entry: SiteEntry): void {
    if (store.isPinned(entry.url)) store.unpin(entry.url);
    else {
      data.pinned.push(entry);
      save();
    }
  },
  unpin(url: string): void {
    data.pinned = data.pinned.filter((s) => s.url !== url);
    save();
  },
  setLastSession(entries: SiteEntry[]): void {
    data.lastSession = entries;
    save();
  },
};
