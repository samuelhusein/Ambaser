"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExternal = isExternal;
exports.openExternal = openExternal;
exports.showContextMenu = showContextMenu;
exports.autoPictureInPicture = autoPictureInPicture;
exports.watchDownloads = watchDownloads;
// Everyday browser behaviour for web pages: right-click menu, downloads, links to other apps.
const electron_1 = require("electron");
const url_1 = require("../shared/url");
const downloads_1 = require("./downloads");
// Links handled by another app. Anything not listed is ignored.
const EXTERNAL = new Set(['mailto:', 'tel:', 'zoommtg:', 'msteams:']);
function isExternal(url) {
    return URL.canParse(url) && EXTERNAL.has(new URL(url).protocol);
}
async function openExternal(wc, url) {
    const parent = electron_1.BrowserWindow.getFocusedWindow();
    const options = { type: 'question', message: `Open this link in another app?`, detail: `${url.slice(0, 200)}\n\nAsked by ${wc.getURL().slice(0, 100)}`, buttons: ['Cancel', 'Open'], defaultId: 0, cancelId: 0 };
    const { response } = await (parent ? electron_1.dialog.showMessageBox(parent, options) : electron_1.dialog.showMessageBox(options));
    if (response === 1)
        await electron_1.shell.openExternal(url);
}
// "Save …" from the menu asks where; every other download goes straight to the Downloads folder.
const askWhere = new Set();
function showContextMenu(wc, params, openTab) {
    const { linkURL, srcURL, mediaType, selectionText, isEditable, editFlags } = params;
    const items = [];
    const group = (...more) => {
        if (items.length)
            items.push({ type: 'separator' });
        items.push(...more);
    };
    if (linkURL && (0, url_1.isAllowedUrl)(linkURL)) {
        group({ label: 'Open Link in New Tab', click: () => openTab(linkURL) }, { label: 'Copy Link', click: () => electron_1.clipboard.writeText(linkURL) });
    }
    if (mediaType === 'image' && srcURL) {
        group({ label: 'Copy Image', click: () => wc.copyImageAt(params.x, params.y) }, { label: 'Save Image…', click: () => {
                askWhere.add(srcURL);
                wc.downloadURL(srcURL);
            } });
    }
    if (isEditable) {
        group({ role: 'cut', enabled: editFlags.canCut }, { role: 'copy', enabled: editFlags.canCopy }, { role: 'paste', enabled: editFlags.canPaste }, { role: 'selectAll' });
    }
    else if (selectionText.trim()) {
        const search = (0, url_1.normalizeInput)(`${selectionText.trim().slice(0, 200)} `);
        group({ role: 'copy' }, { label: 'Search Google for Selection', click: () => search && openTab(search) });
    }
    const history = wc.navigationHistory;
    group({ label: 'Back', enabled: history.canGoBack(), click: () => history.goBack() }, { label: 'Forward', enabled: history.canGoForward(), click: () => history.goForward() }, { label: 'Reload', click: () => wc.reload() });
    group({ label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) });
    electron_1.Menu.buildFromTemplate(items).popup();
}
// A playing YouTube video moves to a floating corner window while the browser is out of sight.
const ENTER_PIP = `(() => {
  const video = [...document.querySelectorAll('video')].find((v) => !v.paused && !v.ended && !v.muted && v.readyState > 2);
  if (!video || document.pictureInPictureElement || !document.hidden) return;
  video.addEventListener('leavepictureinpicture', () => delete video.dataset.autoPip, { once: true });
  video.dataset.autoPip = '1';
  return video.requestPictureInPicture().then(() => {});
})()`;
// Only undoes our own: a picture-in-picture the user opened stays.
const LEAVE_PIP = `document.pictureInPictureElement?.dataset.autoPip && document.exitPictureInPicture().then(() => {})`;
function autoPictureInPicture(wc, hidden) {
    const url = wc.getURL();
    if (!URL.canParse(url) || !/(^|\.)youtube\.com$/.test(new URL(url).hostname))
        return;
    // The second argument counts as a user gesture, which picture-in-picture requires.
    wc.executeJavaScript(hidden ? ENTER_PIP : LEAVE_PIP, true).catch((err) => console.error(`picture-in-picture: ${err.message}`));
}
// Saves downloads and adds the list, progress on the Dock icon, and a notification when away from the app.
const watched = new Set();
function watchDownloads(partition, started) {
    if (watched.has(partition))
        return;
    watched.add(partition);
    electron_1.session.fromPartition(partition).on('will-download', (_event, item) => {
        (0, downloads_1.trackDownload)(item, partition, askWhere.delete(item.getURLChain()[0]));
        started();
        const progress = (value) => {
            for (const win of electron_1.BrowserWindow.getAllWindows())
                win.setProgressBar(value);
        };
        item.on('updated', () => progress(item.getTotalBytes() ? item.getReceivedBytes() / item.getTotalBytes() : 2));
        item.once('done', (_e, state) => {
            progress(-1);
            if (state === 'cancelled' || electron_1.BrowserWindow.getFocusedWindow() || !electron_1.Notification.isSupported())
                return;
            const file = item.getSavePath();
            const done = state === 'completed';
            const notice = new electron_1.Notification({ title: done ? 'Download finished' : 'Download failed', body: item.getFilename() });
            notice.on('click', () => (done ? electron_1.shell.showItemInFolder(file) : void electron_1.shell.openPath(electron_1.app.getPath('downloads'))));
            notice.show();
        });
    });
}
