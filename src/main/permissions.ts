// Asks the user before a site gets notifications, location, camera, microphone or the clipboard.
import { BrowserWindow, dialog, ipcMain, session, Session, WebContents } from 'electron';
import { isHarmless, KINDS, kindsOf, question, secureOrigin } from '../shared/permissions';
import type { PermissionValue } from '../shared/types';
import { store } from './store';

// Incognito answers belong to their own window's session and go when it closes (forgetPermissions).
const temporary = new Map<Session, Map<string, boolean>>();
const pending = new Map<Session, Map<string, Promise<boolean>>>();
const saved = (ses: Session, key: string): boolean | undefined => (ses.isPersistent() ? store.permission(key) : temporary.get(ses)?.get(key));
function save(ses: Session, key: string, allowed: boolean): void {
  if (ses.isPersistent()) store.setPermission(key, allowed);
  else temporary.set(ses, (temporary.get(ses) ?? new Map<string, boolean>()).set(key, allowed));
}

async function ask(wc: WebContents | null, ses: Session, origin: string, kind: string): Promise<boolean> {
  const key = `${origin} ${kind}`;
  const known = saved(ses, key);
  if (known !== undefined) return known;
  const text = question(kind);
  if (!text) return false;

  const waiting = pending.get(ses) ?? new Map<string, Promise<boolean>>();
  pending.set(ses, waiting);
  let answer = waiting.get(key);
  if (!answer) {
    const options = { type: 'question' as const, message: `Allow ${origin} to ${text}?`, buttons: ['Block', 'Allow'], defaultId: 0, cancelId: 0 };
    const parent = (wc && BrowserWindow.fromWebContents(wc)) || BrowserWindow.getFocusedWindow();
    answer = (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)).then(({ response }) => {
      const allowed = response === 1;
      save(ses, key, allowed);
      waiting.delete(key);
      return allowed;
    });
    waiting.set(key, answer);
  }
  return answer;
}

export function forgetPermissions(ses: Session): void {
  temporary.delete(ses);
  pending.delete(ses);
}

const registered = new Set<string>();
export function guardPermissions(partition: string): void {
  if (registered.has(partition)) return;
  registered.add(partition);
  const ses = session.fromPartition(partition);

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (isHarmless(permission)) return callback(true);
    const origin = secureOrigin(details.requestingUrl);
    const kinds = kindsOf(permission, (details as { mediaTypes?: string[] }).mediaTypes);
    if (!origin || kinds.length === 0) return callback(false);
    void (async () => {
      for (const kind of kinds) if (!(await ask(wc, ses, origin, kind))) return callback(false);
      callback(true);
    })();
  });

  // Silent checks never prompt: they are true only for what was already allowed.
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    if (isHarmless(permission)) return true;
    const origin = secureOrigin(requestingOrigin);
    const kinds = kindsOf(permission, details.mediaType ? [details.mediaType] : []);
    const allowed = (kind: string): boolean => saved(ses, `${origin} ${kind}`) === true;
    return origin !== null && kinds.length > 0 && kinds.every(allowed);
  });
}

// What the page preload should report. Only answers about the asking page's own address.
ipcMain.on('permission:notifications', (event) => {
  const origin = secureOrigin(event.senderFrame?.url ?? '');
  const key = `${origin} notifications`;
  const answer = saved(event.sender.session, key);
  event.returnValue = !origin ? 'denied' : answer === undefined ? 'default' : answer ? 'granted' : 'denied';
});

// True if the user let this page send notifications.
export function allowsNotifications(ses: Electron.Session, url: string): boolean {
  const key = `${secureOrigin(url)} notifications`;
  return saved(ses, key) === true;
}

// The saved answers for one site, as shown by the address bar's site button.
export function sitePermissions(ses: Electron.Session, origin: string): { kind: string; value: PermissionValue }[] {
  return KINDS.map((kind) => {
    const key = `${origin} ${kind}`;
    const answer = saved(ses, key);
    return { kind, value: answer === undefined ? 'ask' : answer ? 'allow' : 'block' };
  });
}

export function setSitePermission(ses: Electron.Session, origin: string, kind: string, value: unknown): void {
  if (!KINDS.includes(kind) || !['ask', 'allow', 'block'].includes(value as string)) return;
  const key = `${origin} ${kind}`;
  if (value === 'ask') {
    if (ses.isPersistent()) store.removePermission(key);
    else temporary.get(ses)?.delete(key);
  } else save(ses, key, value === 'allow');
}

export function resetPermissions(): void {
  temporary.clear();
  store.clearPermissions();
}
