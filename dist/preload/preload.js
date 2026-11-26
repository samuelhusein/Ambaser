"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// The only surface the chrome UI gets. Fixed channel names, typed arguments, no raw ipcRenderer exposed.
const api = {
    isMac: process.platform === 'darwin',
    windowAction: (action) => electron_1.ipcRenderer.send('window:action', action),
    newTab: (url) => electron_1.ipcRenderer.send('tab:new', typeof url === 'string' ? url : undefined),
    closeTab: (id) => electron_1.ipcRenderer.send('tab:close', id),
    dropTab: (id, drop) => electron_1.ipcRenderer.send('tab:drop', id, drop),
    previewTab: (id) => electron_1.ipcRenderer.invoke('tab:preview', String(id)),
    home: () => electron_1.ipcRenderer.send('nav:home'),
    setAppearance: (appearance) => electron_1.ipcRenderer.send('appearance:set', appearance),
    siteInfo: () => electron_1.ipcRenderer.invoke('site:info', ''),
    setSitePermission: (origin, kind, value) => electron_1.ipcRenderer.invoke('site:permission', JSON.stringify({ origin, kind, value })),
    forgetCertificate: (origin) => electron_1.ipcRenderer.invoke('site:forget-certificate', origin),
    listDownloads: () => electron_1.ipcRenderer.invoke('downloads:list', ''),
    onDownloads: (callback) => {
        electron_1.ipcRenderer.on('downloads:update', (_event, list) => callback(list));
    },
    downloadAction: (id, action) => electron_1.ipcRenderer.send('downloads:action', id, action),
    setFavoriteBar: (url, on) => electron_1.ipcRenderer.send('pin:bar', url, on),
    unpin: (url) => electron_1.ipcRenderer.send('pin:remove', url),
    tabOverflow: (ids) => electron_1.ipcRenderer.send('tabs:overflow', ids),
    newIncognito: () => electron_1.ipcRenderer.send('window:incognito'),
    toggleVpn: () => electron_1.ipcRenderer.send('vpn:toggle'),
    toggleAdblock: () => electron_1.ipcRenderer.send('adblock:toggle'),
    appVersion: () => electron_1.ipcRenderer.invoke('app:version', ''),
    updateApp: (pin) => electron_1.ipcRenderer.invoke('app:update', pin),
    toggleDevTools: () => electron_1.ipcRenderer.send('page:devtools'),
    togglePin: () => electron_1.ipcRenderer.send('pin:toggle'),
    onShowHistory: (callback) => {
        electron_1.ipcRenderer.on('history:show', () => callback());
    },
    onFocusAddress: (callback) => {
        electron_1.ipcRenderer.on('address:focus', () => callback());
    },
    getNetwork: () => electron_1.ipcRenderer.invoke('network:get', ''),
    setNetwork: (settings) => electron_1.ipcRenderer.invoke('network:set', JSON.stringify(settings)),
    find: (text, forward, next) => electron_1.ipcRenderer.send('find:query', text, forward, next),
    stopFind: () => electron_1.ipcRenderer.send('find:stop'),
    onShowFind: (callback) => {
        electron_1.ipcRenderer.on('find:show', () => callback());
    },
    onFindResult: (callback) => {
        electron_1.ipcRenderer.on('find:result', (_event, current, total) => callback(current, total));
    },
    tabMenu: (id) => electron_1.ipcRenderer.send('tab:menu', id),
    updateGroup: (id, patch) => electron_1.ipcRenderer.send('group:update', id, patch),
    ungroup: (id) => electron_1.ipcRenderer.send('group:ungroup', id),
    closeGroup: (id) => electron_1.ipcRenderer.send('group:close', id),
    onEditGroup: (callback) => {
        electron_1.ipcRenderer.on('group:edit', (_event, id) => callback(id));
    },
    activateTab: (id) => electron_1.ipcRenderer.send('tab:activate', id),
    navigate: (input) => electron_1.ipcRenderer.send('nav:go', input),
    back: () => electron_1.ipcRenderer.send('nav:back'),
    forward: () => electron_1.ipcRenderer.send('nav:forward'),
    reload: () => electron_1.ipcRenderer.send('nav:reload'),
    searchHistory: (query) => electron_1.ipcRenderer.invoke('history:search', query),
    removeHistory: (url) => electron_1.ipcRenderer.invoke('history:remove', url),
    listHistory: (query) => electron_1.ipcRenderer.invoke('history:list', query),
    clearData: (kind) => electron_1.ipcRenderer.invoke('data:clear', kind),
    clearHistory: () => electron_1.ipcRenderer.invoke('history:clear', ''),
    suggest: (query) => electron_1.ipcRenderer.invoke('suggest', query),
    setDropdownHeight: (height) => electron_1.ipcRenderer.send('dropdown:height', height),
    onState: (callback) => {
        electron_1.ipcRenderer.on('state', (_event, state) => callback(state));
    },
};
electron_1.contextBridge.exposeInMainWorld('browser', api);
