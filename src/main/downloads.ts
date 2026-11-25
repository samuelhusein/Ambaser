import { shell } from 'electron';
import type { DownloadItem } from 'electron';
import type { DownloadInfo } from '../shared/types';

// Downloads of the normal profile, newest first. Incognito downloads are not listed.
const entries: { info: DownloadInfo; item: DownloadItem | null }[] = [];
let nextId = 1;
let notify: () => void = () => {};
let timer: NodeJS.Timeout | null = null;

export const onDownloadsChange = (callback: () => void): void => {
  notify = callback;
};
export const downloadList = (): DownloadInfo[] => entries.map((e) => e.info);

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

export function trackDownload(item: DownloadItem): void {
  const entry = { info: { id: nextId++, name: item.getFilename(), received: 0, total: item.getTotalBytes(), state: 'progressing', path: '' } as DownloadInfo, item: item as DownloadItem | null };
  entries.unshift(entry);
  item.on('updated', (_e, state) => {
    entry.info.received = item.getReceivedBytes();
    entry.info.total = item.getTotalBytes();
    entry.info.state = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing';
    entry.info.path = item.getSavePath();
    changed();
  });
  item.once('done', (_e, state) => {
    entry.info.state = state;
    entry.info.received = item.getReceivedBytes();
    entry.info.path = item.getSavePath();
    entry.item = null; // no longer controllable
    changed(true);
  });
  changed(true);
}

export function downloadAction(id: number, action: string): void {
  const index = entries.findIndex((e) => e.info.id === id);
  const entry = entries[index];
  if (action === 'clear') {
    for (let i = entries.length - 1; i >= 0; i--) if (!entries[i].item) entries.splice(i, 1);
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
