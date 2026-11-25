// Deliberately not a module (no top-level import/export): the compiled file is loaded by a plain <script>,
// where the CommonJS `exports` object does not exist. Types come from inline import() expressions.
type BrowserApi = import('../shared/types').BrowserApi;
type BrowserState = import('../shared/types').BrowserState;
type TabState = import('../shared/types').TabState;
type TabDrop = import('../shared/types').TabDrop;
type GroupState = import('../shared/types').GroupState;
type GroupColor = import('../shared/types').GroupColor;
type GroupIcon = import('../shared/types').GroupIcon;
type HistoryEntry = import('../shared/types').HistoryEntry;

interface Suggestion {
  icon: IconName;
  text: string; // shown in the list and put in the address bar when selected
  detail: string;
  url: string; // what to open
  fromHistory: boolean;
}

// The page talks to main only through window.browser.
const api = (window as unknown as { browser: BrowserApi }).browser;

const el = {
  tabs: document.getElementById('tabs') as HTMLDivElement,
  newTab: document.getElementById('new-tab') as HTMLButtonElement,
  back: document.getElementById('back') as HTMLButtonElement,
  forward: document.getElementById('forward') as HTMLButtonElement,
  home: document.getElementById('home') as HTMLButtonElement,
  pin: document.getElementById('pin') as HTMLButtonElement,
  incognitoBadge: document.getElementById('incognito-badge') as HTMLSpanElement,
  reload: document.getElementById('reload') as HTMLButtonElement,
  address: document.getElementById('address') as HTMLInputElement,
  siteButton: document.getElementById('site-btn') as HTMLButtonElement,
  sitePanel: document.getElementById('site-panel') as HTMLDivElement,
  siteHost: document.getElementById('site-host') as HTMLDivElement,
  siteSecurity: document.getElementById('site-security') as HTMLParagraphElement,
  siteForget: document.getElementById('site-forget') as HTMLButtonElement,
  sitePermissions: document.getElementById('site-permissions') as HTMLDivElement,
  siteNote: document.getElementById('site-note') as HTMLParagraphElement,
  siteReload: document.getElementById('site-reload') as HTMLButtonElement,
  overflow: document.getElementById('tab-overflow') as HTMLButtonElement,
  favoritesList: document.getElementById('favorites-list') as HTMLDivElement,
  favorites: document.getElementById('favorites') as HTMLDivElement,
  favmenu: document.getElementById('favmenu') as HTMLDivElement,
  favoritesButton: document.getElementById('favorites-btn') as HTMLButtonElement,
  dropdown: document.getElementById('dropdown') as HTMLDivElement,
  editor: document.getElementById('group-editor') as HTMLDivElement,
  groupName: document.getElementById('group-name') as HTMLInputElement,
  groupColors: document.getElementById('group-colors') as HTMLDivElement,
  groupIcons: document.getElementById('group-icons') as HTMLDivElement,
  ungroup: document.getElementById('group-ungroup') as HTMLButtonElement,
  closeGroup: document.getElementById('group-close') as HTMLButtonElement,
  preview: document.getElementById('preview') as HTMLDivElement,
  previewImage: document.getElementById('preview-image') as HTMLImageElement,
  previewTitle: document.getElementById('preview-title') as HTMLDivElement,
  previewUrl: document.getElementById('preview-url') as HTMLDivElement,
  find: document.getElementById('find') as HTMLDivElement,
  downloads: document.getElementById('downloads') as HTMLDivElement,
  downloadsButton: document.getElementById('downloads-btn') as HTMLButtonElement,
  findText: document.getElementById('find-text') as HTMLInputElement,
  findCount: document.getElementById('find-count') as HTMLSpanElement,
  findPrev: document.getElementById('find-prev') as HTMLButtonElement,
  findNext: document.getElementById('find-next') as HTMLButtonElement,
  findClose: document.getElementById('find-close') as HTMLButtonElement,
  settings: document.getElementById('settings-panel') as HTMLDivElement,
  updateBadge: document.getElementById('update-badge') as HTMLButtonElement,
  settingsButton: document.getElementById('settings-btn') as HTMLButtonElement,
  settingsForm: document.getElementById('settings-form') as HTMLFormElement,
  settingsClose: document.getElementById('settings-close') as HTMLButtonElement,
  settingsStatus: document.getElementById('settings-status') as HTMLSpanElement,
  proxyMode: document.getElementById('proxy-mode') as HTMLSelectElement,
  proxyServer: document.getElementById('proxy-server') as HTMLInputElement,
  proxyBypass: document.getElementById('proxy-bypass') as HTMLInputElement,
  dnsMode: document.getElementById('dns-mode') as HTMLSelectElement,
  dnsUrl: document.getElementById('dns-url') as HTMLInputElement,
  historyButton: document.getElementById('history-btn') as HTMLButtonElement,
  panel: document.getElementById('history-panel') as HTMLDivElement,
  historyClear: document.getElementById('history-clear') as HTMLButtonElement,
  historyClose: document.getElementById('history-close') as HTMLButtonElement,
  historyFilter: document.getElementById('history-filter') as HTMLInputElement,
  historyList: document.getElementById('history-list') as HTMLDivElement,
  historyRange: document.getElementById('history-range') as HTMLSelectElement,
  historyFrom: document.getElementById('history-from') as HTMLInputElement,
  historyTo: document.getElementById('history-to') as HTMLInputElement,
  historyFromLabel: document.getElementById('history-from-label') as HTMLLabelElement,
  historyToLabel: document.getElementById('history-to-label') as HTMLLabelElement,
};

// 24x24 line icons, drawn with the current text colour (see the svg rule in style.css).
const ICONS = {
  back: 'M19 12H5M11 6l-6 6 6 6',
  forward: 'M5 12h14M13 6l6 6-6 6',
  reload: 'M20 12a8 8 0 1 1-2.34-5.66L20 8.5M20 4v4.5h-4.5',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-4-4',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c-5 5-5 13 0 18c5-5 5-13 0-18',
  none: 'M6 18L18 6',
  minus: 'M5 12h14',
  sliders: 'M4 7h10M18 7h2M16 5v4M4 17h2M10 17h10M8 15v4',
  muted: 'M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6',
  pause: 'M8 5v14M16 5v14',
  folder: 'M3 7h6l2 2h10v10H3z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  home: 'M4 11l8-7l8 7M6 10v10h12V10',
  expand: 'M7 17L17 7M9 7h8v8M15 17H7V9',
  star: 'M12 3l2.7 5.6l6.1.8l-4.5 4.2l1.1 6.1L12 16.8l-5.4 2.9l1.1-6.1l-4.5-4.2l6.1-.8z',
  briefcase: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  book: 'M12 6c-2-1.5-5-1.5-8 0v13c3-1.5 6-1.5 8 0c2-1.5 5-1.5 8 0V6c-3-1.5-6-1.5-8 0zM12 6v13',
  code: 'M8 8l-4 4l4 4M16 8l4 4l-4 4',
  incognito: 'M3 12h18M6 12l2-7h8l2 7M7.5 20a2.5 2.5 0 1 0 0-5a2.5 2.5 0 1 0 0 5M16.5 20a2.5 2.5 0 1 0 0-5a2.5 2.5 0 1 0 0 5',
  play: 'M8 5l11 7l-11 7z',
  cart: 'M3 4h2l2.5 11h10L20 7H6M9 19h.01M17 19h.01',
  heart: 'M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z',
};
type IconName = keyof typeof ICONS;

function icon(name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-icon]')) {
  button.append(icon(button.dataset.icon as IconName));
}

if (api.isMac) {
  document.body.classList.add('mac');
  (document.getElementById('window-buttons') as HTMLDivElement).hidden = false;
  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-window]')) {
    button.addEventListener('click', () => api.windowAction(button.dataset.window as import('../shared/types').WindowAction));
  }
}

if (new URLSearchParams(location.search).has('incognito')) {
  el.incognitoBadge.hidden = false;
  document.body.classList.add('incognito');
}

// Duplicated from shared/url.ts: this plain script cannot import at runtime.
const HOME_URL = 'mybrowser://home/';
const isBlank = (url: string): boolean => url === 'about:blank' || url === HOME_URL;

function removeButton(title: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'small-btn';
  button.title = title;
  button.append(icon('close'));
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // the row behind has its own click
    action();
  });
  return button;
}

let hoverId: number | null = null; // tab under the pointer
let clickedId: number | null = null; // no preview again for a tab just clicked, until the pointer moves on
let hoverTimer = 0;

function hidePreview(): void {
  clearTimeout(hoverTimer);
  hoverId = null;
  if (el.preview.hidden) return;
  el.preview.hidden = true;
  resizeChrome();
}

async function showPreview(tab: TabState): Promise<void> {
  const image = await api.previewTab(tab.id);
  const row = el.tabs.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`);
  // The pointer may have moved on, or something else may be open.
  if (hoverId !== tab.id || !row || row.classList.contains('active') || panelOpen() || !el.editor.hidden || items.length) return;
  el.previewImage.hidden = !image;
  if (image) el.previewImage.src = image;
  el.previewTitle.textContent = tab.title || tab.url;
  el.previewUrl.textContent = isBlank(tab.url) ? '' : tab.url;
  el.preview.hidden = false;
  el.preview.style.left = `${Math.max(8, Math.min(row.getBoundingClientRect().left, window.innerWidth - 264))}px`;
  resizeChrome();
}

function hoverTab(tab: TabState): void {
  if (hoverId === tab.id || clickedId === tab.id) return;
  clickedId = null;
  clearTimeout(hoverTimer);
  hoverId = tab.id;
  // Wait before the first preview; moving along the tabs then switches at once.
  hoverTimer = window.setTimeout(() => void showPreview(tab), el.preview.hidden ? 400 : 0);
}

// The tab strip is rebuilt on every state change. Reusing the same <img> keeps icons from reloading (flicker).
const faviconCache = new Map<string, HTMLImageElement>();
const brokenIcons = new Set<string>();

function favicon(key: string, src: string, className: string): Node {
  if (brokenIcons.has(src)) return icon('globe');
  const id = `${key}|${src}`;
  let image = faviconCache.get(id);
  if (!image) {
    const created = document.createElement('img');
    created.className = className;
    created.src = src;
    created.alt = '';
    created.addEventListener('error', () => {
      brokenIcons.add(src);
      faviconCache.delete(id);
      created.replaceWith(icon('globe'));
    });
    faviconCache.set(id, (image = created));
  }
  return image;
}

const DRAG_TYPE ='application/x-tab';
let draggedId: number | null = null;

function clearDropMarks(): void {
  for (const node of document.querySelectorAll('.drop-before, .drop-after, .drop-into')) {
    node.classList.remove('drop-before', 'drop-after', 'drop-into');
  }
}

// Makes an element accept dragged tabs. locate() turns the pointer position into a drop, or null to refuse.
function dropTarget(node: HTMLElement, locate: (event: DragEvent) => TabDrop | null): void {
  node.addEventListener('dragover', (event) => {
    const drop = event.dataTransfer?.types.includes(DRAG_TYPE) ? locate(event) : null;
    clearDropMarks();
    if (!drop) return;
    event.preventDefault();
    node.classList.add(drop.kind === 'before' ? 'drop-before' : drop.kind === 'after' ? 'drop-after' : 'drop-into');
  });
  node.addEventListener('dragleave', clearDropMarks);
  node.addEventListener('drop', (event) => {
    const id = Number(event.dataTransfer?.getData(DRAG_TYPE));
    const drop = locate(event);
    clearDropMarks();
    if (!id || !drop) return;
    event.preventDefault();
    api.dropTab(id, drop);
  });
}

// Edges reorder. The middle of a loose tab, dragged onto from another tab, groups the two.
function overTab(tab: TabState, node: HTMLElement, event: DragEvent): TabDrop | null {
  if (tab.id === draggedId) return null;
  const box = node.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width;
  if (tab.groupId === null && x > 0.3 && x < 0.7) return { kind: 'merge', tabId: tab.id };
  return { kind: x < 0.5 ? 'before' : 'after', tabId: tab.id };
}

function badge(count: number): HTMLSpanElement {
  return span('unread', count > 99 ? '99+' : String(count));
}

function tabElement(tab: TabState, active: boolean): HTMLDivElement {
  const row = document.createElement('div');
  row.className = (active ? 'tab active' : 'tab') + (tab.sleeping ? ' sleeping' : '');
  row.dataset.tab = String(tab.id);
  // The active tab is already on screen, so it gets no preview.
  row.addEventListener('mouseenter', () => (active ? hidePreview() : hoverTab(tab)));
  row.addEventListener('mouseleave', () => {
    clickedId = null;
    hidePreview();
  });
  row.addEventListener('mousedown', () => {
    clickedId = tab.id;
    hidePreview();
  });
  row.addEventListener('contextmenu', () => api.tabMenu(tab.id));
  row.draggable = true;
  row.addEventListener('dragstart', (event) => {
    draggedId = tab.id;
    event.dataTransfer?.setData(DRAG_TYPE, String(tab.id));
  });
  row.addEventListener('dragend', clearDropMarks);
  dropTarget(row, (event) => overTab(tab, row, event));
  row.addEventListener('click', () => {
    closePanel();
    api.activateTab(tab.id);
  });

  if (tab.loading) {
    const spinner = document.createElement('span');
    spinner.className = 'tab-spinner';
    row.append(spinner);
  } else if (tab.favicon) {
    row.append(favicon(`tab${tab.id}`, tab.favicon, 'tab-favicon'));
  } else {
    row.append(icon('globe'));
  }

  const title = document.createElement('span');
  title.className = 'tab-title';
  // The badge shows the count, so the title does not repeat it.
  title.textContent = (tab.unread ? tab.title.replace(/^\(\d+\+?\)\s*/, '') : tab.title) || tab.url;
  row.append(title);
  if (tab.unread) row.append(badge(tab.unread));

  if (tab.muted) {
    const mute = icon('muted');
    mute.classList.add('tab-muted');
    row.append(mute);
  }
  row.append(removeButton('Close tab', () => api.closeTab(tab.id)));
  return row;
}

let groups: GroupState[] = [];
let activeId: number | null = null;
let edited = false; // the user has typed in the address bar
let editing: number | null = null; // id of the group open in the editor
const chips = new Map<number, HTMLButtonElement>();

function groupChip(group: GroupState): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.className = `group-chip c-${group.color}${group.collapsed ? ' collapsed' : ''}`;
  chip.title = 'Click to collapse or expand, right-click to edit';
  if (group.icon !== 'none') chip.append(icon(group.icon));
  if (group.name) chip.append(span('', group.name));
  chip.addEventListener('click', () => api.updateGroup(group.id, { collapsed: !group.collapsed }));
  chip.addEventListener('contextmenu', () => openEditor(group.id));
  dropTarget(chip, () => ({ kind: 'group', groupId: group.id }));
  chips.set(group.id, chip);
  return chip;
}

// A group's tabs are next to each other, so its chip goes before the first one.
function tabStrip(state: BrowserState): HTMLElement[] {
  chips.clear();
  return state.tabs.flatMap((tab) => {
    const active = tab.id === state.activeId;
    const group = state.groups.find((g) => g.id === tab.groupId);
    if (!group) return [tabElement(tab, active)];
    const parts: HTMLElement[] = chips.has(group.id) ? [] : [groupChip(group)];
    // A collapsed group's chip carries the unread count of the tabs it hides.
    if (group.collapsed && parts.length) {
      const hidden = state.tabs.filter((t) => t.groupId === group.id && t.id !== state.activeId).reduce((sum, t) => sum + t.unread, 0);
      if (hidden) parts[0].append(badge(hidden));
    }
    // A collapsed group still shows the tab being viewed.
    if (!group.collapsed || active) {
      const row = tabElement(tab, active);
      row.classList.add('grouped', `c-${group.color}`);
      parts.push(row);
    }
    return parts;
  });
}

function choice(label: string, selected: boolean, content: Node, pick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = selected ? 'choice selected' : 'choice';
  button.title = label;
  button.append(content);
  button.addEventListener('click', pick);
  return button;
}

function drawChoices(color: GroupColor, current: GroupIcon): void {
  const colors: GroupColor[] = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];
  const icons: GroupIcon[] = ['none', 'star', 'briefcase', 'book', 'code', 'play', 'cart', 'heart'];
  const pick = (patch: Partial<GroupState>): void => {
    if (editing === null) return;
    api.updateGroup(editing, patch);
    drawChoices(patch.color ?? color, patch.icon ?? current);
  };
  el.groupColors.replaceChildren(...colors.map((c) => choice(c, c === color, span(`dot c-${c}`, ''), () => pick({ color: c }))));
  el.groupIcons.replaceChildren(...icons.map((i) => choice(i, i === current, icon(i), () => pick({ icon: i }))));
}

function openEditor(id: number): void {
  const group = groups.find((g) => g.id === id);
  const chip = chips.get(id);
  if (!group || !chip) return;
  closePanel();
  hidePreview();
  el.address.blur();
  editing = id;
  el.editor.hidden = false;
  el.editor.style.left = `${Math.max(8, Math.min(chip.getBoundingClientRect().left, window.innerWidth - 264))}px`;
  el.groupName.value = group.name;
  drawChoices(group.color, group.icon);
  resizeChrome();
  el.groupName.focus();
}

function closeEditor(): void {
  if (el.editor.hidden) return;
  editing = null;
  el.editor.hidden = true;
  resizeChrome();
}

function favoriteButton(site: BrowserState['favorites'][number]): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'favorite';
  button.title = site.url;
  // Without an icon of its own, a site shows its initial.
  button.append(site.favicon ? favicon(`fav${site.url}`, site.favicon, '') : span('monogram', (site.title || new URL(site.url).hostname).charAt(0).toUpperCase()));
  button.append(span('favorite-title', site.title || site.url));
  if (site.unread) button.append(badge(site.unread));
  button.addEventListener('click', () => {
    closePanel();
    api.navigate(site.url);
  });
  return button;
}

let appearance: import('../shared/types').Appearance = { mode: 'dark', theme: 'default' };

function drawAppearance(): void {
  document.documentElement.dataset.theme = appearance.theme;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === appearance.mode));
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')) b.setAttribute('aria-pressed', String(b.dataset.themeChoice === appearance.theme));
}

// Appearance applies as soon as it is picked; no Save needed.
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  b.addEventListener('click', () => api.setAppearance({ ...appearance, mode: b.dataset.mode as typeof appearance.mode }));
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')) {
  b.addEventListener('click', () => api.setAppearance({ ...appearance, theme: b.dataset.themeChoice as typeof appearance.theme }));
}

let lastState: BrowserState | null = null;
let hiddenIds: number[] = [];

// Tabs that do not fit are left out of the strip and counted on the "+N" button. The active tab always stays.
function splitTabs(state: BrowserState): { shown: TabState[]; hidden: TabState[] } {
  const strip = el.tabs.parentElement as HTMLElement;
  const others = [document.getElementById('window-buttons'), el.newTab, el.incognitoBadge];
  const used = others.reduce((sum, node) => sum + (node && !node.hidden ? node.offsetWidth + 6 : 0), 0);
  const max = Math.max(1, Math.floor((strip.clientWidth - 16 - used - 52) / 126)); // a tab is at least 120px wide, plus the gap
  if (state.tabs.length <= max) return { shown: state.tabs, hidden: [] };
  const shown = state.tabs.slice(0, max);
  const active = state.tabs.find((t) => t.id === state.activeId);
  if (active && !shown.includes(active)) shown[max - 1] = active;
  return { shown, hidden: state.tabs.filter((t) => !shown.includes(t)) };
}

el.overflow.addEventListener('click', () => api.tabOverflow(hiddenIds));
window.addEventListener('resize', () => lastState && render(lastState));

let favorites: BrowserState['favorites'] = [];
let barLimit = 8;

// The folder button lists every favorite and lets you choose which ones the bar shows.
function drawFavmenu(): void {
  if (el.favmenu.hidden) return;
  const shown = favorites.filter((s) => s.bar).length;
  const rows = favorites.map((site) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.addEventListener('click', () => {
      closeFavmenu();
      api.navigate(site.url);
    });
    const text = span('row-text', site.title || site.url);
    text.append(span('row-url', site.url));
    const toggle = document.createElement('button');
    toggle.className = site.bar ? 'small-btn on' : 'small-btn';
    toggle.title = site.bar ? 'Hide from the bar' : shown >= barLimit ? `The bar is full (${barLimit})` : 'Show in the bar';
    toggle.disabled = !site.bar && shown >= barLimit;
    toggle.append(icon('star'));
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      api.setFavoriteBar(site.url, !site.bar);
    });
    row.append(site.favicon ? favicon(`menu${site.url}`, site.favicon, '') : icon('globe'), text, toggle);
    return row;
  });
  const note = span('history-empty', favorites.length ? `${shown} of ${barLimit} shown in the bar` : 'No favorites yet');
  el.favmenu.replaceChildren(...rows, note);
  resizeChrome();
}

function closeFavmenu(): void {
  if (el.favmenu.hidden) return;
  el.favmenu.hidden = true;
  resizeChrome();
}

el.favoritesButton.addEventListener('click', () => {
  if (!el.favmenu.hidden) return closeFavmenu();
  closePanel();
  closeEditor();
  closeDropdown();
  closeDownloads();
  hidePreview();
  el.favmenu.hidden = false;
  drawFavmenu();
});
document.addEventListener('mousedown', (event) => {
  const target = event.target as Node;
  if (!el.favmenu.contains(target) && !el.favoritesButton.contains(target)) closeFavmenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeFavmenu();
});
window.addEventListener('blur', closeFavmenu);

function drawFavoritesSettings(): void {
  el.favoritesList.replaceChildren(
    ...(favorites.length
      ? favorites.map((site) => {
          const row = document.createElement('div');
          row.className = 'row';
          const text = span('row-text', site.title || site.url);
          text.append(span('row-url', site.url));
          row.append(site.favicon ? favicon(`set${site.url}`, site.favicon, '') : icon('globe'), text, removeButton('Remove from favorites', () => api.unpin(site.url)));
          return row;
        })
      : [span('history-empty', 'No favorites yet')]),
  );
}

function render(state: BrowserState): void {
  appearance = state.appearance;
  drawAppearance();
  lastState = state;
  el.updateBadge.hidden = !state.updateVersion;
  el.updateBadge.textContent = `Update v${state.updateVersion}`;
  el.updateBadge.title = 'A newer version is available. Click to update.';
  favorites = state.favorites;
  drawFavoritesSettings();
  barLimit = state.barLimit;
  drawFavmenu();
  const { shown, hidden } = splitTabs(state);
  hiddenIds = hidden.map((t) => t.id);
  el.overflow.hidden = hidden.length === 0;
  el.overflow.textContent = `+${hidden.length}`;
  el.overflow.title = `${hidden.length} more tab${hidden.length === 1 ? '' : 's'}`;
  groups = state.groups;
  if (activeId !== state.activeId) closeFind(); // the search belongs to the tab being left
  activeId = state.activeId;
  el.tabs.replaceChildren(...tabStrip({ ...state, tabs: shown }));
  if (hoverId !== null && (hoverId === state.activeId || !state.tabs.some((t) => t.id === hoverId))) hidePreview();
  if (editing !== null && !groups.some((g) => g.id === editing)) closeEditor();
  el.back.disabled = !state.canGoBack;
  el.forward.disabled = !state.canGoForward;
  el.pin.classList.toggle('pinned', state.isActivePinned);
  el.pin.title = state.isActivePinned ? 'Unpin this page' : 'Pin this page';
  const barSites = state.favorites.filter((s) => s.bar);
  el.favorites.replaceChildren(
    ...(barSites.length ? barSites.map(favoriteButton) : [span('favorites-empty', state.favorites.length ? 'Choose favorites to show with the folder button' : 'Pin pages with the star to keep them here')]),
  );

  const current = state.tabs.find((t) => t.id === state.activeId)?.url ?? '';
  const web = /^https?:/.test(current);
  const insecure = current.startsWith('http:');
  el.siteButton.hidden = !web;
  el.siteButton.classList.toggle('insecure', insecure);
  el.siteButton.replaceChildren(icon(insecure ? 'unlock' : 'lock'));
  if (siteUrl !== null && siteUrl !== `${state.activeId} ${current}`) closeSite(); // it described another page
  shownUrl = `${state.activeId} ${current}`;

  for (const [id, image] of faviconCache) if (!image.isConnected) faviconCache.delete(id); // closed tabs, old icons

  const active = state.tabs.find((t) => t.id === state.activeId);
  const url = active && !isBlank(active.url) ? active.url : '';
  // Keep the box in step with the tab unless the user is editing it.
  if (active && !edited && el.address.value !== url) {
    el.address.value = url;
    if (document.activeElement === el.address) el.address.select();
  }
}

// Every toolbar action leaves the history panel, so its effect is visible.
function onToolbar(button: HTMLButtonElement, action: () => void): void {
  button.addEventListener('click', () => {
    closePanel();
    action();
  });
}
onToolbar(el.newTab, () => api.newTab());
onToolbar(el.back, () => api.back());
onToolbar(el.forward, () => api.forward());
onToolbar(el.reload, () => api.reload());
onToolbar(el.home, () => api.home());
onToolbar(el.pin, () => api.togglePin());
onToolbar(document.getElementById('incognito-btn') as HTMLButtonElement, () => api.newIncognito());
onToolbar(document.getElementById('devtools-btn') as HTMLButtonElement, () => api.toggleDevTools());
// ---- Site settings: what the site in the active tab may do ----
const PERMISSION_LABELS: Record<string, string> = {
  notifications: 'Notifications',
  geolocation: 'Location',
  camera: 'Camera',
  microphone: 'Microphone',
  'clipboard-read': 'Read clipboard',
};
const CHOICES = [['ask', 'Ask'], ['allow', 'Allow'], ['block', 'Block']] as const;
let shownUrl = ''; // "tab url" of the active tab
let siteUrl: string | null = null; // the one the open panel describes

function closeSite(): void {
  siteUrl = null;
  if (el.sitePanel.hidden) return;
  el.sitePanel.hidden = true;
  resizeChrome();
}

function permissionRow(origin: string, kind: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'permission';
  const segments = document.createElement('div');
  segments.className = 'segments';
  segments.setAttribute('role', 'group');
  segments.setAttribute('aria-label', PERMISSION_LABELS[kind] ?? kind);
  for (const [choice, label] of CHOICES) {
    const button = document.createElement('button');
    button.textContent = label;
    button.setAttribute('aria-pressed', String(choice === value));
    button.addEventListener('click', async () => {
      await api.setSitePermission(origin, kind, choice);
      for (const other of segments.children) other.setAttribute('aria-pressed', String(other === button));
      el.siteNote.textContent = 'Reload the page to apply the change.';
      el.siteReload.hidden = false;
      resizeChrome();
    });
    segments.append(button);
  }
  row.append(span('', PERMISSION_LABELS[kind] ?? kind), segments);
  return row;
}

async function openSite(): Promise<void> {
  const url = shownUrl;
  const site = await api.siteInfo();
  if (!site || url !== shownUrl) return;
  closePanel();
  closeEditor();
  closeDropdown();
  hidePreview();
  siteUrl = url;
  el.siteHost.textContent = site.host;
  el.siteSecurity.textContent = !site.secure
    ? 'Not secure. Others on the network can read what you send to this site.'
    : site.acceptedCertificate
      ? 'You chose to continue past a certificate warning for this site.'
      : 'The connection is encrypted.';
  el.siteForget.hidden = !site.acceptedCertificate;
  el.siteForget.onclick = async () => {
    await api.forgetCertificate(site.origin);
    el.siteForget.hidden = true;
    el.siteNote.textContent = 'Restart the app to see the warning again.';
    resizeChrome();
  };
  el.sitePermissions.replaceChildren(...(site.permissions ?? []).map((p) => permissionRow(site.origin, p.kind, p.value)));
  el.siteNote.textContent = site.permissions ? '' : 'Only secure (HTTPS) sites can be given permissions.';
  el.siteReload.hidden = true;
  el.sitePanel.hidden = false;
  const left = el.siteButton.getBoundingClientRect().left - 4;
  el.sitePanel.style.left = `${Math.max(8, Math.min(left, window.innerWidth - 328))}px`;
  resizeChrome();
}

el.siteButton.addEventListener('click', () => (el.sitePanel.hidden ? void openSite() : closeSite()));
el.siteReload.addEventListener('click', () => {
  closeSite();
  api.reload();
});
document.addEventListener('mousedown', (event) => {
  const target = event.target as Node;
  if (!el.sitePanel.contains(target) && !el.siteButton.contains(target)) closeSite();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSite();
});
window.addEventListener('blur', closeSite);

let items: Suggestion[] = [];
let selected = -1;
let typed = '';
let request = 0; // bumped on every change so late answers are ignored

function closeDropdown(): void {
  request++;
  items = [];
  selected = -1;
  drawDropdown();
}

function open(url: string): void {
  closeDropdown();
  api.navigate(url);
  el.address.blur();
}

function span(className: string, text: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

function suggestionElement(item: Suggestion, index: number): HTMLDivElement {
  const row = document.createElement('div');
  row.className = index === selected ? 'row selected' : 'row';
  row.addEventListener('click', () => open(item.url));

  const text = span('row-text', item.text);
  if (item.detail) text.append(span('row-url', item.detail));
  row.append(icon(item.icon), text);

  if (item.fromHistory) {
    row.append(
      removeButton('Remove from history', async () => {
        await api.removeHistory(item.url);
        void suggest(typed);
      }),
    );
  }
  return row;
}

// The panel needs the whole window (main caps the height), the dropdown only what it covers.
function resizeChrome(): void {
  // Extra pixels leave room for the shadow.
  const dropdown = items.length ? Math.ceil(el.dropdown.getBoundingClientRect().bottom) + 16 : 0;
  const editor = el.editor.hidden ? 0 : Math.ceil(el.editor.getBoundingClientRect().bottom) + 16;
  const site = el.sitePanel.hidden ? 0 : Math.ceil(el.sitePanel.getBoundingClientRect().bottom) + 16;
  const preview = el.preview.hidden ? 0 : Math.ceil(el.preview.getBoundingClientRect().bottom) + 16;
  const find = el.find.hidden ? 0 : Math.ceil(el.find.getBoundingClientRect().bottom) + 16;
  const downloads = el.downloads.hidden ? 0 : Math.ceil(el.downloads.getBoundingClientRect().bottom) + 16;
  const favmenu = el.favmenu.hidden ? 0 : Math.ceil(el.favmenu.getBoundingClientRect().bottom) + 16;
  api.setDropdownHeight(panelOpen() ? 100000 : Math.max(dropdown, editor, preview, find, site, downloads, favmenu));
}

function drawDropdown(): void {
  el.dropdown.replaceChildren(...items.map(suggestionElement));
  el.dropdown.hidden = items.length === 0;
  resizeChrome();
}

function fromHistory(entry: HistoryEntry): Suggestion {
  return { icon: 'clock', text: entry.title, detail: entry.url, url: entry.url, fromHistory: true };
}

function fromGoogle(query: string): Suggestion {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return { icon: 'search', text: query, detail: '', url, fromHistory: false };
}

// History is shown at once; Google's suggestions are appended when they arrive.
async function suggest(query: string): Promise<void> {
  const current = ++request;
  typed = query;
  const history = (await api.searchHistory(query)).map(fromHistory);
  if (current !== request) return;
  items = history;
  selected = -1;
  drawDropdown();

  const remote = await api.suggest(query);
  if (current !== request || remote.length === 0) return;
  items = [...history, ...remote.map(fromGoogle)];
  drawDropdown();
}

function select(step: number): void {
  if (items.length === 0) return;
  // -1 is the user's own text, so the arrows cycle through it too.
  selected = ((selected + 1 + step + items.length + 1) % (items.length + 1)) - 1;
  const item = items[selected];
  el.address.value = !item ? typed : item.fromHistory ? item.url : item.text;
  request++; // stop a late answer from reshuffling the list under the cursor
  drawDropdown();
}

el.address.addEventListener('input', () => {
  edited = true;
  void suggest(el.address.value);
});
el.address.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    const item = items[selected];
    open(item ? item.url : el.address.value);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    select(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Escape') {
    if (items.length) closeDropdown();
    else el.address.blur();
  }
});
el.address.addEventListener('focus', () => {
  hidePreview();
  closePanel();
  el.address.select();
});
// Recent history opens on a click, not on focus, so switching tabs does not cover the page with it.
// The box holds the current URL, so show the latest history rather than filtering by it.
el.address.addEventListener('click', () => {
  if (items.length === 0) void suggest('');
});
el.address.addEventListener('blur', () => {
  edited = false;
  closeDropdown();
});
// Keep focus in the address bar while clicking inside the list.
el.dropdown.addEventListener('mousedown', (event) => event.preventDefault());

let confirmingClear = false;
let panelRequest = 0;

function historyRow(entry: HistoryEntry): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'row';
  row.addEventListener('click', () => {
    closePanel();
    api.navigate(entry.url);
  });

  // The date is in the group heading above, so a row only needs the time.
  const time = entry.time ? new Date(entry.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  const text = span('row-text', entry.title);
  text.append(span('row-url', entry.url));

  const remove = removeButton('Remove from history', async () => {
    await api.removeHistory(entry.url);
    void drawHistory();
  });

  row.append(span('history-time', time), text, remove);
  return row;
}

// Clearing takes two clicks: the first only arms the button.
function setConfirming(value: boolean): void {
  confirmingClear = value;
  el.historyClear.textContent = value ? 'Click again to delete all' : 'Clear all';
  el.historyClear.classList.toggle('danger', value);
}

// A day as "YYYY-MM-DD" in local time, the same form a date input uses, so days compare as text.
function dayKey(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function daysAgo(count: number): string {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return dayKey(date);
}

// The first and last day to show; an empty string leaves that side open.
function dateBounds(): [string, string] {
  const from = el.historyFrom.value;
  const to = el.historyTo.value;
  switch (el.historyRange.value) {
    case 'today': return [daysAgo(0), daysAgo(0)];
    case 'yesterday': return [daysAgo(1), daysAgo(1)];
    case 'week': return [daysAgo(6), daysAgo(0)];
    case 'month': return [daysAgo(29), daysAgo(0)];
    case 'day': return [from, from];
    case 'range': return from && to && from > to ? [to, from] : [from, to]; // picked backwards still works
    default: return ['', ''];
  }
}

function inBounds(entry: HistoryEntry, [from, to]: [string, string]): boolean {
  if (!from && !to) return true;
  if (!entry.time) return false; // saved by an older version, date unknown
  const day = dayKey(new Date(entry.time));
  return (!from || day >= from) && (!to || day <= to);
}

function dayTitle(key: string): string {
  if (!key) return 'Date unknown';
  const full = new Date(`${key}T00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (key === daysAgo(0)) return `Today, ${full}`;
  return key === daysAgo(1) ? `Yesterday, ${full}` : full;
}

// Entries arrive newest first, so each day's rows are already next to each other.
function groupedByDay(entries: HistoryEntry[]): HTMLElement[] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = entry.time ? dayKey(new Date(entry.time)) : '';
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].map(([key, list]) => {
    const section = document.createElement('section');
    section.className = 'history-day';
    const heading = document.createElement('h2');
    heading.append(span('', dayTitle(key)), span('history-count', `${list.length} ${list.length === 1 ? 'page' : 'pages'}`));
    section.append(heading, ...list.map(historyRow));
    return section;
  });
}

function showDateFields(): void {
  const mode = el.historyRange.value;
  el.historyFromLabel.hidden = mode !== 'day' && mode !== 'range';
  el.historyToLabel.hidden = mode !== 'range';
  (el.historyFromLabel.firstElementChild as HTMLSpanElement).textContent = mode === 'day' ? 'Date' : 'From';
  el.historyFrom.max = el.historyTo.max = daysAgo(0);
}

async function drawHistory(): Promise<void> {
  const current = ++panelRequest;
  const query = el.historyFilter.value;
  const [all, shown] = await Promise.all([api.listHistory(''), api.listHistory(query)]);
  if (current !== panelRequest) return;
  el.historyClear.disabled = all.length === 0;
  const bounds = dateBounds();
  const dated = shown.filter((entry) => inBounds(entry, bounds));
  if (dated.length) el.historyList.replaceChildren(...groupedByDay(dated));
  else el.historyList.replaceChildren(span('history-empty', all.length ? 'No matches' : 'No history yet'));
}

function openPanel(): void {
  el.settings.hidden = true;
  hidePreview();
  closeEditor();
  closeDropdown();
  el.address.blur();
  el.panel.hidden = false;
  el.historyFilter.value = '';
  el.historyRange.value = 'all';
  el.historyFrom.value = el.historyTo.value = '';
  showDateFields();
  setConfirming(false);
  resizeChrome();
  el.historyFilter.focus();
  void drawHistory();
}

const panelOpen = (): boolean => !el.panel.hidden || !el.settings.hidden;

// Closes whichever full-window panel is open: history or settings.
function closePanel(): void {
  closeSite();
  if (!panelOpen()) return;
  el.panel.hidden = true;
  el.settings.hidden = true;
  resizeChrome();
}

el.historyButton.addEventListener('click', () => (el.panel.hidden ? openPanel() : closePanel()));
el.historyClose.addEventListener('click', closePanel);
el.historyFilter.addEventListener('input', () => void drawHistory());
el.historyRange.addEventListener('change', () => {
  showDateFields();
  // Start from today instead of an empty box.
  if (!el.historyFrom.value && (el.historyRange.value === 'day' || el.historyRange.value === 'range')) el.historyFrom.value = daysAgo(el.historyRange.value === 'range' ? 6 : 0);
  if (!el.historyTo.value && el.historyRange.value === 'range') el.historyTo.value = daysAgo(0);
  void drawHistory();
});
for (const input of [el.historyFrom, el.historyTo]) input.addEventListener('input', () => void drawHistory());
el.historyClear.addEventListener('click', async () => {
  if (!confirmingClear) return setConfirming(true);
  setConfirming(false);
  await api.clearHistory(); // all entries, not only the ones matching the filter
  void drawHistory();
});
el.historyClear.addEventListener('blur', () => setConfirming(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePanel();
});

el.groupName.addEventListener('input', () => {
  if (editing !== null) api.updateGroup(editing, { name: el.groupName.value });
});
el.groupName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) closeEditor();
});
el.ungroup.addEventListener('click', () => {
  if (editing !== null) api.ungroup(editing);
  closeEditor();
});
el.closeGroup.addEventListener('click', () => {
  if (editing !== null) api.closeGroup(editing);
  closeEditor();
});
// Clicking elsewhere, in the toolbar or on the page, or pressing Escape closes the editor.
document.addEventListener('mousedown', (event) => {
  if (!el.editor.contains(event.target as Node)) closeEditor();
});
window.addEventListener('blur', closeEditor);
window.addEventListener('blur', hidePreview);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeEditor();
});

dropTarget(el.newTab, () => ({ kind: 'end' })); // dropping on "+" takes a tab out to the end
api.onFocusAddress(() => {
  if (panelOpen() || !el.editor.hidden) return;
  edited = false;
  closeDropdown();
  el.address.focus();
  el.address.select();
});
type DownloadInfo = import('../shared/types').DownloadInfo;
type DownloadAction = Parameters<BrowserApi['downloadAction']>[1];

let downloads: DownloadInfo[] = [];

const megabytes = (bytes: number): string => `${(bytes / 1048576).toFixed(1)} MB`;

function downloadStatus(d: DownloadInfo): string {
  const size = d.total ? `${megabytes(d.received)} / ${megabytes(d.total)}` : megabytes(d.received);
  if (d.state === 'progressing') return size;
  if (d.state === 'paused') return `Paused, ${size}`;
  if (d.state === 'completed') return `Done, ${megabytes(d.received)}`;
  return d.state === 'cancelled' ? 'Cancelled' : 'Failed';
}

function downloadButton(title: string, name: IconName, id: number, action: DownloadAction): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'small-btn';
  button.title = title;
  button.append(icon(name));
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    api.downloadAction(id, action);
  });
  return button;
}

function downloadRow(d: DownloadInfo): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'row download';
  const active = d.state === 'progressing' || d.state === 'paused';
  if (d.state === 'completed') row.addEventListener('click', () => api.downloadAction(d.id, 'open'));

  const text = span('row-text', d.name);
  text.append(span('row-url', downloadStatus(d)));
  const body = document.createElement('div');
  body.className = 'download-body';
  body.append(text);
  if (active) {
    const bar = document.createElement('div');
    bar.className = d.total ? 'bar' : 'bar unknown';
    const fill = document.createElement('div');
    fill.style.width = d.total ? `${Math.min(100, (d.received / d.total) * 100)}%` : '100%';
    bar.append(fill);
    body.append(bar);
  }
  row.append(icon('download'), body);
  if (d.state === 'progressing') row.append(downloadButton('Pause', 'pause', d.id, 'pause'));
  if (d.state === 'paused') row.append(downloadButton('Resume', 'play', d.id, 'resume'));
  if (d.state === 'completed') row.append(downloadButton('Show in folder', 'folder', d.id, 'show'));
  row.append(downloadButton(active ? 'Cancel' : 'Remove from list', 'close', d.id, active ? 'cancel' : 'remove'));
  return row;
}

function drawDownloads(): void {
  el.downloadsButton.classList.toggle('busy', downloads.some((d) => d.state === 'progressing'));
  if (el.downloads.hidden) return;
  const clear = document.createElement('button');
  clear.className = 'text-btn';
  clear.textContent = 'Clear finished';
  clear.disabled = !downloads.some((d) => d.state !== 'progressing' && d.state !== 'paused');
  clear.addEventListener('click', () => api.downloadAction(0, 'clear'));
  el.downloads.replaceChildren(...(downloads.length ? downloads.map(downloadRow) : [span('history-empty', 'No downloads yet')]), clear);
  resizeChrome();
}

function closeDownloads(): void {
  if (el.downloads.hidden) return;
  el.downloads.hidden = true;
  resizeChrome();
}

el.downloadsButton.addEventListener('click', () => {
  if (!el.downloads.hidden) return closeDownloads();
  closePanel();
  closeEditor();
  closeDropdown();
  closeFavmenu();
  hidePreview();
  el.downloads.hidden = false;
  drawDownloads();
});
// Clicking elsewhere (but not on the button, which toggles) or pressing Escape closes the list.
document.addEventListener('mousedown', (event) => {
  const target = event.target as Node;
  if (!el.downloads.contains(target) && !el.downloadsButton.contains(target)) closeDownloads();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDownloads();
});
window.addEventListener('blur', closeDownloads);
api.onDownloads((list) => {
  downloads = list;
  drawDownloads();
});
void api.listDownloads().then((list) => {
  downloads = list;
  drawDownloads();
});

type NetworkSettings = import('../shared/types').NetworkSettings;

// Fields that do not apply to the chosen mode are greyed out.
function enableFields(): void {
  el.proxyServer.disabled = el.proxyBypass.disabled = el.proxyMode.value !== 'manual';
  el.dnsUrl.disabled = el.dnsMode.value !== 'custom';
}

function showStatus(message: string, error = false): void {
  el.settingsStatus.textContent = message;
  el.settingsStatus.classList.toggle('error', error);
}

async function openSettings(): Promise<void> {
  const saved = await api.getNetwork();
  closePanel();
  closeEditor();
  hidePreview();
  closeDropdown();
  el.address.blur();
  el.proxyMode.value = saved.proxyMode;
  el.proxyServer.value = saved.proxyServer;
  el.proxyBypass.value = saved.proxyBypass;
  el.dnsMode.value = saved.dnsMode;
  el.dnsUrl.value = saved.dnsUrl;
  enableFields();
  showSection('network');
  el.settings.hidden = false;
  resizeChrome();
  el.proxyMode.focus();
}

el.settingsButton.addEventListener('click', () => (el.settings.hidden ? void openSettings() : closePanel()));
el.settingsClose.addEventListener('click', closePanel);
el.updateBadge.addEventListener('click', async () => {
  await openSettings();
  showSection('about');
});
el.settingsForm.addEventListener('change', () => {
  enableFields();
  showStatus('');
});
document.getElementById('open-history')?.addEventListener('click', openPanel);

function showSection(name: string): void {
  for (const nav of document.querySelectorAll<HTMLButtonElement>('.nav-btn')) nav.classList.toggle('active', nav.dataset.section === name);
  for (const section of el.settingsForm.querySelectorAll<HTMLElement>('.section')) section.hidden = section.dataset.section !== name;
  (document.getElementById('settings-save') as HTMLButtonElement).hidden = name !== 'network'; // only the network fields are saved
  showStatus('');
}
for (const nav of document.querySelectorAll<HTMLButtonElement>('.nav-btn')) nav.addEventListener('click', () => showSection(nav.dataset.section as string));
for (const button of el.settingsForm.querySelectorAll<HTMLButtonElement>('[data-clear]')) {
  button.addEventListener('click', async () => {
    const cleared = await api.clearData(button.dataset.clear as string);
    showStatus(cleared ? `Cleared: ${button.textContent}` : '');
  });
}
const updateButton = document.getElementById('update-btn') as HTMLButtonElement;
api.appVersion().then((v) => (document.getElementById('app-version')!.textContent = `Ambaser v${v}`));
updateButton.addEventListener('click', async () => {
  updateButton.disabled = true;
  showStatus('Updating…');
  showStatus(await api.updateApp());
  updateButton.disabled = false;
});
el.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = await api.setNetwork({
    proxyMode: el.proxyMode.value as NetworkSettings['proxyMode'],
    proxyServer: el.proxyServer.value,
    proxyBypass: el.proxyBypass.value,
    dnsMode: el.dnsMode.value as NetworkSettings['dnsMode'],
    dnsUrl: el.dnsUrl.value,
  });
  showStatus(error || 'Saved. Reload open pages to use the new settings.', error !== '');
});

function openFind(): void {
  closePanel();
  closeDropdown();
  el.find.hidden = false;
  resizeChrome();
  el.findText.focus();
  el.findText.select();
  if (el.findText.value) api.find(el.findText.value, true, false);
}

function closeFind(): void {
  if (el.find.hidden) return;
  el.find.hidden = true;
  el.findCount.textContent = '';
  api.stopFind();
  resizeChrome();
}

el.findText.addEventListener('input', () => {
  el.findCount.textContent = '';
  api.find(el.findText.value, true, false);
});
el.findText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) api.find(el.findText.value, !event.shiftKey, true);
  else if (event.key === 'Escape') closeFind();
});
el.findPrev.addEventListener('click', () => api.find(el.findText.value, false, true));
el.findNext.addEventListener('click', () => api.find(el.findText.value, true, true));
el.findClose.addEventListener('click', closeFind);
api.onShowFind(openFind);
api.onFindResult((current, total) => {
  el.findCount.textContent = total ? `${current} / ${total}` : 'No results';
});

api.onShowHistory(openPanel);
api.onEditGroup(openEditor);
api.onState(render);
