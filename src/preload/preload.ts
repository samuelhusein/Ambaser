import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserApi, DownloadInfo, BrowserState, GroupState, NetworkSettings, Profile, TabDrop, WindowAction } from '../shared/types';

// The only surface the chrome UI gets. Fixed channel names, typed arguments, no raw ipcRenderer exposed.
const api: BrowserApi = {
  isMac: process.platform === 'darwin',
  windowAction: (action: WindowAction) => ipcRenderer.send('window:action', action),
  newTab: (url?: string) => ipcRenderer.send('tab:new', typeof url === 'string' ? url : undefined),
  closeTab: (id: number) => ipcRenderer.send('tab:close', id),
  dropTab: (id: number, drop: TabDrop) => ipcRenderer.send('tab:drop', id, drop),
  previewTab: (id: number) => ipcRenderer.invoke('tab:preview', String(id)),
  home: () => ipcRenderer.send('nav:home'),
  setAppearance: (appearance: { mode: string; theme: string }) => ipcRenderer.send('appearance:set', appearance),
  siteInfo: () => ipcRenderer.invoke('site:info', ''),
  setSitePermission: (origin: string, kind: string, value: string) => ipcRenderer.invoke('site:permission', JSON.stringify({ origin, kind, value })),
  forgetCertificate: (origin: string) => ipcRenderer.invoke('site:forget-certificate', origin),
  listDownloads: () => ipcRenderer.invoke('downloads:list', ''),
  onDownloads: (callback: (list: DownloadInfo[]) => void) => {
    ipcRenderer.on('downloads:update', (_event, list: DownloadInfo[]) => callback(list));
  },
  onDownloadStarted: (callback: () => void) => {
    ipcRenderer.on('downloads:started', () => callback());
  },
  downloadAction: (id: number, action: string) => ipcRenderer.send('downloads:action', id, action),
  pageQr: () => ipcRenderer.invoke('page:qr', ''),
  listProfiles: () => ipcRenderer.invoke('profiles:list', ''),
  openProfile: (id: string) => ipcRenderer.invoke('profiles:open', id),
  addProfile: (name: string) => ipcRenderer.invoke('profiles:add', name),
  updateProfile: (profile: Profile) => ipcRenderer.invoke('profiles:update', JSON.stringify(profile)),
  removeProfile: (id: string) => ipcRenderer.invoke('profiles:remove', id),
  setFavoriteBar: (url: string, on: boolean) => ipcRenderer.send('pin:bar', url, on),
  unpin: (url: string) => ipcRenderer.send('pin:remove', url),
  tabOverflow: (ids: number[]) => ipcRenderer.send('tabs:overflow', ids),
  newIncognito: () => ipcRenderer.send('window:incognito'),
  focusPage: () => ipcRenderer.send('page:focus'),
  toggleVpn: () => ipcRenderer.send('vpn:toggle'),
  toggleAdblock: () => ipcRenderer.send('adblock:toggle'),
  appVersion: () => ipcRenderer.invoke('app:version', ''),
  updateApp: (pin: string) => ipcRenderer.invoke('app:update', pin),
  toggleDevTools: () => ipcRenderer.send('page:devtools'),
  togglePin: () => ipcRenderer.send('pin:toggle'),
  onShowHistory: (callback: () => void) => {
    ipcRenderer.on('history:show', () => callback());
  },
  onFocusAddress: (callback: () => void) => {
    ipcRenderer.on('address:focus', () => callback());
  },
  getNetwork: () => ipcRenderer.invoke('network:get', ''),
  setNetwork: (settings: NetworkSettings) => ipcRenderer.invoke('network:set', JSON.stringify(settings)),
  find: (text: string, forward: boolean, next: boolean) => ipcRenderer.send('find:query', text, forward, next),
  stopFind: () => ipcRenderer.send('find:stop'),
  onShowFind: (callback: () => void) => {
    ipcRenderer.on('find:show', () => callback());
  },
  onFindResult: (callback: (current: number, total: number) => void) => {
    ipcRenderer.on('find:result', (_event, current: number, total: number) => callback(current, total));
  },
  tabMenu: (id: number) => ipcRenderer.send('tab:menu', id),
  updateGroup: (id: number, patch: Partial<GroupState>) => ipcRenderer.send('group:update', id, patch),
  ungroup: (id: number) => ipcRenderer.send('group:ungroup', id),
  closeGroup: (id: number) => ipcRenderer.send('group:close', id),
  onEditGroup: (callback: (id: number) => void) => {
    ipcRenderer.on('group:edit', (_event, id: number) => callback(id));
  },
  activateTab: (id: number) => ipcRenderer.send('tab:activate', id),
  navigate: (input: string) => ipcRenderer.send('nav:go', input),
  back: () => ipcRenderer.send('nav:back'),
  forward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  searchHistory: (query: string) => ipcRenderer.invoke('history:search', query),
  removeHistory: (url: string) => ipcRenderer.invoke('history:remove', url),
  listHistory: (query: string) => ipcRenderer.invoke('history:list', query),
  clearData: (kind: string) => ipcRenderer.invoke('data:clear', kind),
  clearHistory: () => ipcRenderer.invoke('history:clear', ''),
  suggest: (query: string) => ipcRenderer.invoke('suggest', query),
  setDropdownHeight: (height: number) => ipcRenderer.send('dropdown:height', height),
  onState: (callback: (state: BrowserState) => void) => {
    ipcRenderer.on('state', (_event, state: BrowserState) => callback(state));
  },
};

contextBridge.exposeInMainWorld('browser', api);
