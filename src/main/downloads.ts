import { app, shell } from 'electron';
import type { DownloadItem } from 'electron';
import { existsSync } from 'fs';
import { basename, join } from 'path';
import { freeName } from '../shared/downloads';
import type { DownloadInfo } from '../shared/types';

// Newest first, kept in memory. Each session lists only its own, so incognito ones stay in their window.
const entries: { info: DownloadInfo; item: DownloadItem | null; partition: string }[] = [];
let nextId = 1;
let notify: () => void = () => {};
let timer: NodeJS.Timeout | null = null;

export const onDownloadsChange = (callback: () => void): void => {
  notify = callback;
};
export const downloadList = (partition: string): DownloadInfo[] => entries.filter((e) => e.partition === partition).map((e) => e.info);

// Progress arrives many times a second; the UI needs far fewer updates.
function changed(now = false): void {
  if (now) {
    if (timer) clearTimeout(timer);
    timer = null;
    notify();
  } else if (!timer) {
    timer = setTimeout(() => changed(true), 250);
  }
}

// Saves to the Downloads folder without asking. Names of unfinished downloads count as taken too.
function savePath(name: string): string {
  const folder = app.getPath('downloads');
  const taken = (candidate: string): boolean => {
    const path = join(folder, candidate);
    return existsSync(path) || entries.some((e) => e.item && e.info.path === path);
  };
  return join(folder, freeName(basename(name) || 'download', taken));
}

// Must run inside will-download: setting the path later does not stop the save dialog.
export function trackDownload(item: DownloadItem, partition: string, ask: boolean): void {
  const path = ask ? '' : savePath(item.getFilename());
  if (path) item.setSavePath(path);
  else item.setSaveDialogOptions({ defaultPath: join(app.getPath('downloads'), item.getFilename()) });
  const name = path ? basename(path) : item.getFilename();
  const entry = { info: { id: nextId++, name, received: 0, total: item.getTotalBytes(), state: 'progressing', path } as DownloadInfo, item: item as DownloadItem | null, partition };
  entries.unshift(entry);
  item.on('updated', (_e, state) => {
    entry.info.received = item.getReceivedBytes();
    entry.info.total = item.getTotalBytes();
    entry.info.state = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing';
    entry.info.path = item.getSavePath();
    if (entry.info.path) entry.info.name = basename(entry.info.path);
    changed();
  });
  item.once('done', (_e, state) => {
    entry.info.state = state;
    entry.info.received = item.getReceivedBytes();
    entry.info.path = item.getSavePath();
    if (entry.info.path) entry.info.name = basename(entry.info.path);
    entry.item = null; // no longer controllable
    changed(true);
  });
  changed(true);
}

// An incognito window closed: its downloads stop and leave the list, as in Chrome.
export function forgetDownloads(partition: string): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].partition !== partition) continue;
    entries[i].item?.cancel();
    entries.splice(i, 1);
  }
  changed(true);
}

export function downloadAction(partition: string, id: number, action: string): void {
  const index = entries.findIndex((e) => e.info.id === id && e.partition === partition);
  const entry = entries[index];
  if (action === 'clear') {
    for (let i = entries.length - 1; i >= 0; i--) if (!entries[i].item && entries[i].partition === partition) entries.splice(i, 1);
  } else if (entry) {
    const { item, info } = entry;
    if (action === 'pause') item?.pause();
    else if (action === 'resume' && item?.canResume()) item.resume();
    else if (action === 'cancel') item?.cancel();
    else if (action === 'show' && info.path) shell.showItemInFolder(info.path);
    else if (action === 'open' && info.path && info.state === 'completed') void shell.openPath(info.path);
    else if (action === 'remove' && !item) entries.splice(index, 1);
  }
  changed(true);
}
