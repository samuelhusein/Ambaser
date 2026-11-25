// History kept in memory and mirrored to a JSON file in the app's userData folder.
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { addVisit } from '../shared/suggest';
import type { HistoryEntry } from '../shared/types';

let entries: HistoryEntry[] = [];
const file = (): string => path.join(app.getPath('userData'), 'history.json');

export function loadHistory(): void {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (Array.isArray(data)) entries = data.filter((e) => typeof e?.url === 'string' && typeof e?.title === 'string');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`history load: ${(err as Error).message}`);
  }
}

function save(): void {
  try {
    fs.writeFileSync(file(), JSON.stringify(entries));
  } catch (err) {
    console.error(`history save: ${(err as Error).message}`);
  }
}

export const allHistory = (): HistoryEntry[] => entries;

export function recordVisit(url: string, title: string): void {
  entries = addVisit(entries, url, title);
  save();
}

// Titles arrive after the navigation; update in place so the order is unchanged.
export function retitle(url: string, title: string): void {
  const entry = entries.find((e) => e.url === url);
  if (!entry || entry.title === title) return;
  entry.title = title;
  save();
}

// Icons arrive after the navigation too. Huge inline ones are skipped to keep the file small.
export function setFavicon(url: string, favicon: string): void {
  const entry = entries.find((e) => e.url === url);
  if (!entry || entry.favicon === favicon || favicon.length > 8192) return;
  entry.favicon = favicon;
  save();
}

export function removeVisit(url: string): void {
  entries = entries.filter((e) => e.url !== url);
  save();
}

export function clearHistory(): void {
  entries = [];
  save();
}
