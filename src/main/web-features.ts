// Everyday browser behaviour for web pages: right-click menu, downloads, links to other apps.
import { app, BrowserWindow, clipboard, dialog, Menu, MenuItemConstructorOptions, Notification, session, shell, WebContents } from 'electron';
import { isAllowedUrl, normalizeInput } from '../shared/url';
import { trackDownload } from './downloads';

// Links handled by another app. Anything not listed is ignored.
const EXTERNAL = new Set(['mailto:', 'tel:', 'zoommtg:', 'msteams:']);

export function isExternal(url: string): boolean {
  return URL.canParse(url) && EXTERNAL.has(new URL(url).protocol);
}

export async function openExternal(wc: WebContents, url: string): Promise<void> {
  const parent = BrowserWindow.getFocusedWindow();
  const options = { type: 'question' as const, message: `Open this link in another app?`, detail: `${url.slice(0, 200)}\n\nAsked by ${wc.getURL().slice(0, 100)}`, buttons: ['Cancel', 'Open'], defaultId: 0, cancelId: 0 };
  const { response } = await (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options));
  if (response === 1) await shell.openExternal(url);
}

// "Save …" from the menu asks where; every other download goes straight to the Downloads folder.
const askWhere = new Set<string>();

export function showContextMenu(wc: WebContents, params: Electron.ContextMenuParams, openTab: (url: string) => void): void {
  const { linkURL, srcURL, mediaType, selectionText, isEditable, editFlags } = params;
  const items: MenuItemConstructorOptions[] = [];
  const group = (...more: MenuItemConstructorOptions[]): void => {
    if (items.length) items.push({ type: 'separator' });
    items.push(...more);
  };
  if (linkURL && isAllowedUrl(linkURL)) {
    group({ label: 'Open Link in New Tab', click: () => openTab(linkURL) }, { label: 'Copy Link', click: () => clipboard.writeText(linkURL) });
  }
  if (mediaType === 'image' && srcURL) {
    group({ label: 'Copy Image', click: () => wc.copyImageAt(params.x, params.y) }, { label: 'Save Image…', click: () => {
      askWhere.add(srcURL);
      wc.downloadURL(srcURL);
    } });
  }
  if (isEditable) {
    group({ role: 'cut', enabled: editFlags.canCut }, { role: 'copy', enabled: editFlags.canCopy }, { role: 'paste', enabled: editFlags.canPaste }, { role: 'selectAll' });
  } else if (selectionText.trim()) {
    const search = normalizeInput(`${selectionText.trim().slice(0, 200)} `);
    group({ role: 'copy' }, { label: 'Search Google for Selection', click: () => search && openTab(search) });
  }
  const history = wc.navigationHistory;
  group(
    { label: 'Back', enabled: history.canGoBack(), click: () => history.goBack() },
    { label: 'Forward', enabled: history.canGoForward(), click: () => history.goForward() },
    { label: 'Reload', click: () => wc.reload() },
  );
  group({ label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) });
  Menu.buildFromTemplate(items).popup();
}

// A playing YouTube video moves to a floating corner window while the browser is out of sight.
const ENTER_PIP = `(() => {
  const video = [...document.querySelectorAll('video')].find((v) => !v.paused && !v.ended && !v.muted && v.readyState > 2);
  if (!video || document.pictureInPictureElement || !document.hidden) return;
  video.addEventListener('leavepictureinpicture', () => delete video.dataset.autoPip, { once: true });
  video.dataset.autoPip = '1';
  return video.requestPictureInPicture().then(() => {});
})()`;
// Only undoes our own: a picture-in-picture the user opened stays. It checks again a moment later, because a hidden
// page reports itself visible for an instant when YouTube moves to the next video.
const LEAVE_PIP = `void setTimeout(() => {
  if (!document.hidden && document.pictureInPictureElement?.dataset.autoPip) document.exitPictureInPicture().catch(() => {});
}, 600)`;

export function autoPictureInPicture(wc: WebContents, hidden: boolean): void {
  const url = wc.getURL();
  if (!URL.canParse(url) || !/(^|\.)youtube\.com$/.test(new URL(url).hostname)) return;
  // The second argument counts as a user gesture, which picture-in-picture requires.
  wc.executeJavaScript(hidden ? ENTER_PIP : LEAVE_PIP, true).catch((err: Error) => console.error(`picture-in-picture: ${err.message}`));
}

// Saves downloads and adds the list, progress on the Dock icon, and a notification when away from the app.
const watched = new Set<string>();
export function watchDownloads(partition: string, started: () => void): void {
  if (watched.has(partition)) return;
  watched.add(partition);
  session.fromPartition(partition).on('will-download', (_event, item) => {
    trackDownload(item, partition, askWhere.delete(item.getURLChain()[0]));
    started();
    const progress = (value: number): void => {
      for (const win of BrowserWindow.getAllWindows()) win.setProgressBar(value);
    };
    item.on('updated', () => progress(item.getTotalBytes() ? item.getReceivedBytes() / item.getTotalBytes() : 2));
    item.once('done', (_e, state) => {
      progress(-1);
      if (state === 'cancelled' || BrowserWindow.getFocusedWindow() || !Notification.isSupported()) return;
      const file = item.getSavePath();
      const done = state === 'completed';
      const notice = new Notification({ title: done ? 'Download finished' : 'Download failed', body: item.getFilename() });
      notice.on('click', () => (done ? shell.showItemInFolder(file) : void shell.openPath(app.getPath('downloads'))));
      notice.show();
    });
  });
}
