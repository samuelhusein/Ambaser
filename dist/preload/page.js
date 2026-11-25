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
