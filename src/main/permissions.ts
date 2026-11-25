// Asks the user before a site gets notifications, location, camera, microphone or the clipboard.
import { BrowserWindow, dialog, ipcMain, session, WebContents } from 'electron';
import { isHarmless, kindsOf, question, secureOrigin } from '../shared/permissions';
import { store } from './store';

// Incognito answers live only as long as the app.
const temporary = new Map<string, boolean>();
const pending = new Map<string, Promise<boolean>>();

async function ask(wc: WebContents | null, origin: string, kind: string, remember: boolean): Promise<boolean> {
  const key = `${origin} ${kind}`;
  const known = remember ? store.permission(key) : temporary.get(key);
  if (known !== undefined) return known;
  const text = question(kind);
  if (!text) return false;

  let answer = pending.get(key);
  if (!answer) {
    const options = { type: 'question' as const, message: `Allow ${origin} to ${text}?`, buttons: ['Block', 'Allow'], defaultId: 0, cancelId: 0 };
    const parent = (wc && BrowserWindow.fromWebContents(wc)) || BrowserWindow.getFocusedWindow();
    answer = (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)).then(({ response }) => {
      const allowed = response === 1;
      if (remember) store.setPermission(key, allowed);
      else temporary.set(key, allowed);
      pending.delete(key);
      return allowed;
    });
    pending.set(key, answer);
  }
  return answer;
}

const registered = new Set<string>();
export function guardPermissions(partition: string): void {
  if (registered.has(partition)) return;
  registered.add(partition);
  const ses = session.fromPartition(partition);
  const remember = partition.startsWith('persist:');

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (isHarmless(permission)) return callback(true);
    const origin = secureOrigin(details.requestingUrl);
    const kinds = kindsOf(permission, (details as { mediaTypes?: string[] }).mediaTypes);
    if (!origin || kinds.length === 0) return callback(false);
    void (async () => {
      for (const kind of kinds) if (!(await ask(wc, origin, kind, remember))) return callback(false);
      callback(true);
    })();
  });

  // Silent checks never prompt: they are true only for what was already allowed.
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    if (isHarmless(permission)) return true;
    const origin = secureOrigin(requestingOrigin);
    const kinds = kindsOf(permission, details.mediaType ? [details.mediaType] : []);
    const allowed = (kind: string): boolean => (remember ? store.permission(`${origin} ${kind}`) : temporary.get(`${origin} ${kind}`)) === true;
    return origin !== null && kinds.length > 0 && kinds.every(allowed);
  });
}

// What the page preload should report. Only answers about the asking page's own address.
ipcMain.on('permission:notifications', (event) => {
  const origin = secureOrigin(event.senderFrame?.url ?? '');
  const key = `${origin} notifications`;
  const answer = event.sender.session.isPersistent() ? store.permission(key) : temporary.get(key);
  event.returnValue = !origin ? 'denied' : answer === undefined ? 'default' : answer ? 'granted' : 'denied';
});

export function resetPermissions(): void {
  temporary.clear();
  store.clearPermissions();
}
