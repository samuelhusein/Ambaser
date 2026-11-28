"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadList = exports.onDownloadsChange = void 0;
exports.trackDownload = trackDownload;
exports.forgetDownloads = forgetDownloads;
exports.downloadAction = downloadAction;
const electron_1 = require("electron");
const fs_1 = require("fs");
const path_1 = require("path");
const downloads_1 = require("../shared/downloads");
// Newest first, kept in memory. Each session lists only its own, so incognito ones stay in their window.
const entries = [];
let nextId = 1;
let notify = () => { };
let timer = null;
const onDownloadsChange = (callback) => {
    notify = callback;
};
exports.onDownloadsChange = onDownloadsChange;
const downloadList = (partition) => entries.filter((e) => e.partition === partition).map((e) => e.info);
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
// Saves to the Downloads folder without asking. Names of unfinished downloads count as taken too.
function savePath(name) {
    const folder = electron_1.app.getPath('downloads');
    const taken = (candidate) => {
        const path = (0, path_1.join)(folder, candidate);
        return (0, fs_1.existsSync)(path) || entries.some((e) => e.item && e.info.path === path);
    };
    return (0, path_1.join)(folder, (0, downloads_1.freeName)((0, path_1.basename)(name) || 'download', taken));
}
// Must run inside will-download: setting the path later does not stop the save dialog.
function trackDownload(item, partition, ask) {
    const path = ask ? '' : savePath(item.getFilename());
    if (path)
        item.setSavePath(path);
    else
        item.setSaveDialogOptions({ defaultPath: (0, path_1.join)(electron_1.app.getPath('downloads'), item.getFilename()) });
    const name = path ? (0, path_1.basename)(path) : item.getFilename();
    const entry = { info: { id: nextId++, name, received: 0, total: item.getTotalBytes(), state: 'progressing', path }, item: item, partition };
    entries.unshift(entry);
    item.on('updated', (_e, state) => {
        entry.info.received = item.getReceivedBytes();
        entry.info.total = item.getTotalBytes();
        entry.info.state = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing';
        entry.info.path = item.getSavePath();
        if (entry.info.path)
            entry.info.name = (0, path_1.basename)(entry.info.path);
        changed();
    });
    item.once('done', (_e, state) => {
        entry.info.state = state;
        entry.info.received = item.getReceivedBytes();
        entry.info.path = item.getSavePath();
        if (entry.info.path)
            entry.info.name = (0, path_1.basename)(entry.info.path);
        entry.item = null; // no longer controllable
        changed(true);
    });
    changed(true);
}
// An incognito window closed: its downloads stop and leave the list, as in Chrome.
function forgetDownloads(partition) {
    for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].partition !== partition)
            continue;
        entries[i].item?.cancel();
        entries.splice(i, 1);
    }
    changed(true);
}
function downloadAction(partition, id, action) {
    const index = entries.findIndex((e) => e.info.id === id && e.partition === partition);
    const entry = entries[index];
    if (action === 'clear') {
        for (let i = entries.length - 1; i >= 0; i--)
            if (!entries[i].item && entries[i].partition === partition)
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
