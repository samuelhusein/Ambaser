"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Runs in web pages and exposes nothing to them. Electron can only answer "allowed or not", so a site
// that has never asked about notifications would read "denied" and never ask. This reports "default".
const electron_1 = require("electron");
if (electron_1.ipcRenderer.sendSync('permission:notifications') === 'default') {
    electron_1.contextBridge.executeInMainWorld({
        func: () => {
            let state = 'default';
            const request = Notification.requestPermission.bind(Notification);
            Object.defineProperty(Notification, 'permission', { configurable: true, get: () => state });
            Notification.requestPermission = async (callback) => {
                state = await request();
                callback?.(state);
                return state;
            };
        },
    });
}
// Jam: report this page's video or audio to the room, and follow what the room does.
let ignoreUntil = 0; // our own changes fire the same events; do not send them back
const media = () => document.querySelector('video, audio');
for (const type of ['play', 'pause', 'seeked', 'ratechange']) {
    document.addEventListener(type, (event) => {
        const el = event.target;
        if (!(el instanceof HTMLMediaElement) || Date.now() < ignoreUntil)
            return;
        electron_1.ipcRenderer.send('jam:media', { type: 'media', paused: el.paused, time: el.currentTime, rate: el.playbackRate });
    }, true);
}
electron_1.ipcRenderer.on('jam:apply', (_event, m) => {
    const el = media();
    if (!el)
        return;
    ignoreUntil = Date.now() + 700;
    el.playbackRate = m.rate;
    if (Math.abs(el.currentTime - m.time) > 0.5)
        el.currentTime = m.time;
    if (m.paused)
        el.pause();
    else
        el.play().catch(() => { }); // the page may refuse until the user has clicked it
});
