// The bundled home and certificate-warning pages, served on our own mybrowser: protocol.
import { net, protocol, session, WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { CERT_ERROR_HOST, LOAD_ERROR_HOST, normalizeInput } from '../shared/url';
import { allHistory } from './history';
import { store } from './store';

export interface WallpaperCredit {
  author: string;
  url: string; // the photo's page, to credit it properly
}

// The day's photo (same for everyone, chosen by date) rarely changes within a run, so its credit
// is fetched once per day and reused; concurrent new tabs share the one request in flight.
let creditCache: { day: string; value: Promise<WallpaperCredit | null> } | null = null;

async function fetchCredit(day: string): Promise<WallpaperCredit | null> {
  try {
    // A tiny request is enough: Lorem Picsum (which serves Unsplash photos) returns the chosen
    // photo's id in a header regardless of the size asked for.
    const tiny = await net.fetch(`https://picsum.photos/seed/${day}/16/16`, { signal: AbortSignal.timeout(4000) });
    const id = tiny.headers.get('picsum-id');
    if (!id) return null;
    const info: unknown = await net.fetch(`https://picsum.photos/id/${id}/info`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json());
    const { author, url } = (info ?? {}) as Record<string, unknown>;
    return typeof author === 'string' && typeof url === 'string' ? { author, url } : null;
  } catch {
    return null; // offline, blocked, or Picsum is unreachable: the photo already falls back gracefully, and so does its credit
  }
}

function wallpaperCredit(day: string): Promise<WallpaperCredit | null> {
  if (creditCache?.day !== day) creditCache = { day, value: fetchCredit(day) };
  return creditCache.value;
}

const CONTENT_TYPES: Record<string, string> = { html: 'text/html', css: 'text/css', js: 'text/javascript' };

// Bad certificates the user accepted: host -> fingerprint, so a different certificate warns again.
// Kept on disk for normal windows, in memory for incognito ones.
const temporary = new Map<Electron.Session, Map<string, string>>();
// The last certificate each session refused per host: what "Proceed anyway" accepts.
const refused = new WeakMap<Electron.Session, Map<string, string>>();

// Must run before app is ready.
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'mybrowser', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

export function isTrusted(ses: Electron.Session, url: string, fingerprint: string): boolean {
  if (!URL.canParse(url)) return false;
  const { host } = new URL(url);
  const accepted = ses.isPersistent() ? store.certificate(host) : temporary.get(ses)?.get(host);
  if (accepted === fingerprint) return true;
  const seen = refused.get(ses) ?? new Map<string, string>();
  refused.set(ses, seen.set(host, fingerprint));
  return false;
}

function trust(ses: Electron.Session, host: string): void {
  const fingerprint = refused.get(ses)?.get(host);
  if (!fingerprint) return;
  if (ses.isPersistent()) store.setCertificate(host, fingerprint);
  else temporary.set(ses, (temporary.get(ses) ?? new Map<string, string>()).set(host, fingerprint));
}

export function hasAcceptedCertificate(ses: Electron.Session, host: string): boolean {
  return (ses.isPersistent() ? store.certificate(host) : temporary.get(ses)?.get(host)) !== undefined;
}

export function forgetCertificate(ses: Electron.Session, host: string): void {
  if (ses.isPersistent()) store.removeCertificate(host);
  else temporary.get(ses)?.delete(host);
}

export function forgetCertificates(): void {
  temporary.clear();
  store.clearCertificates();
}

// No file path ever comes from the request: only plain names inside the page's own folder.
function serveFile(folder: string, pathname: string): Response {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!/^[a-z0-9-]+\.(html|css|js)$/i.test(file)) return new Response('Not found', { status: 404 });
  try {
    return new Response(fs.readFileSync(path.join(__dirname, '..', folder, file)), {
      headers: { 'Content-Type': CONTENT_TYPES[file.split('.').pop() ?? ''] },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// Read-only: any website can send requests here, so nothing served by the protocol changes anything.
async function handle(request: Request, incognito: boolean): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['home', CERT_ERROR_HOST, LOAD_ERROR_HOST].includes(url.hostname)) return new Response('Not found', { status: 404 });
  if (url.hostname === 'home' && url.pathname === '/api/data') {
    // An incognito home page shows the pinned sites only, nothing about past browsing.
    // A page without a saved icon borrows one from another page of the same site.
    const known = new Map<string, string>();
    for (const e of [...store.pinned(), ...(incognito ? [] : allHistory())]) if (e.favicon && URL.canParse(e.url)) known.set(new URL(e.url).host, e.favicon);
    const withIcon = <T extends { url: string; favicon?: string | null }>(e: T): T => ({ ...e, favicon: e.favicon || (URL.canParse(e.url) ? known.get(new URL(e.url).host) : undefined) });
    // Decided here, not by the page's own clock, so the photo and its credit always agree on which day it is.
    const wallpaperDay = new Date().toLocaleDateString('en-CA');
    const { wallpaper, theme } = store.appearance();
    const credit = wallpaper === 'daily' ? await wallpaperCredit(wallpaperDay) : null;
    return Response.json({
      incognito,
      theme,
      wallpaper,
      wallpaperDay,
      wallpaperCredit: credit,
      pinned: store.pinned().map(withIcon),
      recent: incognito ? [] : allHistory().slice(0, 6).map(withIcon),
    });
  }
  return serveFile(url.hostname, url.pathname);
}

// What our pages can change is asked for by navigating to an action URL. Call this only for navigations
// the page itself started (will-navigate): it checks which of our pages the tab is on.
export function runPageAction(wc: WebContents, target: string): boolean {
  if (!URL.canParse(target)) return false;
  const from = wc.getURL();
  const action = new URL(target);
  const url = action.searchParams.get('url') ?? '';
  if (action.href.startsWith('mybrowser://home/unpin') && from.startsWith('mybrowser://home/')) {
    store.unpin(url);
    wc.reload();
    return true;
  }
  if (action.href.startsWith('mybrowser://home/open') && from.startsWith('mybrowser://home/')) {
    const target = normalizeInput(action.searchParams.get('q') ?? '');
    if (target) wc.loadURL(target).catch((err: Error) => console.error(`loadURL ${target}: ${err.message}`));
    return true;
  }
  if (action.href.startsWith(`mybrowser://${CERT_ERROR_HOST}/trust`) && from.startsWith(`mybrowser://${CERT_ERROR_HOST}/`)) {
    if (/^https:/i.test(url) && URL.canParse(url)) {
      trust(wc.session, new URL(url).host);
      wc.loadURL(url).catch((err: Error) => console.error(`loadURL ${url}: ${err.message}`));
    }
    return true;
  }
  return false;
}

// protocol.handle only covers the default session, so each tab partition needs its own registration.
const registered = new Set<string>();
export function registerPages(partition: string): void {
  if (registered.has(partition)) return;
  registered.add(partition);
  const ses = session.fromPartition(partition);
  ses.protocol.handle('mybrowser', (request) => handle(request, !partition.startsWith('persist:')));
}
