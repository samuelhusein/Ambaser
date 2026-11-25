"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guardPermissions = guardPermissions;
exports.allowsNotifications = allowsNotifications;
exports.sitePermissions = sitePermissions;
exports.setSitePermission = setSitePermission;
exports.resetPermissions = resetPermissions;
// Asks the user before a site gets notifications, location, camera, microphone or the clipboard.
const electron_1 = require("electron");
const permissions_1 = require("../shared/permissions");
const store_1 = require("./store");
// Incognito answers live only as long as the app.
const temporary = new Map();
const pending = new Map();
async function ask(wc, origin, kind, remember) {
    const key = `${origin} ${kind}`;
    const known = remember ? store_1.store.permission(key) : temporary.get(key);
    if (known !== undefined)
        return known;
    const text = (0, permissions_1.question)(kind);
    if (!text)
        return false;
    let answer = pending.get(key);
    if (!answer) {
        const options = { type: 'question', message: `Allow ${origin} to ${text}?`, buttons: ['Block', 'Allow'], defaultId: 0, cancelId: 0 };
        const parent = (wc && electron_1.BrowserWindow.fromWebContents(wc)) || electron_1.BrowserWindow.getFocusedWindow();
        answer = (parent ? electron_1.dialog.showMessageBox(parent, options) : electron_1.dialog.showMessageBox(options)).then(({ response }) => {
            const allowed = response === 1;
            if (remember)
                store_1.store.setPermission(key, allowed);
            else
                temporary.set(key, allowed);
            pending.delete(key);
            return allowed;
        });
        pending.set(key, answer);
    }
    return answer;
}
const registered = new Set();
function guardPermissions(partition) {
    if (registered.has(partition))
        return;
    registered.add(partition);
    const ses = electron_1.session.fromPartition(partition);
    const remember = partition.startsWith('persist:');
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
        if ((0, permissions_1.isHarmless)(permission))
            return callback(true);
        const origin = (0, permissions_1.secureOrigin)(details.requestingUrl);
        const kinds = (0, permissions_1.kindsOf)(permission, details.mediaTypes);
        if (!origin || kinds.length === 0)
            return callback(false);
        void (async () => {
            for (const kind of kinds)
                if (!(await ask(wc, origin, kind, remember)))
                    return callback(false);
            callback(true);
        })();
    });
    // Silent checks never prompt: they are true only for what was already allowed.
    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
        if ((0, permissions_1.isHarmless)(permission))
            return true;
        const origin = (0, permissions_1.secureOrigin)(requestingOrigin);
        const kinds = (0, permissions_1.kindsOf)(permission, details.mediaType ? [details.mediaType] : []);
        const allowed = (kind) => (remember ? store_1.store.permission(`${origin} ${kind}`) : temporary.get(`${origin} ${kind}`)) === true;
        return origin !== null && kinds.length > 0 && kinds.every(allowed);
    });
}
// What the page preload should report. Only answers about the asking page's own address.
electron_1.ipcMain.on('permission:notifications', (event) => {
    const origin = (0, permissions_1.secureOrigin)(event.senderFrame?.url ?? '');
    const key = `${origin} notifications`;
    const answer = event.sender.session.isPersistent() ? store_1.store.permission(key) : temporary.get(key);
    event.returnValue = !origin ? 'denied' : answer === undefined ? 'default' : answer ? 'granted' : 'denied';
});
// True if the user let this page send notifications.
function allowsNotifications(ses, url) {
    const key = `${(0, permissions_1.secureOrigin)(url)} notifications`;
    return (ses.isPersistent() ? store_1.store.permission(key) : temporary.get(key)) === true;
}
// The saved answers for one site, as shown by the address bar's site button.
function sitePermissions(ses, origin) {
    return permissions_1.KINDS.map((kind) => {
        const key = `${origin} ${kind}`;
        const answer = ses.isPersistent() ? store_1.store.permission(key) : temporary.get(key);
        return { kind, value: answer === undefined ? 'ask' : answer ? 'allow' : 'block' };
    });
}
function setSitePermission(ses, origin, kind, value) {
    if (!permissions_1.KINDS.includes(kind) || !['ask', 'allow', 'block'].includes(value))
        return;
    const key = `${origin} ${kind}`;
    if (value === 'ask') {
        if (ses.isPersistent())
            store_1.store.removePermission(key);
        else
            temporary.delete(key);
    }
    else if (ses.isPersistent())
        store_1.store.setPermission(key, value === 'allow');
    else
        temporary.set(key, value === 'allow');
}
function resetPermissions() {
    temporary.clear();
    store_1.store.clearPermissions();
}
