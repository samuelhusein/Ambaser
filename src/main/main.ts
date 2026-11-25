import { app, BrowserWindow, ipcMain, Menu, net, session, shell, WebContentsView, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import * as path from 'path';
import { BLANK_URL, HOME_URL, certErrorUrl, displayUrl, isAllowedUrl, isAppUrl, loadErrorUrl, normalizeInput } from '../shared/url';
import { isTrusted, registerPages, registerScheme, runPageAction } from './app-pages';
import { applyDns, applyProxy } from './network';
import { loadStore, store } from './store';
import { guardPermissions, resetPermissions } from './permissions';
import { isExternal, openExternal, showContextMenu, watchDownloads } from './web-features';
import { parseNetwork } from '../shared/network';
import { parseSuggestions, searchHistory, suggestQuery } from '../shared/suggest';
import { GROUP_COLORS, moveToGroup, patchGroup, placeTab } from '../shared/groups';
import { allHistory, clearHistory, loadHistory, recordVisit, removeVisit, retitle } from './history';
import type { BrowserState, GroupState, TabDrop } from '../shared/types';

const CHROME_HEIGHT = 112; // tab strip 40 + toolbar 44 + favorites bar 28
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

// Renamed from MyBrowser: keep the old data folder so history, pins and logins carry over.
const dataFolder = app.getPath('userData');
app.setName(APP_NAME);
app.setPath('userData', dataFolder);

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

function snapshot({ tabs, groups, activeTab }: Win): BrowserState {
  return {
    isActivePinned: activeTab ? store.isPinned(activeTab.url) : false,
    favorites: store.pinned(),
    tabs: tabs.map((t) => ({ id: t.id, groupId: t.groupId, title: t.title, url: displayUrl(t.url), favicon: t.favicon, loading: t.loading, sleeping: t.sleeping })),
    groups,
    activeId: activeTab ? activeTab.id : null,
    canGoBack: activeTab ? activeTab.view.webContents.navigationHistory.canGoBack() : false,
    canGoForward: activeTab ? activeTab.view.webContents.navigationHistory.canGoForward() : false,
  };
}

function broadcast(w: Win): void {
  if (!w.win.isDestroyed() && !w.chrome.webContents.isDestroyed()) w.chrome.webContents.send('state', snapshot(w));
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
  // Like Chrome: an empty tab is ready for typing; a loaded one gets the keyboard, so its URL is not selected.
  if (tab.url === BLANK_URL || tab.url === HOME_URL) focusAddress(w);
  else tab.view.webContents.focus();
}

const SLEEP_AFTER_MS = 10 * 60 * 1000;

// Frees a background page's memory by replacing it with about:blank; wake() brings it back.
function sleepTab(w: Win, tab: Tab): void {
  const wc = tab.view.webContents;
  const idle = Date.now() - tab.lastActive > SLEEP_AFTER_MS;
  const keep = tab === w.activeTab || tab.sleeping || tab.loading || !idle || wc.isCurrentlyAudible() || wc.isDevToolsOpened() || !/^https?:/.test(tab.url);
  if (keep) return;
  tab.sleeping = true;
  load(wc, 'about:blank');
  broadcast(w);
}

function wake(tab: Tab): void {
  tab.sleeping = false;
  const wc = tab.view.webContents;
  if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else load(wc, tab.url);
}

// An empty tab's keyboard goes to the address bar.
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
    { label: wc.isAudioMuted() ? 'Unmute tab' : 'Mute tab', click: () => wc.setAudioMuted(!wc.isAudioMuted()) },
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

function createTab(w: Win, url: string, groupId: number | null = null): void {
  const { tabs } = w;
  const view = new WebContentsView({ webPreferences: { ...webPreferences, partition: w.partition, preload: PAGE_PRELOAD } });
  const tab: Tab = { id: nextId++, groupId: null, view, title: 'New Tab', url: BLANK_URL, favicon: null, loading: false, preview: null, sleeping: false, lastActive: Date.now() };
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
  wc.on('page-favicon-updated', (_event, favicons) => {
    if (tab.sleeping) return;
    tab.favicon = favicons[0] ?? null;
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
  wc.on('did-start-loading', () => {
    if (tab.sleeping) return;
    tab.loading = true;
    broadcast(w);
  });
  wc.on('did-stop-loading', () => {
    if (tab.sleeping) return;
    tab.loading = false;
    setTimeout(() => {
      if (!wc.isDestroyed()) void capture(w, tab);
    }, 500); // give the page a moment to paint
    broadcast(w);
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

function registerIpc(): void {
  onCommand('tab:new', (w, url) => {
    const target = typeof url === 'string' ? normalizeInput(url) : null;
    createTab(w, target ?? HOME_URL);
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
  onQuery('history:search', (_w, query) => searchHistory(allHistory(), query));
  onQuery('history:remove', (_w, url) => removeVisit(url));
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
  onQuery('data:clear', async (_w, kind) => {
    const ses = session.fromPartition(WEB_PARTITION); // incognito partitions live in memory only
    const all = kind === 'all';
    if (all || kind === 'cache') await ses.clearCache();
    if (all || kind === 'cookies') {
      await ses.clearStorageData();
      store.clearTrustedHosts();
    }
    if (all || kind === 'history') clearHistory();
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

function createWindow(incognito = false): Win {
  const chromePreferences = { ...webPreferences, preload: path.join(__dirname, '../preload/preload.js') };
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: incognito ? `${APP_NAME} (Incognito)` : APP_NAME,
    icon: ICON, // Windows and Linux; macOS uses the Dock icon set at startup
    show: false, // shown once the chrome UI has painted, so there is no blank flash
    backgroundColor: '#1f2125',
    // macOS glass: the system blurs what is behind the window; the chrome draws its own window buttons.
    ...(IS_MAC ? { titleBarStyle: 'hidden' as const, vibrancy: 'hud' as const, visualEffectState: 'active' as const, backgroundColor: '#00000000' } : {}),
    webPreferences: chromePreferences,
  });
  const chrome = new WebContentsView({ webPreferences: chromePreferences });
  // A partition without "persist:" lives in memory only.
  const partition = incognito ? `incognito-${++incognitoCount}` : WEB_PARTITION;
  const w: Win = { win, chrome, tabs: [], groups: [], activeTab: null, dropdownHeight: 0, incognito, partition, pageFullscreen: false, finding: false, closed: [] };
  registerPages(partition);
  // WhatsApp Web rejects UAs containing "Electron/" or the app name; present as plain Chrome.
  const ses = session.fromPartition(partition);
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|Ambaser)\/\S+/gi, ''));
  guardPermissions(partition);
  watchDownloads(partition);
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
  // Remembered for the home page's "Last opened" list; incognito tabs are never saved.
  win.on('close', () => {
    if (incognito) return;
    const open = w.tabs.filter((t) => /^https?:/.test(t.url));
    store.setLastSession(open.map((t) => ({ url: t.url, title: t.title, favicon: t.favicon })));
  });
  win.on('closed', () => {
    windows.splice(windows.indexOf(w), 1);
    for (const tab of w.tabs.splice(0)) tab.view.webContents.close();
    chrome.webContents.close();
  });

  chrome.webContents.once('did-finish-load', () => win.show());
  chrome.webContents.on('did-finish-load', () => {
    broadcast(w);
    focusAddress(w);
  });
  chrome.webContents.on('did-fail-load', (_e, code, desc, url) => console.error(`chrome load failed ${url}: ${code} ${desc}`));
  chrome.webContents.on('preload-error', (_e, file, err) => console.error(`preload error ${file}: ${err.message}`));
  chrome.webContents.on('console-message', (event) => console.log(`[chrome] ${event.message}`));
  void chrome.webContents.loadFile(path.join(__dirname, '../renderer/index.html'), { query: incognito ? { incognito: '1' } : {} });
  createTab(w, HOME_URL);
  return w;
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

function restoreSession(): void {
  const w = focusedWindow() ?? createWindow();
  for (const site of store.lastSession()) if (isAllowedUrl(site.url) && !isAppUrl(site.url)) createTab(w, site.url);
}

function openTab(): void {
  const w = focusedWindow();
  if (w) createTab(w, HOME_URL);
  else createWindow();
}

// Replacing the default menu, so the standard app, edit and window menus (copy, paste, quit) stay.
function buildMenu(): void {
  const page = (): WebContents | undefined => focusedWindow()?.activeTab?.view.webContents;
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
          { label: 'Reset Site Permissions', click: resetPermissions },
          { label: 'Open Downloads Folder', click: () => void shell.openPath(app.getPath('downloads')) },
        ],
      },
      {
        label: 'History',
        submenu: [
          {
            label: 'Show History',
            accelerator: IS_MAC ? 'Cmd+Y' : 'Ctrl+H', // Cmd+H hides the app on macOS
            click: () => {
              const w = focusedWindow() ?? createWindow();
              w.chrome.webContents.focus();
              w.chrome.webContents.send('history:show');
            },
          },
          { label: 'Restore Last Session', click: restoreSession },
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
  // Network settings go in before the first page loads.
  applyDns(store.network());
  await applyProxy(store.network(), [WEB_PARTITION]);
  registerIpc();
  buildMenu();
  createWindow();
  setInterval(() => {
    for (const w of windows) for (const tab of w.tabs) sleepTab(w, tab);
  }, 60 * 1000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Electron rejects bad certificates. Accept one only for a host the user trusted on the warning page.
app.on('certificate-error', (event, webContents, url, _error, _certificate, callback) => {
  event.preventDefault();
  callback(isTrusted(webContents.session, url));
});
