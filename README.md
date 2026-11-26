# Ambaser

Ambaser adalah browser dari Ngawi Timur, di-develop oleh Mas Amba di Ambarawa.

A small desktop web browser built on Electron and TypeScript. It has its own tab strip, favorites bar, history, download list and proxy/DNS settings, and keeps memory use low by putting idle tabs to sleep.

## Features

- **Ad blocker**: blocks ads and trackers with Ghostery's engine; the shield button turns it off. Filter lists are downloaded from GitHub and refreshed every few days.
- **VPN** (macOS and Windows x64): the lock button sends this app's traffic through Cloudflare WARP, with no sign-up. The first use downloads [wireproxy](https://github.com/windtf/wireproxy) and asks you to accept Cloudflare's terms. If the tunnel drops, pages are blocked and do not fall back to the normal connection.
- **Tabs**: groups with colors and icons, drag to reorder, hover previews, mute per tab, and a `+N` button that lists the tabs that do not fit.
- **Tab sleep**: a background tab idle for 10 minutes is emptied to free memory and reloads when selected. Tabs that play audio, are loading, or have dev tools open are left alone.
- **Favorites bar**: pages pinned with the star appear under the address bar. Manage them in Settings > Favorites.
- **Address bar**: history and Google suggestions (suggestions are off in incognito).
- **History**: search, delete single entries, or clear everything.
- **Downloads**: files save straight to the Downloads folder, numbered instead of overwritten ("file (1).pdf"). The list pops up when one starts, with progress, pause/resume, cancel, and "show in folder". "Save Image…" still asks where to save. Incognito windows list their own downloads until you quit; the files stay on disk.
- **Settings**: proxy and DNS-over-HTTPS (Network), clear cache / cookies / history (Privacy).
- **Incognito windows**: separate in-memory session, nothing saved.
- **Menu**: the three-dot button holds incognito, profiles, history, developer tools and settings.
- **Profiles**: Menu > Profiles adds, opens, renames, recolours or deletes a profile with its own logins, history, favorites and settings. With more than one, a coloured avatar at the top right and a line along the window show which one you are in. Each one runs as its own copy of the app, so it uses more memory; an extra profile quits when its last window closes, and must be closed before it can be deleted. The first profile cannot be deleted.
- **QR code**: the button at the right end of the address bar shows the current page's address as a QR code, to open it on a phone. It is made locally.
- **Certificate warnings**: a bad certificate shows a warning page. "Proceed" is remembered for that host in the normal profile.
- **Find in page, zoom, reopen closed tab, restore last session.**

## Requirements

- Node.js 20 or newer
- npm

## Getting started

```bash
npm install
npm start      # builds, then launches the app
```

Other scripts:

```bash
npm run build  # compile TypeScript and copy static pages into dist/
npm test       # build, then run the unit tests in test/
```

## Keyboard shortcuts

On macOS use `Cmd` instead of `Ctrl`.

| Shortcut | Action |
| --- | --- |
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Ctrl+N` | New window |
| `Ctrl+Shift+N` | New incognito window |
| `Ctrl+L` | Focus the address bar |
| `Ctrl+1` … `Ctrl+8` / `Ctrl+9` | Go to that tab / the last tab |
| `Ctrl+Alt+Left` / `Right` | Previous / next tab |
| `Ctrl+[` / `Ctrl+]` | Back / forward |
| `Ctrl+Shift+H` | Home |
| `Ctrl+D` | Pin or unpin the page |
| `Ctrl+Shift+R` | Reload without the cache |
| `Ctrl+P` | Print |
| `Ctrl+Shift+W` | Close window |
| `Ctrl+F` | Find in page |
| `Ctrl+R` | Reload |
| `Ctrl+H` (`Cmd+Y` on macOS) | History |
| `F12` or `Ctrl+Shift+I` | Developer tools for the page |
| `Ctrl+Alt+Shift+I` | Developer tools for the browser UI |
| `Ctrl+Plus` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |

## Project layout

```
src/
  main/       Electron main process: windows, tabs, history, downloads, proxy/DNS, permissions
  preload/    The only bridge between the UI and the main process (fixed channels, typed)
  renderer/   Browser chrome UI (tab strip, toolbar, favorites bar, panels)
  shared/     Types and pure logic used by several parts, covered by test/
  home/ cert-error/ load-error/   Built-in pages served from the mybrowser:// scheme
assets/       App icon
scripts/      Build helpers
test/         Unit tests (node --test)
mac-local-proxy/   Separate PHP gateway, see below
```

Web pages run sandboxed with context isolation. Only the chrome UI can send commands to the main process, and only `http`, `https`, `about:blank` and the built-in pages may load.

## Data

Pinned sites, the last session, network settings, site permissions and trusted certificate hosts are stored in `browser-data.json` in the app's user data folder. History is stored beside it. Other profiles keep the same files under `Profiles/` in that folder.

## mac-local-proxy

`mac-local-proxy/` is a separate local PHP (8.1+) gateway for approved internal applications. It is not needed to run the browser. See its `composer.json` and `config/` for setup.

## Notes

- Memory use is capped with startup flags in `src/main/main.ts` (JS heap, disk cache). Raise them if a heavy site runs out of memory.
- The sleep delay is `SLEEP_AFTER_MS` in `src/main/main.ts`.
- Form data typed into a tab that went to sleep is lost.
