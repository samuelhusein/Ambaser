import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, session, shell, WebContentsView, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { BLANK_URL, HOME_URL, certErrorUrl, displayUrl, isAllowedUrl, isAppUrl, loadErrorUrl, normalizeInput, unreadCount, withoutUnread } from '../shared/url';
import { forgetCertificate, forgetCertificates, hasAcceptedCertificate, isTrusted, registerPages, registerScheme, runPageAction } from './app-pages';
import { applyDns, applyProxy } from './network';
import { BAR_LIMIT, loadStore, store, SavedTab } from './store';
import { allowsNotifications, guardPermissions, resetPermissions, setSitePermission, sitePermissions } from './permissions';
import { autoPictureInPicture, isExternal, openExternal, showContextMenu, watchDownloads } from './web-features';
import { parseNetwork } from '../shared/network';
import { parseAppearance } from '../shared/appearance';
import { secureOrigin } from '../shared/permissions';
import { parseSuggestions, searchHistory, suggestQuery } from '../shared/suggest';
import { GROUP_COLORS, moveToGroup, patchGroup, placeTab, reviveGroups } from '../shared/groups';
import { isNewer } from '../shared/version';
import { gitUpdate } from './updates';
import { exec } from 'child_process';
import { promisify } from 'util';
import { guardWebRtc, onVpnChange, startVpn, stopVpn, vpnRegistered, vpnStatus, vpnSupported, WARP_TERMS } from './vpn';
import { applyAdblock, loadAdblock, watchAdblock } from './adblock';
import { allowGoogleLogin } from './google-login';
import { addProfile, currentProfile, listProfiles, openProfile, removeProfile, updateProfile, useProfile, watchProfiles, whyKeep } from './profiles';
import qrcode from 'qrcode-generator';
import { downloadAction, downloadList, onDownloadsChange } from './downloads';
import { allHistory, clearHistory, loadHistory, recordVisit, removeVisit, retitle, setFavicon } from './history';
import type { BrowserState, UpdateInfo, GroupState, SiteInfo, TabDrop } from '../shared/types';

const CHROME_HEIGHT = 120; // tab strip 40 + toolbar 44 + pinned bar 36
const WEB_PARTITION = 'persist:browser';
const IS_MAC = process.platform === 'darwin';
const APP_NAME = 'Ambaser';
const ICON = path.join(__dirname, '../../assets/icon.png');
const PAGE_PRELOAD = path.join(__dirname, '../preload/page.js');

registerScheme();

// Lower memory use: cap the JS heap and the disk cache, and skip the spare renderer process.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=1024');
app.commandLine.appendSwitch('disk-cache-size', String(100 * 1024 * 1024));
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');
// Chromium fetches a large file in 4 parts at once when the server allows ranges. 4 leaves 2 of the 6 connections per host for browsing.
app.commandLine.appendSwitch('enable-features', 'ParallelDownloading:request_count/4');
// Blocks WebRTC from revealing this machine's local network IP to any site (video calls, etc.),
// which otherwise leaks even through a proxy or on an untrusted network.
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');

// Renamed from MyBrowser: keep the old data folder so history, pins and logins carry over.
const dataFolder = app.getPath('userData');
app.setName(APP_NAME);
useProfile(dataFolder);
// Two copies on one data folder lock each other out of the cache and storage; the second one just shows the first.
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  if (!app.isReady()) return;
  const w = focusedWindow() ?? createWindow();
  if (w.win.isMinimized()) w.win.restore();
  w.win.show();
  app.focus({ steal: true }); // asked for from another profile's window
});
// Some sites (WhatsApp Web) refuse browser names they do not know, so present as the Chrome engine this is.
app.userAgentFallback = app.userAgentFallback.replace(new RegExp(` (${APP_NAME}|Electron)/\\S+`, 'g'), '');

interface Tab {
  id: number;
  groupId: number | null;
  view: WebContentsView;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  preview: string | null; // last thumbnail; background tabs cannot be captured on demand
  sleeping: boolean; // its page was dropped from memory; it reloads when selected
  lastActive: number; // ms since epoch
}

const webPreferences = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
};

// One per browser window. Each has its own tabs and groups; an incognito window also has its own
// in-memory session, so it shares no cookies or storage with other windows and records no history.
interface Win {
  win: BrowserWindow;
  chrome: WebContentsView;
  tabs: Tab[];
  groups: GroupState[];
  activeTab: Tab | null;
  dropdownHeight: number;
  incognito: boolean;
  partition: string;
  pageFullscreen: boolean; // a video or page element is using the whole window
  finding: boolean; // the find bar is open
  closed: string[]; // addresses of closed tabs, newest last
}

const windows: Win[] = [];
// Where the private repo's releases are served (worker/index.js); set as "updateUrl" in package.json.
const updateUrl = (): string => {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')).updateUrl || '').replace(/\/+$/, '');
  } catch {
    return '';
  }
};
let update: UpdateInfo | null = null;

// A git checkout can also tell what changed; without git only the version number is known.
// Offline or any failure just means no alert.
async function checkVersion(): Promise<void> {
  try {
    let found: UpdateInfo | null = null;
    if (fs.existsSync(path.join(app.getAppPath(), '.git'))) found = await gitUpdate(app.getAppPath());
    else if (updateUrl()) {
      const res = await net.fetch(`${updateUrl()}/version`, { signal: AbortSignal.timeout(10000) });
      const version = res.ok ? ((await res.json()) as { version?: unknown }).version : null;
      if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return;
      if (isNewer(version, app.getVersion())) found = { version, features: [], fixes: [], other: [] };
    } else return;
    update = found;
    for (const w of windows) broadcast(w);
  } catch {}
}
let nextId = 1;
let nextGroupId = 1;
let incognitoCount = 0;

const focusedWindow = (): Win | undefined => windows.find((w) => w.win === BrowserWindow.getFocusedWindow()) ?? windows[0];

function layout(w: Win): void {
  if (w.win.isDestroyed()) return;
  const { win, chrome, activeTab, dropdownHeight } = w;
  const { width, height } = win.getContentBounds();
  // The chrome view grows over the page while the address dropdown or history panel is open.
  chrome.setBounds({ x: 0, y: 0, width, height: Math.min(height, Math.max(CHROME_HEIGHT, dropdownHeight)) });
  chrome.setVisible(!w.pageFullscreen);
  if (activeTab && w.pageFullscreen) {
    activeTab.view.setVisible(true);
    activeTab.view.setBounds({ x: 0, y: 0, width, height });
  } else if (activeTab) {
    // Hidden under the full-height history panel, so its glass shows the desktop blur and not the page.
    activeTab.view.setVisible(dropdownHeight < height);
    activeTab.view.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) });
  }
}

const hostOf = (url: string): string => (/^https?:/.test(url) && URL.canParse(url) ? new URL(url).host : '');
const unreadOf = (tab: Tab): number => (hostOf(tab.url) ? unreadCount(tab.title) : 0);

// Unread messages per site; two tabs of the same site count once.
function unreadByHost(tabs: Tab[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tab of tabs) {
    const host = hostOf(tab.url);
    if (unreadOf(tab)) counts.set(host, Math.max(counts.get(host) ?? 0, unreadOf(tab)));
  }
  return counts;
}

function updateDockBadge(): void {
  const total = [...unreadByHost(windows.flatMap((w) => w.tabs)).values()].reduce((sum, n) => sum + n, 0);
  app.dock?.setBadge(total ? String(total) : '');
}

function snapshot({ tabs, groups, activeTab }: Win): BrowserState {
  const unread = unreadByHost(tabs);
  return {
    isActivePinned: activeTab ? store.isPinned(activeTab.url) : false,
    tabs: tabs.map((t) => ({ id: t.id, groupId: t.groupId, title: t.title, url: displayUrl(t.url), favicon: t.favicon, loading: t.loading, sleeping: t.sleeping, unread: unreadOf(t), muted: t.view.webContents.isAudioMuted(), audible: t.view.webContents.isCurrentlyAudible() })),
    favorites: store.pinned().map((site) => ({
      url: site.url,
      title: withoutUnread(site.title),
      favicon: site.favicon ?? tabs.find((t) => hostOf(t.url) === hostOf(site.url))?.favicon ?? null,
      unread: unread.get(hostOf(site.url)) ?? 0,
      bar: site.bar,
    })),
    barLimit: BAR_LIMIT,
    groups,
    appearance: store.appearance(),
    adblock: store.adblock(),
    vpn: vpnSupported ? vpnStatus() : null,
    update,
    // Marked only once there is more than one to tell apart.
    profile: listProfiles().length > 1 ? currentProfile() : null,
    activeId: activeTab ? activeTab.id : null,
    canGoBack: activeTab ? activeTab.view.webContents.navigationHistory.canGoBack() : false,
    canGoForward: activeTab ? activeTab.view.webContents.navigationHistory.canGoForward() : false,
  };
}

function broadcast(w: Win): void {
  if (!w.win.isDestroyed() && !w.chrome.webContents.isDestroyed()) w.chrome.webContents.send('state', snapshot(w));
  updateDockBadge();
}

// Incognito and extra profiles say so in the window title.
const windowTitle = (incognito: boolean): string =>
  [APP_NAME, currentProfile().id && `(${currentProfile().name})`, incognito && '(Incognito)'].filter(Boolean).join(' ');

function showProfiles(): void {
  for (const w of windows) {
    if (w.win.isDestroyed()) continue;
    w.win.setTitle(windowTitle(w.incognito));
    broadcast(w);
  }
}

async function deleteProfile(w: Win, id: string): Promise<string> {
  const reason = whyKeep(id);
  if (reason) return reason;
  const name = listProfiles().find((p) => p.id === id)?.name;
  // Cancel is the default, so pressing Return or Escape deletes nothing.
  const { response } = await dialog.showMessageBox(w.win, { type: 'warning', message: `Delete the profile "${name}"?`, detail: 'Its logins, history, favorites and settings are removed. This cannot be undone.', buttons: ['Cancel', 'Delete'], defaultId: 0, cancelId: 0 });
  if (response !== 1) return '';
  const error = removeProfile(id);
  if (error) await dialog.showMessageBox(w.win, { type: 'error', message: error });
  showProfiles();
  return error;
}

const reroute = (): Promise<void> => applyProxy(store.network(), [WEB_PARTITION, ...windows.map((w) => w.partition)]);
const reloadAll = (): void => {
  for (const w of windows) if (w.activeTab) reload(w.activeTab.view.webContents);
};

async function turnVpnOn(w: Win, strict: boolean): Promise<void> {
  try {
    await startVpn(reroute, strict);
    store.setVpn(true);
    reloadAll();
  } catch (err) {
    console.error(`vpn: ${(err as Error).message}`);
    if (!w.win.isDestroyed()) await dialog.showMessageBox(w.win, { type: 'error', message: 'The VPN could not start', detail: (err as Error).message });
  }
}

async function turnVpnOff(): Promise<void> {
  store.setVpn(false);
  await stopVpn(reroute);
  reloadAll();
}

let askingVpn = false;
async function toggleVpn(w: Win): Promise<void> {
  const status = vpnStatus();
  if (!vpnSupported || askingVpn) return;
  if (status === 'on' || status === 'connecting') return turnVpnOff();
  askingVpn = true;
  try {
    if (status === 'error') {
      const { response } = await dialog.showMessageBox(w.win, { type: 'warning', message: 'The VPN is not connected', detail: 'Pages are blocked until it connects, so nothing goes out unprotected. Some networks block WARP.', buttons: ['Try again', 'Turn VPN off', 'Cancel'], defaultId: 0, cancelId: 2 });
      if (response === 0) void turnVpnOn(w, true);
      else if (response === 1) await turnVpnOff();
      return;
    }
    // The first time creates a Cloudflare account, so the user has to agree to its terms.
    while (!vpnRegistered()) {
      const { response } = await dialog.showMessageBox(w.win, { type: 'question', message: 'Turn on the built-in VPN?', detail: `It uses Cloudflare WARP, free and without sign-up. It hides your IP address from websites, but you cannot pick a country. Only Ambaser uses it.\n\nBy continuing you accept Cloudflare's terms:\n${WARP_TERMS}\n\nThe first time, a small tunnel program (wireproxy) is downloaded.`, buttons: ['Cancel', 'Read terms', 'Agree and turn on'], defaultId: 2, cancelId: 0 });
      if (response === 0) return;
      if (response === 2) break;
      createTab(w, WARP_TERMS);
      return;
    }
    void turnVpnOn(w, false);
  } finally {
    askingVpn = false;
  }
}

function activate(w: Win, tab: Tab): void {
  if (w.activeTab === tab) return;
  if (w.activeTab) {
    w.activeTab.lastActive = Date.now();
    w.win.contentView.removeChildView(w.activeTab.view);
  }
  if (tab.sleeping) wake(tab);
  w.pageFullscreen = false;
  w.activeTab = tab;
  w.win.contentView.addChildView(tab.view);
  w.win.contentView.addChildView(w.chrome); // keep the chrome on top so the dropdown is not hidden
  layout(w);
  broadcast(w);
  // Only an empty tab wants the address bar; on a loaded page the selection would just get in the way.
  if (tab.url === BLANK_URL || tab.url === HOME_URL) focusAddress(w);
  else tab.view.webContents.focus();
}

const SLEEP_AFTER_MS = 10 * 60 * 1000;

// Frees a background page's memory by replacing it with about:blank; wake() brings it back.
function sleepTab(w: Win, tab: Tab): void {
  const wc = tab.view.webContents;
  const idle = Date.now() - tab.lastActive > SLEEP_AFTER_MS;
  const keep = tab === w.activeTab || tab.sleeping || tab.loading || !idle || wc.isCurrentlyAudible() || wc.isDevToolsOpened() || !/^https?:/.test(tab.url);
  // Chat and mail stay awake, or new messages would stop showing up.
  if (keep || allowsNotifications(wc.session, tab.url) || unreadOf(tab) || hostOf(tab.url) === 'web.whatsapp.com') return;
  tab.sleeping = true;
  load(wc, 'about:blank');
  broadcast(w);
}

function wake(tab: Tab): void {
  tab.sleeping = false;
  tab.loading = false; // an event ignored while asleep must not leave the spinner on
  const wc = tab.view.webContents;
  const history = wc.navigationHistory;
  if (!history.canGoBack()) return load(wc, tab.url);
  // Drop the blank entry sleeping left behind, so Forward does not lead to an empty page.
  wc.once('did-navigate', () => history.removeEntryAtIndex(history.getActiveIndex() + 1));
  history.goBack();
}

// After switching tabs the keyboard goes to the address bar.
function focusAddress(w: Win): void {
  if (w.chrome.webContents.isDestroyed()) return;
  w.chrome.webContents.focus();
  w.chrome.webContents.send('address:focus');
}

// A group disappears with its last tab.
function pruneGroups({ tabs, groups }: Win): void {
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!tabs.some((t) => t.groupId === groups[i].id)) groups.splice(i, 1);
  }
}

function setGroup(w: Win, tab: Tab, groupId: number | null): void {
  moveToGroup(w.tabs, tab, groupId);
  const group = w.groups.find((g) => g.id === groupId);
  if (group) group.collapsed = false;
  pruneGroups(w);
  broadcast(w);
}

function newGroup(w: Win, tab: Tab): void {
  const id = nextGroupId++;
  w.groups.push({ id, name: '', color: GROUP_COLORS[id % GROUP_COLORS.length], icon: 'none', collapsed: false });
  setGroup(w, tab, id);
  w.chrome.webContents.focus();
  w.chrome.webContents.send('group:edit', id);
}

function dropTab(w: Win, tab: Tab, drop: TabDrop): void {
  const { tabs, groups } = w;
  if (drop.kind === 'end') {
    placeTab(tabs, tab, null, false);
  } else if (drop.kind === 'group') {
    if (groups.some((g) => g.id === drop.groupId)) setGroup(w, tab, drop.groupId);
    return;
  } else {
    const target = findTab(w, drop.tabId);
    if (!target || target === tab) return;
    // Dropping onto the middle of a loose tab makes a new group out of the two.
    if (drop.kind === 'merge') {
      if (target.groupId !== null) return;
      newGroup(w, target);
      if (target.groupId !== null) setGroup(w, tab, target.groupId);
      return;
    }
    placeTab(tabs, tab, target, drop.kind === 'after');
  }
  pruneGroups(w);
  broadcast(w);
}

// Only the tab on screen can be captured, so its thumbnail is kept for after it goes to the background.
async function capture(w: Win, tab: Tab): Promise<void> {
  if (w.activeTab !== tab || !tab.view.getVisible() || tab.url === BLANK_URL || isAppUrl(tab.url)) return;
  try {
    const image = await tab.view.webContents.capturePage();
    if (!image.isEmpty()) tab.preview = `data:image/jpeg;base64,${image.resize({ width: 512 }).toJPEG(70).toString('base64')}`;
  } catch (err) {
    console.error(`preview ${tab.url}: ${(err as Error).message}`);
  }
}

// Hovering any tab also refreshes the visible one, which is the one about to be left.
async function previewTab(w: Win, id: number): Promise<string | null> {
  if (w.activeTab) await capture(w, w.activeTab);
  return findTab(w, id)?.preview ?? null;
}

function closeMany(w: Win, doomed: Tab[]): void {
  for (const t of doomed) closeTab(w, t.id);
}

function showTabMenu(w: Win, tab: Tab): void {
  const wc = tab.view.webContents;
  const others = w.groups.filter((g) => g.id !== tab.groupId);
  Menu.buildFromTemplate([
    { label: 'Add tab to new group', click: () => newGroup(w, tab) },
    {
      label: 'Add tab to group',
      visible: others.length > 0,
      submenu: others.map((g) => ({ label: g.name || `Unnamed (${g.color})`, click: () => setGroup(w, tab, g.id) })),
    },
    { label: 'Remove from group', visible: tab.groupId !== null, click: () => setGroup(w, tab, null) },
    { type: 'separator' },
    { label: wc.isAudioMuted() ? 'Unmute tab' : 'Mute tab', click: () => {
      wc.setAudioMuted(!wc.isAudioMuted());
      broadcast(w);
    } },
    { type: 'separator' },
    { label: 'Close tab', click: () => closeTab(w, tab.id) },
    { label: 'Close other tabs', enabled: w.tabs.length > 1, click: () => closeMany(w, w.tabs.filter((t) => t !== tab)) },
    { label: 'Close tabs to the right', enabled: w.tabs.indexOf(tab) < w.tabs.length - 1, click: () => closeMany(w, w.tabs.slice(w.tabs.indexOf(tab) + 1)) },
    { label: 'Close all tabs', click: () => closeMany(w, [...w.tabs]) },
  ]).popup({ window: w.win });
}

function closeTab(w: Win, id: number): void {
  const { win, tabs } = w;
  const index = tabs.findIndex((t) => t.id === id);
  if (index === -1) return;
  const [tab] = tabs.splice(index, 1);
  if (w.activeTab === tab) {
    win.contentView.removeChildView(tab.view);
    w.activeTab = null;
  }
  const address = displayUrl(tab.url);
  if (/^https?:/.test(address)) w.closed.push(address);
  tab.view.webContents.close();
  pruneGroups(w);
  if (tabs.length === 0) {
    createTab(w, HOME_URL);
    return;
  }
  if (!w.activeTab) activate(w, tabs[Math.min(index, tabs.length - 1)]);
  broadcast(w);
}

const MAX_TABS = 50;
const warning = new WeakSet<Win>(); // one message at a time, even when many tabs are refused at once

function createTab(w: Win, url: string, groupId: number | null = null): void {
  const { tabs } = w;
  if (tabs.length >= MAX_TABS) {
    if (!warning.has(w)) {
      warning.add(w);
      void dialog.showMessageBox(w.win, { type: 'info', message: `Tab limit reached (${MAX_TABS})`, detail: 'Close a tab to open another.' }).then(() => warning.delete(w));
    }
    return;
  }
  const view = new WebContentsView({ webPreferences: { ...webPreferences, partition: w.partition, preload: PAGE_PRELOAD } });
  const tab: Tab = { id: nextId++, groupId: null, view, title: 'New Tab', url, favicon: null, loading: false, preview: null, sleeping: false, lastActive: Date.now() };
  tabs.push(tab);
  moveToGroup(tabs, tab, groupId);
  const wc = view.webContents;

  // Only http, https, about:blank and our own pages may load, and websites cannot send you to our pages.
  const allowed = (target: string): boolean => isAllowedUrl(target) && (!isAppUrl(target) || isAppUrl(wc.getURL()));
  const guard = (event: { preventDefault(): void }, target: string): void => {
    if (!allowed(target)) event.preventDefault();
  };
  wc.on('will-navigate', (event, target) => {
    if (isAppUrl(target) && runPageAction(wc, target)) event.preventDefault();
    else if (isExternal(target)) {
      event.preventDefault();
      void openExternal(wc, target);
    } else guard(event, target);
  });
  // A redirect is never allowed into our pages, whatever page the tab is still showing.
  wc.on('will-redirect', (event, target) => {
    if (!isAllowedUrl(target) || isAppUrl(target)) event.preventDefault();
  });

  // Popups open as new tabs, never as native windows. Disallowed URLs are dropped.
  wc.setWindowOpenHandler(({ url: target, disposition }) => {
    if (isExternal(target)) void openExternal(wc, target);
    else if (allowed(target) && !isAppUrl(target)) {
      // A sized popup (typically a sign-in) needs a real window, so it can report back to its page.
      if (disposition === 'new-window') {
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { ...webPreferences, partition: w.partition, preload: PAGE_PRELOAD } } };
      }
      createTab(w, target, tab.groupId); // stays in the opener's group
    }
    return { action: 'deny' };
  });
  wc.on('did-create-window', (popup) => setUpPopup(popup));
  wc.on('context-menu', (_event, params) => showContextMenu(wc, params, (url) => createTab(w, url, tab.groupId)));
  // Trackpad swipe for back and forward; the page preload follows the fingers and asks here.
  const canSwipe = (direction: unknown): boolean => (direction === 'back' ? wc.navigationHistory.canGoBack() : wc.navigationHistory.canGoForward());
  wc.ipc.handle('swipe:can', (_event, direction) => canSwipe(direction));
  wc.ipc.on('swipe:go', (_event, direction) => {
    if (w.activeTab !== tab || !canSwipe(direction)) return;
    if (direction === 'back') goBack(wc);
    else wc.navigationHistory.goForward();
  });
  wc.on('input-event', (_event, input) => {
    if (input.type === 'gestureScrollEnd' || input.type === 'gestureFlingStart') wc.send('swipe:end');
  });

  // Switching tabs also hides a page; only the tab still on screen means the browser itself went away.
  wc.ipc.on('page:visibility', (_event, hidden) => autoPictureInPicture(wc, hidden === true && w.activeTab === tab));
  wc.ipc.on('pip:back', () => {
    if (!w.tabs.includes(tab)) return;
    if (w.win.isMinimized()) w.win.restore();
    w.win.show();
    app.focus({ steal: true });
    activate(w, tab);
    wc.focus(); // so Space and the other video keys go to the page right away
  });
  wc.on('found-in-page', (_event, result) => {
    if (w.activeTab === tab) w.chrome.webContents.send('find:result', result.activeMatchOrdinal, result.matches);
  });
  wc.on('enter-html-full-screen', () => {
    w.pageFullscreen = true;
    layout(w);
  });
  wc.on('leave-html-full-screen', () => {
    w.pageFullscreen = false;
    layout(w);
  });
  wc.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') load(wc, loadErrorUrl(tab.url, 0, 'PAGE_CRASHED'));
  });

  wc.on('page-title-updated', (event, title) => {
    event.preventDefault();
    if (tab.sleeping) return;
    tab.title = title;
    if (!w.incognito) retitle(tab.url, title);
    broadcast(w);
  });
  wc.on('audio-state-changed', () => broadcast(w)); // the speaker icon on the tab
  wc.on('page-favicon-updated', (_event, favicons) => {
    if (tab.sleeping) return;
    tab.favicon = favicons[0] ?? null;
    if (tab.favicon && !w.incognito) setFavicon(tab.url, tab.favicon);
    broadcast(w);
  });
  const onNav = (): void => {
    if (tab.sleeping) return;
    tab.url = wc.getURL() || BLANK_URL;
    tab.preview = null; // it showed the previous page
    if (!w.incognito) recordVisit(tab.url, wc.getTitle() || tab.url);
    broadcast(w);
  };
  wc.on('did-navigate', onNav);
  wc.on('did-navigate-in-page', (_event, _url, isMainFrame) => {
    if (isMainFrame) onNav();
  });
  // The spinner reflects this tab's own top-level navigation only. "did-start-loading" instead
  // reflects the whole frame tree (every iframe, and a page's own background fetches, a kept-open
  // WebSocket among them on some sites) and can restart long after the page itself finished
  // loading, which used to leave the spinner turning with nowhere to stop.
  let loadWatchdog: ReturnType<typeof setTimeout> | undefined;
  const stopSpinner = (): void => {
    clearTimeout(loadWatchdog);
    if (tab.sleeping || !tab.loading) return;
    tab.loading = false;
    broadcast(w);
  };
  wc.on('did-start-navigation', (details) => {
    if (tab.sleeping || !details.isMainFrame || details.isSameDocument) return;
    tab.loading = true;
    broadcast(w);
    // Whatever this page's own connections do afterwards, the spinner itself waits no longer than this.
    clearTimeout(loadWatchdog);
    loadWatchdog = setTimeout(stopSpinner, 20000);
  });
  wc.on('did-finish-load', stopSpinner);
  wc.on('did-stop-loading', () => {
    stopSpinner();
    if (tab.sleeping) return;
    setTimeout(() => {
      if (!wc.isDestroyed()) void capture(w, tab);
    }, 500); // give the page a moment to paint
  });
  wc.on('did-fail-load', (_event, code, description, validatedUrl, isMainFrame) => {
    // -3 is ERR_ABORTED, raised on every user cancel or redirect; not an error to show.
    if (code === -3 || !isMainFrame || isAppUrl(validatedUrl)) return;
    console.error(`load failed ${validatedUrl}: ${code} ${description}`);
    // Show our own page instead of a blank one; -200..-299 are Chromium's certificate errors.
    load(wc, code <= -200 && code >= -299 ? certErrorUrl(validatedUrl, code) : loadErrorUrl(validatedUrl, code, description));
  });

  // A loading home page takes the keyboard; hand it back so a new tab is ready for typing.
  if (url === HOME_URL) {
    wc.once('did-finish-load', () => {
      if (w.activeTab === tab && !w.chrome.webContents.isDestroyed()) w.chrome.webContents.focus();
    });
  }
  activate(w, tab);
  if (url !== BLANK_URL) load(wc, url);
  else broadcast(w);
}

// A popup has no address bar, so its title always starts with the site it is really on.
function setUpPopup(popup: BrowserWindow): void {
  const wc = popup.webContents;
  const guard = (event: { preventDefault(): void }, target: string): void => {
    if (!isAllowedUrl(target) || isAppUrl(target)) event.preventDefault();
  };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  const retitle = (): void => {
    if (!popup.isDestroyed()) popup.setTitle(`${URL.canParse(wc.getURL()) ? new URL(wc.getURL()).host : ''} — ${wc.getTitle()}`);
  };
  popup.on('page-title-updated', (event) => {
    event.preventDefault();
    retitle();
  });
  wc.on('did-navigate', retitle);
}

function stopFind(w: Win): void {
  w.finding = false;
  w.activeTab?.view.webContents.stopFindInPage('clearSelection');
}

// Reloading an error page retries the address that failed.
function reload(wc: WebContents): void {
  const url = wc.getURL();
  if (displayUrl(url) !== url) load(wc, displayUrl(url));
  else wc.reload();
}

// From an error page, step over every entry of the failed address, or "back" would only fail again.
function goBack(wc: WebContents): void {
  const history = wc.navigationHistory;
  const failed = displayUrl(wc.getURL());
  let index = history.getActiveIndex() - 1;
  if (failed !== wc.getURL()) {
    while (index >= 0 && displayUrl(history.getEntryAtIndex(index).url) === failed) index--;
  }
  if (index >= 0) history.goToIndex(index);
}

function load(wc: WebContents, url: string): void {
  // loadURL rejects on aborted loads (e.g. a redirect replaced it); that is not a failure to surface.
  wc.loadURL(url).catch((err: Error) => console.error(`loadURL ${url}: ${err.message}`));
}

// Only a window's own chrome UI may send commands for it. Messages from web content are rejected.
const windowOf = (sender: WebContents): Win | undefined =>
  windows.find((w) => !w.chrome.webContents.isDestroyed() && w.chrome.webContents === sender);

function onCommand(channel: string, handler: (w: Win, ...args: unknown[]) => void): void {
  ipcMain.on(channel, (event: IpcMainEvent, ...args) => {
    const w = windowOf(event.sender);
    if (w) handler(w, ...args);
  });
}

function onQuery(channel: string, handler: (w: Win, arg: string) => unknown): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, arg) => {
    const w = windowOf(event.sender);
    if (!w || typeof arg !== 'string') throw new Error(`rejected ${channel}`);
    return handler(w, arg);
  });
}

// The active tab's site. Taken from the tab itself, never from what the UI says.
function siteInfo(w: Win): SiteInfo | null {
  const tab = w.activeTab;
  const url = tab ? displayUrl(tab.url) : '';
  if (!tab || !/^https?:/.test(url) || !URL.canParse(url)) return null;
  const ses = tab.view.webContents.session;
  const { origin, host, protocol } = new URL(url);
  return {
    origin,
    host,
    secure: protocol === 'https:',
    acceptedCertificate: protocol === 'https:' && hasAcceptedCertificate(ses, host),
    permissions: secureOrigin(url) ? sitePermissions(ses, origin) : null,
  };
}

// Changes apply only while the tab is still on the site the user was looking at.
function onSite(w: Win, origin: unknown, change: (ses: Electron.Session, site: SiteInfo) => void): void {
  const site = siteInfo(w);
  if (site && site.origin === origin && w.activeTab) change(w.activeTab.view.webContents.session, site);
}

// Asks Google for completions. Sent without cookies; a failure just means no suggestions.
async function fetchSuggestions(input: string): Promise<string[]> {
  const query = suggestQuery(input);
  if (!query) return [];
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&q=${encodeURIComponent(query)}`;
  try {
    const response = await net.fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(2000) });
    return response.ok ? parseSuggestions(await response.json()) : [];
  } catch (err) {
    console.error(`suggest: ${(err as Error).message}`);
    return [];
  }
}

function findTab(w: Win, id: unknown): Tab | undefined {
  return typeof id === 'number' ? w.tabs.find((t) => t.id === id) : undefined;
}

// A QR code of the page on screen, made here so the address is not sent anywhere. The image is null
// when the address is too long for one.
function pageQr(w: Win): { url: string; image: string | null } | null {
  const url = w.activeTab ? displayUrl(w.activeTab.url) : '';
  if (!/^https?:/.test(url)) return null;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return { url, image: qr.createDataURL(6, 24) };
  } catch {
    return { url, image: null };
  }
}

function registerIpc(): void {
  onQuery('page:qr', (w) => pageQr(w));
  onQuery('profiles:list', () => ({ current: currentProfile().id, profiles: listProfiles() }));
  onQuery('profiles:open', (_w, id) => openProfile(id));
  onQuery('profiles:add', (_w, name) => {
    const error = addProfile(name);
    showProfiles();
    return error;
  });
  onQuery('profiles:update', (_w, json) => {
    const { id, name, color } = JSON.parse(json);
    const error = updateProfile(String(id), String(name), color);
    showProfiles();
    return error;
  });
  onQuery('profiles:remove', (w, id) => deleteProfile(w, id));
  onCommand('tab:new', (w, url) => {
    const target = typeof url === 'string' ? normalizeInput(url) : null;
    createTab(w, target ?? HOME_URL);
  });
  onCommand('pin:bar', (_w, url, on) => {
    if (typeof url !== 'string' || typeof on !== 'boolean') return;
    store.setBar(url, on);
    for (const win of windows) broadcast(win);
  });
  onCommand('pin:remove', (_w, url) => {
    if (typeof url !== 'string') return;
    store.unpin(url);
    for (const win of windows) broadcast(win);
  });
  onCommand('tabs:overflow', (w, ids) => {
    if (!Array.isArray(ids)) return;
    const hidden = w.tabs.filter((t) => ids.includes(t.id));
    const shorten = (text: string): string => (text.length > 50 ? `${text.slice(0, 49)}…` : text);
    Menu.buildFromTemplate(hidden.map((t) => ({ label: shorten(t.title || t.url), click: () => activate(w, t) }))).popup({ window: w.win });
  });
  onCommand('page:focus', (w) => {
    const tab = w.activeTab;
    if (!tab) return;
    // An empty tab has nothing to type into, so the address bar gets the keyboard, as when switching to it.
    if (tab.url === BLANK_URL || tab.url === HOME_URL) focusAddress(w);
    else tab.view.webContents.focus();
  });
  onCommand('vpn:toggle', (w) => void toggleVpn(w));
  onCommand('adblock:toggle', (w) => {
    store.setAdblock(!store.adblock());
    applyAdblock();
    if (w.activeTab) reload(w.activeTab.view.webContents);
    for (const win of windows) broadcast(win);
  });
  onCommand('window:incognito', () => createWindow(true));
  onCommand('page:devtools', ({ activeTab }) => activeTab?.view.webContents.toggleDevTools());
  onCommand('tab:close', (w, id) => closeTab(w, Number(id)));
  onCommand('tab:activate', (w, id) => {
    const tab = findTab(w, id);
    if (tab) activate(w, tab);
  });
  onCommand('window:action', ({ win }, action) => {
    if (action === 'close') win.close();
    else if (action === 'minimize') win.minimize();
    else if (action === 'fullscreen') win.setFullScreen(!win.isFullScreen());
  });
  onCommand('tab:drop', (w, id, drop) => {
    const tab = findTab(w, id);
    if (tab && typeof drop === 'object' && drop !== null) dropTab(w, tab, drop as TabDrop);
  });
  onCommand('tab:menu', (w, id) => {
    const tab = findTab(w, id);
    if (tab) showTabMenu(w, tab);
  });
  onCommand('group:update', (w, id, patch) => {
    const group = w.groups.find((g) => g.id === id);
    if (!group) return;
    patchGroup(group, patch);
    broadcast(w);
  });
  onCommand('group:ungroup', (w, id) => {
    for (const tab of w.tabs) if (tab.groupId === id) tab.groupId = null;
    pruneGroups(w);
    broadcast(w);
  });
  onCommand('group:close', (w, id) => {
    for (const tab of w.tabs.filter((t) => t.groupId === id)) closeTab(w, tab.id);
  });
  onCommand('nav:go', (w, input) => {
    const target = typeof input === 'string' ? normalizeInput(input) : null;
    if (!target || !w.activeTab) return;
    load(w.activeTab.view.webContents, target);
  });
  onCommand('nav:back', ({ activeTab }) => {
    if (activeTab) goBack(activeTab.view.webContents);
  });
  onCommand('nav:forward', ({ activeTab }) => {
    if (activeTab?.view.webContents.navigationHistory.canGoForward()) activeTab.view.webContents.navigationHistory.goForward();
  });
  onCommand('nav:reload', ({ activeTab }) => {
    if (activeTab) reload(activeTab.view.webContents);
  });
  onCommand('nav:home', (w) => {
    if (w.activeTab) load(w.activeTab.view.webContents, HOME_URL);
  });
  onCommand('pin:toggle', (w) => {
    const tab = w.activeTab;
    if (!tab || !/^https?:/.test(tab.url)) return;
    store.togglePin({ url: tab.url, title: tab.title, favicon: tab.favicon });
    broadcast(w);
  });
  onCommand('dropdown:height', (w, height) => {
    w.dropdownHeight = typeof height === 'number' && Number.isFinite(height) ? Math.round(height) : 0;
    layout(w);
  });
  onCommand('appearance:set', (_w, input) => {
    store.setAppearance(parseAppearance(input));
    applyAppearance();
    for (const w of windows) {
      broadcast(w);
      for (const tab of w.tabs) if (tab.url === HOME_URL) tab.view.webContents.reload(); // it reads the theme when it loads
    }
  });
  onQuery('site:info', (w) => siteInfo(w));
  onQuery('site:permission', (w, json) => {
    const { origin, kind, value } = JSON.parse(json);
    onSite(w, origin, (ses, site) => {
      if (site.permissions) setSitePermission(ses, site.origin, kind, value);
    });
  });
  onQuery('site:forget-certificate', (w, origin) => onSite(w, origin, (ses, site) => forgetCertificate(ses, site.host)));
  onQuery('history:search', (_w, query) => searchHistory(allHistory(), query));
  onQuery('history:remove', (_w, url) => removeVisit(url));
  onQuery('downloads:list', (w) => downloadList(w.partition));
  onCommand('downloads:action', (w, id, action) => {
    if (typeof id === 'number' && typeof action === 'string') downloadAction(w.partition, id, action);
  });
  onDownloadsChange(() => {
    for (const w of windows) if (!w.chrome.webContents.isDestroyed()) w.chrome.webContents.send('downloads:update', downloadList(w.partition));
  });
  onQuery('history:list', (_w, query) => searchHistory(allHistory(), query, Infinity));
  onQuery('history:clear', () => clearHistory());
  onQuery('tab:preview', (w, id) => previewTab(w, Number(id)));
  onCommand('find:query', (w, text, forward, next) => {
    const wc = w.activeTab?.view.webContents;
    if (!wc || typeof text !== 'string') return;
    w.finding = true;
    // findNext true starts a new search; false steps through the current one.
    if (text) wc.findInPage(text, { forward: forward !== false, findNext: next !== true });
    else wc.stopFindInPage('clearSelection');
  });
  onCommand('find:stop', stopFind);
  onQuery('data:clear', async (w, kind) => {
    const warnings: Record<string, string> = {
      cache: 'Clear the cache?',
      cookies: 'Clear cookies and site data? You will be signed out of websites.',
      history: 'Clear all browsing history?',
      all: 'Clear everything? History, cache, cookies and site data are removed, and you will be signed out of websites.',
    };
    if (!Object.hasOwn(warnings, kind)) return false;
    // Cancel is the default, so pressing Return or Escape deletes nothing.
    const { response } = await dialog.showMessageBox(w.win, { type: 'warning', message: warnings[kind], detail: 'This cannot be undone.', buttons: ['Cancel', 'Clear'], defaultId: 0, cancelId: 0 });
    if (response !== 1) return false;
    const ses = session.fromPartition(WEB_PARTITION); // incognito partitions live in memory only
    const all = kind === 'all';
    if (all || kind === 'cache') await ses.clearCache();
    if (all || kind === 'cookies') await ses.clearStorageData();
    if (all || kind === 'history') clearHistory();
    return true;
  });
  onQuery('app:version', () => app.getVersion());
  // Updates a git checkout: pull, install new dependencies if the lock file changed, restart. Resolves to a message.
  // A git checkout updates with git pull. Anything else downloads the ZIP from the update server with the PIN.
  // Either way: install new packages if the lock file changed, then offer a restart. Resolves to a message.
  onQuery('app:update', async (w, pin) => {
    const root = app.getAppPath();
    const sh = (cmd: string) => promisify(exec)(cmd, { cwd: root, timeout: 180000 });
    const lockFile = path.join(root, 'package-lock.json');
    const lock = (): string => (fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : '');
    try {
      const before = lock();
      if (fs.existsSync(path.join(root, '.git'))) {
        const { stdout } = await sh('git pull --ff-only');
        if (/already up to date/i.test(stdout)) return 'Already up to date';
      } else {
        if (!updateUrl()) return 'No update server is set (updateUrl in package.json)';
        if (!pin) return 'Enter the PIN first';
        const res = await net.fetch(`${updateUrl()}/download`, { method: 'POST', headers: { 'X-Pin': pin } });
        if (res.status === 401) return 'Wrong PIN';
        if (!res.ok) return `Download failed (${res.status})`;
        const zip = path.join(app.getPath('temp'), 'ambaser-update.zip');
        fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
        await sh(`tar -xf "${zip}" -C "${root}" --strip-components=1`); // GitHub puts everything in one top folder
        fs.rmSync(zip, { force: true });
      }
      if (lock() !== before) await sh('npm install --no-audit --no-fund');
      const { response } = await dialog.showMessageBox(w.win, { type: 'info', message: 'Update downloaded', detail: 'Restart now to use it? Your tabs are restored.', buttons: ['Later', 'Restart'], defaultId: 1, cancelId: 0 });
      if (response !== 1) return 'Updated. Restart to use it';
      app.relaunch();
      app.exit(0);
      return 'Restarting…';
    } catch (err) {
      return `Update failed: ${String((err as { stderr?: string }).stderr || (err as Error).message).trim().split(/\r?\n/)[0]}`;
    }
  });
  onQuery('network:get', () => store.network());
  onQuery('network:set', async (_w, json) => {
    const settings = parseNetwork(JSON.parse(json));
    if (typeof settings === 'string') return settings;
    try {
      applyDns(settings);
      await applyProxy(settings, [WEB_PARTITION, ...windows.map((w) => w.partition)]);
    } catch (err) {
      return `Could not apply: ${(err as Error).message}`;
    }
    store.setNetwork(settings);
    return '';
  });
  // Incognito typing is never sent to Google.
  onQuery('suggest', (w, query) => (w.incognito ? [] : fetchSuggestions(query)));
}

// The macOS blur material: "hud" is always dark, so light mode needs another one.
const glass = (): 'hud' | 'under-window' => (nativeTheme.shouldUseDarkColors ? 'hud' : 'under-window');

// Setting themeSource drives prefers-color-scheme in every page, including websites.
function applyAppearance(): void {
  nativeTheme.themeSource = store.appearance().mode;
}

function createWindow(incognito = false, saved: SavedTab[] = []): Win {
  const chromePreferences = { ...webPreferences, preload: path.join(__dirname, '../preload/preload.js') };
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: windowTitle(incognito),
    icon: ICON, // Windows and Linux; macOS uses the Dock icon set at startup
    autoHideMenuBar: true, // Windows/Linux: hidden until Alt is pressed; shortcuts keep working
    show: false, // shown once the chrome UI has painted, so there is no blank flash
    backgroundColor: '#1f2125',
    // macOS glass: the system blurs what is behind the window; the chrome draws its own window buttons.
    ...(IS_MAC ? { titleBarStyle: 'hidden' as const, vibrancy: glass(), visualEffectState: 'active' as const, backgroundColor: '#00000000' } : {}),
    webPreferences: chromePreferences,
  });
  const chrome = new WebContentsView({ webPreferences: chromePreferences });
  // A partition without "persist:" lives in memory only.
  const partition = incognito ? `incognito-${++incognitoCount}` : WEB_PARTITION;
  const w: Win = { win, chrome, tabs: [], groups: [], activeTab: null, dropdownHeight: 0, incognito, partition, pageFullscreen: false, finding: false, closed: [] };
  registerPages(partition);
  guardPermissions(partition);
  watchDownloads(partition, () => {
    // The list pops up in the window being used, or else the first one of this session.
    const own = windows.filter((o) => o.partition === partition);
    (own.find((o) => o.win.isFocused()) ?? own[0])?.chrome.webContents.send('downloads:started');
  });
  watchAdblock(partition);
  allowGoogleLogin(partition);
  windows.push(w);
  if (incognito) void applyProxy(store.network(), [partition]);

  chrome.setBackgroundColor('#00000000'); // lets the page show around the dropdown
  win.contentView.addChildView(chrome);
  layout(w);
  win.on('resize', () => layout(w));
  if (IS_MAC) {
    const hideNativeButtons = (): void => win.setWindowButtonVisibility(false);
    hideNativeButtons();
    win.on('leave-full-screen', hideNativeButtons);
  }
  // Remembered so the next start can reopen these tabs; incognito tabs are never saved.
  win.on('close', () => {
    if (incognito) return;
    // A tab showing an error page is saved as the page that failed, so being offline does not lose it.
    const open = w.tabs.map((t) => ({ url: displayUrl(t.url), title: t.title, favicon: t.favicon, groupId: t.groupId, active: t === w.activeTab }));
    store.setLastSession(open.filter((t) => isRestorable(t.url)), w.groups);
  });
  win.on('closed', () => {
    windows.splice(windows.indexOf(w), 1);
    for (const tab of w.tabs.splice(0)) tab.view.webContents.close();
    chrome.webContents.close();
    updateDockBadge();
  });

  chrome.webContents.once('did-finish-load', () => win.show());
  chrome.webContents.on('did-finish-load', () => {
    broadcast(w);
    const url = w.activeTab?.url;
    if (!url || url === BLANK_URL || url === HOME_URL) focusAddress(w);
    else w.activeTab?.view.webContents.focus();
  });
  chrome.webContents.on('did-fail-load', (_e, code, desc, url) => console.error(`chrome load failed ${url}: ${code} ${desc}`));
  chrome.webContents.on('preload-error', (_e, file, err) => console.error(`preload error ${file}: ${err.message}`));
  chrome.webContents.on('console-message', (event) => console.log(`[chrome] ${event.message}`));
  void chrome.webContents.loadFile(path.join(__dirname, '../renderer/index.html'), { query: incognito ? { incognito: '1' } : {} });
  if (saved.length === 0) createTab(w, HOME_URL);
  else restoreTabs(w, saved);
  return w;
}

// The first window of a run (or after all were closed) reopens the tabs that were open last time.
function reopenWindow(): void {
  createWindow(false, store.lastSession().filter((t) => isRestorable(t.url)));
}

const isRestorable = (url: string): boolean => url === HOME_URL || (/^https?:/.test(url) && isAllowedUrl(url));

// Puts back the saved tabs, their groups and the tab that was in front.
function restoreTabs(w: Win, saved: SavedTab[]): void {
  const groups = reviveGroups(store.lastGroups(), saved.map((t) => t.groupId), () => nextGroupId++);
  w.groups.push(...groups.values());
  for (const site of saved) createTab(w, site.url, groups.get(site.groupId ?? -1)?.id ?? null);
  const front = w.tabs[saved.findIndex((t) => t.active)];
  if (front) activate(w, front);
}

// Runs something on the focused window, if there is one.
function onWindow(action: (w: Win) => void): () => void {
  return () => {
    const w = focusedWindow();
    if (w) action(w);
  };
}

function zoom(step: number | null): () => void {
  return onWindow(({ activeTab }) => {
    const wc = activeTab?.view.webContents;
    if (wc) wc.setZoomLevel(step === null ? 0 : Math.max(-3, Math.min(5, wc.getZoomLevel() + step)));
  });
}

// Sends the keyboard to the browser's own bar and tells it what to open.
function toChrome(channel: string): () => void {
  return onWindow((w) => {
    w.chrome.webContents.focus();
    w.chrome.webContents.send(channel);
  });
}

function stepTab(step: number): () => void {
  return onWindow((w) => {
    const index = w.tabs.findIndex((t) => t === w.activeTab);
    const tab = w.tabs[(index + step + w.tabs.length) % w.tabs.length];
    if (tab) activate(w, tab);
  });
}

function reopenTab(): void {
  const w = focusedWindow();
  const url = w?.closed.pop();
  if (w && url) createTab(w, url);
}

function openTab(): void {
  const w = focusedWindow();
  if (w) createTab(w, HOME_URL);
  else createWindow();
}

// Replacing the default menu, so the standard app, edit and window menus (copy, paste, quit) stay.
function buildMenu(): void {
  const page = (): WebContents | undefined => focusedWindow()?.activeTab?.view.webContents;
  // Chrome's shortcuts that have no menu entry of their own.
  const hidden = (accelerator: string, click: () => void): Electron.MenuItemConstructorOptions => ({ label: accelerator, accelerator, visible: false, click });
  const active = (): Tab | null | undefined => focusedWindow()?.activeTab;
  const showTab = (index: number): void => {
    const w = focusedWindow();
    const tab = w?.tabs[index < 0 ? w.tabs.length - 1 : index];
    if (w && tab) activate(w, tab);
  };
  const back = (): void => {
    const wc = page();
    if (wc) goBack(wc);
  };
  const forward = (): void => {
    const history = page()?.navigationHistory;
    if (history?.canGoForward()) history.goForward();
  };
  const extra = [
    // 1 to 8 pick that tab, 9 the last one.
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => hidden(`CmdOrCtrl+${n}`, () => showTab(n === 9 ? -1 : n - 1))),
    hidden('CmdOrCtrl+Alt+Right', stepTab(1)),
    hidden('CmdOrCtrl+Alt+Left', stepTab(-1)),
    hidden('CmdOrCtrl+Shift+]', stepTab(1)),
    hidden('CmdOrCtrl+Shift+[', stepTab(-1)),
  ];
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(IS_MAC ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'File',
        submenu: [
          { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: openTab },
          { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
          { label: 'New Incognito Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow(true) },
          { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: reopenTab },
          { type: 'separator' },
          { label: 'Open Address Bar', accelerator: 'CmdOrCtrl+L', click: toChrome('address:focus') },
          { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: toChrome('find:show') },
          { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: stepTab(1) },
          { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: stepTab(-1) },
          {
            label: 'Close Tab',
            accelerator: 'CmdOrCtrl+W',
            click: () => {
              const w = focusedWindow();
              if (w?.activeTab) closeTab(w, w.activeTab.id);
            },
          },
          { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', click: () => focusedWindow()?.win.close() },
          { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => page()?.print() },
          ...extra,
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { label: 'Reload Page', accelerator: 'CmdOrCtrl+R', click: () => {
          const wc = page();
          if (wc) reload(wc);
        } },
          { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => page()?.reloadIgnoringCache() },
          hidden('CmdOrCtrl+Alt+I', () => page()?.toggleDevTools()),
          { label: 'Toggle Developer Tools', accelerator: 'F12', click: () => page()?.toggleDevTools() },
          { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', visible: false, click: () => page()?.toggleDevTools() },
          { label: 'Toggle Browser UI Developer Tools', accelerator: 'CmdOrCtrl+Alt+Shift+I', click: () => focusedWindow()?.chrome.webContents.toggleDevTools() },
          { role: 'togglefullscreen' },
          { type: 'separator' },
          { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: zoom(0.5) },
          { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', visible: false, click: zoom(0.5) },
          { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: zoom(-0.5) },
          { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: zoom(null) },
          { type: 'separator' },
          { label: 'Reset Site Permissions', click: () => {
            resetPermissions();
            forgetCertificates();
          } },
          { label: 'Open Downloads Folder', click: () => void shell.openPath(app.getPath('downloads')) },
        ],
      },
      {
        label: 'History',
        submenu: [
          { label: 'Back', accelerator: 'CmdOrCtrl+[', click: back },
          { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: forward },
          { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => {
            const wc = page();
            if (wc) load(wc, HOME_URL);
          } },
          { label: 'Pin or Unpin This Page', accelerator: 'CmdOrCtrl+D', click: () => {
            const tab = active();
            if (!tab || !/^https?:/.test(tab.url)) return;
            store.togglePin({ url: tab.url, title: tab.title, favicon: tab.favicon });
            for (const w of windows) broadcast(w);
          } },
          { type: 'separator' },
          {
            label: 'Show History',
            accelerator: IS_MAC ? 'Cmd+Y' : 'Ctrl+H', // Cmd+H hides the app on macOS
            click: () => {
              const w = focusedWindow() ?? createWindow();
              w.chrome.webContents.focus();
              w.chrome.webContents.send('history:show');
            },
          },
        ],
      },
      { role: 'windowMenu' },
    ]),
  );
}

app.whenReady().then(async () => {
  app.dock?.setIcon(ICON);
  loadHistory();
  loadStore();
  void checkVersion();
  setInterval(() => void checkVersion(), 60 * 60 * 1000);
  applyAppearance();
  nativeTheme.on('updated', () => {
    if (IS_MAC) for (const w of windows) w.win.setVibrancy(glass());
  });
  // Network settings go in before the first page loads.
  applyDns(store.network());
  await applyProxy(store.network(), [WEB_PARTITION]);
  onVpnChange(() => {
    for (const w of windows) broadcast(w);
  });
  app.on('web-contents-created', (_event, wc) => guardWebRtc(wc));
  // Left on last time: route into it before any page loads, and give it a moment to connect.
  if (vpnSupported && store.vpn()) {
    const started = startVpn(reroute, true).catch((err: Error) => console.error(`vpn: ${err.message}`));
    await Promise.race([started, new Promise((resolve) => setTimeout(resolve, 8000))]);
  }
  registerIpc();
  buildMenu();
  watchProfiles(showProfiles);
  void loadAdblock(WEB_PARTITION); // not awaited: the first start downloads the filter lists
  reopenWindow();
  setInterval(() => {
    for (const w of windows) for (const tab of w.tabs) sleepTab(w, tab);
  }, 60 * 1000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) return reopenWindow();
    // While a picture-in-picture window is up, macOS counts it as open and does not bring back a minimized one.
    if (windows.every((w) => w.win.isMinimized())) windows[windows.length - 1]?.win.restore();
  });
});

app.on('window-all-closed', () => {
  // An extra profile quits with its last window, even on macOS, so it frees its memory and can be deleted.
  if (process.platform !== 'darwin' || currentProfile().id) app.quit();
});

// Electron rejects bad certificates. Accept one only for a host the user trusted on the warning page.
app.on('certificate-error', (event, webContents, url, _error, certificate, callback) => {
  event.preventDefault();
  callback(isTrusted(webContents.session, url, certificate.fingerprint));
});
