// Shared between main, preload and renderer. Types only; no runtime code.

export type GroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan';
export type GroupIcon = 'none' | 'star' | 'briefcase' | 'book' | 'code' | 'play' | 'cart' | 'heart';

export interface GroupState {
  id: number;
  name: string;
  color: GroupColor;
  icon: GroupIcon;
  collapsed: boolean;
}

export interface TabState {
  id: number;
  groupId: number | null;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  sleeping: boolean;
  unread: number; // from the page title
  muted: boolean;
  audible: boolean;
}

export interface BrowserState {
  tabs: TabState[];
  groups: GroupState[];
  appearance: Appearance;
  adblock: boolean;
  media: boolean; // a tab in this window has played sound since it loaded
  update: UpdateInfo | null; // a newer version exists on GitHub
  profile: Profile | null; // the one in use; null while there is only one
  activeId: number | null;
  canGoBack: boolean;
  canGoForward: boolean;
  isActivePinned: boolean;
  favorites: { url: string; title: string; favicon: string | null; unread: number; bar?: boolean }[]; // pinned sites
  barLimit: number; // most favorites the bar can show
}

export interface UpdateInfo {
  version: string;
  features: string[];
  fixes: string[];
  other: string[];
}

// One player in the media control center, as its page reports it.
export interface MediaInfo {
  tabId: number;
  host: string;
  favicon: string | null;
  title: string;
  artist: string;
  artwork: string; // http(s) or data: image, or ''
  playing: boolean;
  duration: number; // seconds; 0 when unknown (a live stream)
  time: number;
  canPrevious: boolean;
  canNext: boolean;
  canPip: boolean;
}

export type MediaCommand = 'playpause' | 'previoustrack' | 'nexttrack' | 'seekbackward' | 'seekforward' | 'seekto' | 'pip';

export interface Appearance {
  mode: 'system' | 'light' | 'dark';
  theme: 'default' | 'midnight' | 'titanium' | 'aurora' | 'rose' | 'champagne' | 'emerald';
  // A new photo every day, borrowed from Unsplash via Lorem Picsum; 'none' keeps the plain theme background.
  wallpaper: 'none' | 'daily';
}

export type PermissionValue = 'ask' | 'allow' | 'block';

// What the address bar's site button shows about the active tab.
export interface SiteInfo {
  origin: string;
  host: string;
  secure: boolean; // loaded over HTTPS
  acceptedCertificate: boolean; // the user proceeded past a certificate warning for this host
  // null when the page is not allowed to have any permission (not HTTPS).
  permissions: { kind: string; value: PermissionValue }[] | null;
}

export interface HistoryEntry {
  url: string;
  title: string;
  time?: number; // last visit, ms since epoch; missing on entries saved by older versions
  favicon?: string;
}

export interface Profile {
  id: string; // '' for the default profile
  name: string;
  color: GroupColor;
}

export interface PageQr {
  url: string;
  image: string | null; // null when the address is too long for a QR code
}

export type WindowAction = 'close' | 'minimize' | 'fullscreen';

// Where a dragged tab was dropped.
export type TabDrop =
  | { kind: 'before' | 'after' | 'merge'; tabId: number }
  | { kind: 'group'; groupId: number }
  | { kind: 'end' };

export interface NetworkSettings {
  proxyMode: 'system' | 'direct' | 'manual';
  proxyServer: string;
  proxyBypass: string;
  dnsMode: 'system' | 'cloudflare' | 'custom';
  dnsUrl: string;
}

export interface DownloadInfo {
  id: number;
  name: string;
  received: number;
  total: number; // 0 when the size is unknown
  state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';
  path: string;
}

export interface BrowserApi {
  // null for pages without a web address.
  pageQr(): Promise<PageQr | null>;
  listProfiles(): Promise<{ current: string; profiles: Profile[] }>;
  openProfile(id: string): Promise<void>;
  // Creates and opens a profile. Resolves to an error message, or ''.
  addProfile(name: string): Promise<string>;
  // Both resolve to an error message, or ''. Deleting asks first.
  updateProfile(profile: Profile): Promise<string>;
  removeProfile(id: string): Promise<string>;
  setFavoriteBar(url: string, on: boolean): void;
  unpin(url: string): void;
  tabOverflow(ids: number[]): void;
  listDownloads(): Promise<DownloadInfo[]>;
  onDownloads(callback: (list: DownloadInfo[]) => void): void;
  onDownloadStarted(callback: () => void): void;
  downloadAction(id: number, action: 'pause' | 'resume' | 'cancel' | 'show' | 'open' | 'remove' | 'clear'): void;
  find(text: string, forward: boolean, next: boolean): void;
  stopFind(): void;
  onShowFind(callback: () => void): void;
  onFindResult(callback: (current: number, total: number) => void): void;
  getNetwork(): Promise<NetworkSettings>;
  // Resolves to an error message, or '' once saved and applied.
  setNetwork(settings: NetworkSettings): Promise<string>;
  onFocusAddress(callback: () => void): void;
  home(): void;
  setAppearance(appearance: Appearance): void;
  // null for our own pages, which have nothing to manage.
  siteInfo(): Promise<SiteInfo | null>;
  setSitePermission(origin: string, kind: string, value: PermissionValue): Promise<void>;
  forgetCertificate(origin: string): Promise<void>;
  togglePin(): void;
  newIncognito(): void;
  toggleAdblock(): void;
  listMedia(): Promise<MediaInfo[]>;
  mediaCommand(tabId: number, command: MediaCommand, value?: number): void;
  focusPage(): void;
  appVersion(): Promise<string>;
  // Pulls the latest code and offers a restart. Resolves to a message to show.
  updateApp(pin: string): Promise<string>;
  toggleDevTools(): void;
  onShowHistory(callback: () => void): void;
  // A thumbnail of the tab as a data: URL, or null if there is none yet.
  previewTab(id: number): Promise<string | null>;
  dropTab(id: number, drop: TabDrop): void;
  isMac: boolean;
  isWindows: boolean; // the tab strip leaves room for the system window buttons
  windowAction(action: WindowAction): void;
  newTab(url?: string): void;
  closeTab(id: number): void;
  tabMenu(id: number): void;
  updateGroup(id: number, patch: Partial<GroupState>): void;
  ungroup(id: number): void;
  closeGroup(id: number): void;
  onEditGroup(callback: (id: number) => void): void;
  activateTab(id: number): void;
  navigate(input: string): void;
  back(): void;
  forward(): void;
  reload(): void;
  searchHistory(query: string): Promise<HistoryEntry[]>;
  removeHistory(url: string): Promise<void>;
  listHistory(query: string): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
  // kind: 'cache' | 'cookies' | 'history' | 'all'
  // Asks first; resolves to false if the user cancelled.
  clearData(kind: string): Promise<boolean>;
  suggest(query: string): Promise<string[]>;
  // How tall the chrome view must be to show the dropdown; 0 closes it.
  setDropdownHeight(height: number): void;
  onState(callback: (state: BrowserState) => void): void;
}
