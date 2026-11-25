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
}

export interface BrowserState {
  tabs: TabState[];
  groups: GroupState[];
  activeId: number | null;
  canGoBack: boolean;
  canGoForward: boolean;
  isActivePinned: boolean;
  favorites: { url: string; title: string; favicon: string | null }[]; // pinned sites
}

export interface HistoryEntry {
  url: string;
  title: string;
  time?: number; // last visit, ms since epoch; missing on entries saved by older versions
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

export interface BrowserApi {
  find(text: string, forward: boolean, next: boolean): void;
  stopFind(): void;
  onShowFind(callback: () => void): void;
  onFindResult(callback: (current: number, total: number) => void): void;
  getNetwork(): Promise<NetworkSettings>;
  // Resolves to an error message, or '' once saved and applied.
  setNetwork(settings: NetworkSettings): Promise<string>;
  onFocusAddress(callback: () => void): void;
  home(): void;
  togglePin(): void;
  newIncognito(): void;
  toggleDevTools(): void;
  onShowHistory(callback: () => void): void;
  // A thumbnail of the tab as a data: URL, or null if there is none yet.
  previewTab(id: number): Promise<string | null>;
  dropTab(id: number, drop: TabDrop): void;
  isMac: boolean;
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
  clearData(kind: string): Promise<void>;
  suggest(query: string): Promise<string[]>;
  // How tall the chrome view must be to show the dropdown; 0 closes it.
  setDropdownHeight(height: number): void;
  onState(callback: (state: BrowserState) => void): void;
}
