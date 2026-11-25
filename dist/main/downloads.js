"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadList = exports.onDownloadsChange = void 0;
exports.trackDownload = trackDownload;
exports.downloadAction = downloadAction;
const electron_1 = require("electron");
// Downloads of the normal profile, newest first. Incognito downloads are not listed.
const entries = [];
let nextId = 1;
let notify = () => { };
let timer = null;
const onDownloadsChange = (callback) => {
    notify = callback;
};
exports.onDownloadsChange = onDownloadsChange;
const downloadList = () => entries.map((e) => e.info);
exports.downloadList = downloadList;
// Progress arrives many times a second; the UI needs far fewer updates.
function changed(now = false) {
    if (now) {
        if (timer)
            clearTimeout(timer);
        timer = null;
        notify();
    }
    else if (!timer) {
        timer = setTimeout(() => changed(true), 250);
    }
}
function trackDownload(item) {
    const entry = { info: { id: nextId++, name: item.getFilename(), received: 0, total: item.getTotalBytes(), state: 'progressing', path: '' }, item: item };
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
function downloadAction(id, action) {
    const index = entries.findIndex((e) => e.info.id === id);
    const entry = entries[index];
    if (action === 'clear') {
        for (let i = entries.length - 1; i >= 0; i--)
            if (!entries[i].item)
                entries.splice(i, 1);
    }
    else if (entry) {
        const { item, info } = entry;
        if (action === 'pause')
            item?.pause();
        else if (action === 'resume' && item?.canResume())
            item.resume();
        else if (action === 'cancel')
            item?.cancel();
        else if (action === 'show' && info.path)
            electron_1.shell.showItemInFolder(info.path);
        else if (action === 'open' && info.path && info.state === 'completed')
            void electron_1.shell.openPath(info.path);
        else if (action === 'remove' && !item)
            entries.splice(index, 1);
    }
    changed(true);
}
