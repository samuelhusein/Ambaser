// The bundled home and certificate-warning pages, served on our own mybrowser: protocol.
import { protocol, session, WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { CERT_ERROR_HOST, LOAD_ERROR_HOST } from '../shared/url';
import { store } from './store';

const CONTENT_TYPES: Record<string, string> = { html: 'text/html', css: 'text/css', js: 'text/javascript' };

// Hosts the user chose to trust despite a bad certificate. Remembered on disk for the normal profile;
// incognito sessions keep them in memory only.
const trustedHosts = new Map<Electron.Session, Set<string>>();

// Must run before app is ready.
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'mybrowser', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

export function isTrusted(ses: Electron.Session, url: string): boolean {
  try {
    const host = new URL(url).host;
    return (trustedHosts.get(ses)?.has(host) ?? false) || (ses.isPersistent() && store.isTrustedHost(host));
  } catch {
    return false;
  }
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
function handle(request: Request): Response {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['home', CERT_ERROR_HOST, LOAD_ERROR_HOST].includes(url.hostname)) return new Response('Not found', { status: 404 });
  if (url.hostname === 'home' && url.pathname === '/api/data') return Response.json({ pinned: store.pinned(), lastSession: store.lastSession() });
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
  if (action.href.startsWith(`mybrowser://${CERT_ERROR_HOST}/trust`) && from.startsWith(`mybrowser://${CERT_ERROR_HOST}/`)) {
    if (/^https:/i.test(url) && URL.canParse(url)) {
      const host = new URL(url).host;
      trustedHosts.get(wc.session)?.add(host);
      if (wc.session.isPersistent()) store.trustHost(host);
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
  trustedHosts.set(ses, new Set());
  ses.protocol.handle('mybrowser', handle);
}
