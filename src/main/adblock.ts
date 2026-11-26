// Built-in ad and tracker blocking, using Ghostery's engine with the EasyList family of filter lists.
import { app, ipcMain, session, Session } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { store } from './store';

const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // older filter lists are downloaded again at the next start
const sessions = new Set<Session>();
let blocker: ElectronBlocker | null = null;

function apply(ses: Session): void {
  if (!blocker || store.adblock() === blocker.isBlockingEnabled(ses)) return;
  if (!store.adblock()) return blocker.disableBlockingInSession(ses);
  // The library registers these app-wide once per session, and Electron refuses a second handler.
  ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters');
  ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled');
  blocker.enableBlockingInSession(ses);
}

// The library fires all of a page's scripts at once and handles no failure: on YouTube that is dozens of
// load listeners and a stream of unhandled rejections. Run them one by one and drop the ones that fail.
// Each gets its own scope too: run bare, their helpers become page globals that collide with each other
// and with the site's own names (YouTube lost its icons and logo).
function queueScripts(engine: ElectronBlocker): void {
  const inject = engine.onInjectCosmeticFilters;
  engine.onInjectCosmeticFilters = (event, url, msg) => {
    let queue: Promise<unknown> = Promise.resolve();
    const sender = {
      insertCSS: (css: string, options: Electron.InsertCSSOptions) => event.sender.insertCSS(css, options).catch(() => {}),
      executeJavaScript: (code: string, gesture: boolean) => {
        queue = queue.then(() => event.sender.executeJavaScript(`(() => {\n${code}\n})()`, gesture)).catch(() => {});
      },
    };
    return inject({ frameId: event.frameId, processId: event.processId, sender } as unknown as Electron.IpcMainInvokeEvent, url, msg);
  };
}

export function watchAdblock(partition: string): void {
  const ses = session.fromPartition(partition);
  sessions.add(ses);
  apply(ses);
}

export function applyAdblock(): void {
  sessions.forEach(apply);
}

export async function loadAdblock(partition: string): Promise<void> {
  const file = path.join(app.getPath('userData'), 'adblock-engine.bin');
  const load = (maxAge: number): Promise<ElectronBlocker> =>
    // Fetched through the web session, so the proxy setting applies.
    ElectronBlocker.fromPrebuiltAdsAndTracking((url: string) => session.fromPartition(partition).fetch(url), {
      path: file,
      read: async (p: string) => {
        if (Date.now() - (await fs.promises.stat(p)).mtimeMs > maxAge) throw new Error('stale');
        return fs.promises.readFile(p);
      },
      write: fs.promises.writeFile,
    });
  try {
    // Without a connection, an old copy is better than none.
    blocker = await load(MAX_AGE_MS).catch(() => load(Infinity));
    queueScripts(blocker);
    applyAdblock();
  } catch (err) {
    console.error(`adblock: ${(err as Error).message}`);
  }
}
