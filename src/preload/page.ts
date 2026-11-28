// Runs in web pages and exposes nothing to them. Electron can only answer "allowed or not", so a site
// that has never asked about notifications would read "denied" and never ask. This reports "default".
import { contextBridge, ipcRenderer } from 'electron';

if (ipcRenderer.sendSync('permission:notifications') === 'default') {
  contextBridge.executeInMainWorld({
    func: () => {
      let state: NotificationPermission = 'default';
      const request = Notification.requestPermission.bind(Notification);
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => state });
      Notification.requestPermission = async (callback?: NotificationPermissionCallback) => {
        state = await request();
        callback?.(state);
        return state;
      };
    },
  });
}

// The media control center drives the page's player from here. It notes the page's own media-session
// handlers (they cannot be read back later) and the last element that played, which can be detached
// (new Audio()). The main process calls it through executeJavaScript; it only calls the page's own player.
// shortcut: top frame only, so a player inside an iframe is not seen; add nodeIntegrationInSubFrames if needed.
contextBridge.executeInMainWorld({
  func: () => {
    const handlers = new Map<string, MediaSessionActionHandler>();
    let position: (MediaPositionState & { at: number }) | null = null;
    let last: HTMLMediaElement | null = null;
    const session = navigator.mediaSession;
    if (session) {
      const setHandler = session.setActionHandler.bind(session);
      session.setActionHandler = (action, handler) => {
        if (handler) handlers.set(action, handler);
        else handlers.delete(action);
        setHandler(action, handler);
      };
      const setPosition = session.setPositionState.bind(session);
      session.setPositionState = (state) => {
        position = state?.duration ? { ...state, at: performance.now() } : null;
        setPosition(state);
      };
    }
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      last = this;
      return play.call(this);
    };
    document.addEventListener('play', (event) => (last = event.target as HTMLMediaElement), true);
    const element = (): HTMLMediaElement | null => last ?? document.querySelector('video, audio');

    Object.defineProperty(window, Symbol.for('ambaser.media'), {
      value: (command: string, value: number) => {
        const media = element();
        const meta = session?.metadata;
        const playing = media ? !media.paused : session?.playbackState === 'playing';
        const call = (action: MediaSessionAction, details: Partial<MediaSessionActionDetails> = {}): boolean => {
          const handler = handlers.get(action);
          handler?.({ action, ...details } as MediaSessionActionDetails);
          return !!handler;
        };
        if (command === 'state') {
          let duration = media && Number.isFinite(media.duration) ? media.duration : 0;
          let time = media?.currentTime ?? 0;
          if (position) {
            duration = position.duration ?? 0;
            time = (position.position ?? 0) + (playing ? ((performance.now() - position.at) / 1000) * (position.playbackRate ?? 1) : 0);
          }
          if (!media && !meta) return null;
          return {
            title: meta?.title || document.title,
            artist: meta?.artist ?? '',
            artwork: meta?.artwork.at(-1)?.src ?? '', // listed small to large
            playing,
            duration,
            time: Math.min(Math.max(time, 0), duration),
            canPrevious: handlers.has('previoustrack'),
            canNext: handlers.has('nexttrack'),
            canPip: media instanceof HTMLVideoElement && document.pictureInPictureEnabled,
          };
        }
        if (command === 'playpause') {
          if (!call(playing ? 'pause' : 'play')) void (playing ? media?.pause() : media?.play());
        } else if (command === 'previoustrack' || command === 'nexttrack') call(command);
        else if (command === 'seekbackward' || command === 'seekforward') {
          const offset = command === 'seekbackward' ? -10 : 10;
          if (!call(command, { seekOffset: 10 }) && media) media.currentTime += offset;
        } else if (command === 'seekto') {
          if (!call('seekto', { seekTime: value }) && media) media.currentTime = value;
        } else if (command === 'pip' && media instanceof HTMLVideoElement) {
          void (document.pictureInPictureElement ? document.exitPictureInPicture() : media.requestPictureInPicture());
        }
        return null;
      },
    });
  },
});

// Where this machine cannot decode AV1 in hardware, YouTube is told AV1 is unsupported and sends VP9,
// which keeps 4K smooth and the CPU cool (see probeAv1 in main.ts).
if (/(^|\.)youtube\.com$/.test(location.hostname) && ipcRenderer.sendSync('media:av1') === false) {
  contextBridge.executeInMainWorld({
    func: () => {
      const av1 = (type: unknown): boolean => /av01/i.test(String(type ?? ''));
      const isTypeSupported = MediaSource.isTypeSupported.bind(MediaSource);
      MediaSource.isTypeSupported = (type) => !av1(type) && isTypeSupported(type);
      const canPlayType = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function (this: HTMLMediaElement, type: string) {
        return av1(type) ? '' : canPlayType.call(this, type);
      };
      const decodingInfo = MediaCapabilities.prototype.decodingInfo;
      MediaCapabilities.prototype.decodingInfo = function (this: MediaCapabilities, config: MediaDecodingConfiguration) {
        if (av1(config?.video?.contentType)) return Promise.resolve({ supported: false, smooth: false, powerEfficient: false } as MediaCapabilitiesDecodingInfo);
        return decodingInfo.call(this, config);
      };
    },
  });
}

// Two-finger swipe left/right goes back/forward, with an arrow bubble like Chrome's. It only starts when
// nothing under the pointer can scroll that way and the page did not claim the wheel for itself.
const SWIPE_DISTANCE = 160; // horizontal scroll, in pixels, that arms the navigation
const SWIPE_QUIET_MS = 200; // a pause this long separates two gestures, so leftover momentum never counts
type Direction = 'back' | 'forward';
let swipe: { direction: Direction; distance: number; allowed: boolean } | null = null;
let ignoring = false; // this gesture is a normal scroll, or is already over
let lastWheel = performance.now(); // momentum from the previous page's swipe must not start another one
let release: ReturnType<typeof setTimeout> | undefined;
let bubble: HTMLElement | null = null;

function canScroll(path: EventTarget[], left: boolean): boolean {
  return path.some((node) => {
    if (!(node instanceof Element)) return false;
    const root = node === document.scrollingElement;
    const outer = node === document.documentElement || node === document.body;
    const { overflowX, overscrollBehaviorX } = getComputedStyle(node);
    // The page asked to keep sideways overscroll to itself.
    if (outer && overscrollBehaviorX !== 'auto') return true;
    const max = node.scrollWidth - node.clientWidth;
    if (max <= 1 || !(root ? !/hidden|clip/.test(overflowX) : /auto|scroll/.test(overflowX))) return false;
    // Right-to-left content counts scrollLeft from 0 down to -max.
    const position = getComputedStyle(node).direction === 'rtl' ? node.scrollLeft + max : node.scrollLeft;
    return left ? position > 1 : position < max - 1;
  });
}

function draw(): void {
  if (!swipe?.allowed) return;
  const back = swipe.direction === 'back';
  const progress = Math.max(0, Math.min(1, swipe.distance / SWIPE_DISTANCE));
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.style.cssText = 'all:initial;position:fixed;top:50%;width:44px;height:44px;margin-top:-22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:24px/1 system-ui;box-shadow:0 2px 10px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none';
    document.documentElement.append(bubble);
  }
  bubble.textContent = back ? '←' : '→';
  bubble.style.left = back ? `${progress * 68 - 52}px` : 'auto';
  bubble.style.right = back ? 'auto' : `${progress * 68 - 52}px`;
  bubble.style.opacity = String(Math.min(1, progress * 2));
  bubble.style.background = progress === 1 ? '#1a73e8' : '#fff';
  bubble.style.color = progress === 1 ? '#fff' : '#1a73e8';
}

// Fingers lifted: navigate if the swipe went far enough.
function endSwipe(): void {
  clearTimeout(release);
  if (swipe?.allowed && swipe.distance >= SWIPE_DISTANCE) ipcRenderer.send('swipe:go', swipe.direction);
  if (swipe) ignoring = true; // the momentum that follows belongs to this gesture
  swipe = null;
  bubble?.remove();
  bubble = null;
}

function onSwipe(dx: number, dy: number, path: EventTarget[]): void {
  const now = performance.now();
  if (now - lastWheel > SWIPE_QUIET_MS) {
    endSwipe();
    ignoring = false;
  }
  lastWheel = now;
  if (ignoring) return;
  if (!swipe) {
    if (Math.abs(dx) <= Math.abs(dy) * 2 || canScroll(path, dx < 0)) {
      ignoring = Math.abs(dx) + Math.abs(dy) > 4; // tiny first movements do not decide yet
      return;
    }
    const started = { direction: (dx < 0 ? 'back' : 'forward') as Direction, distance: 0, allowed: false };
    swipe = started;
    void ipcRenderer.invoke('swipe:can', started.direction).then((allowed: boolean) => {
      started.allowed = allowed;
      if (swipe === started) draw();
    }, () => {}); // popups have no history gesture
  }
  swipe.distance = Math.max(0, swipe.distance + (swipe.direction === 'back' ? -dx : dx));
  draw();
  // The main process reports the lift; this covers the case where it does not.
  clearTimeout(release);
  release = setTimeout(endSwipe, 500);
}

window.addEventListener('wheel', (event) => {
  if (!event.isTrusted || event.ctrlKey || event.shiftKey || event.deltaMode !== 0) return;
  const path = event.composedPath();
  // Checked after the page's own listeners had their chance to cancel the event.
  setTimeout(() => {
    if (!event.defaultPrevented) onSwipe(event.deltaX, event.deltaY, path);
  });
}, { passive: true });
window.addEventListener('pageshow', () => (lastWheel = performance.now()));
ipcRenderer.on('swipe:end', endSwipe);

document.addEventListener('visibilitychange', () => ipcRenderer.send('page:visibility', document.hidden));

// Picture-in-picture's "back to tab" button only closes the small window; the browser has to come back by
// itself. Its close button pauses the video, which tells the two apart.
document.addEventListener('leavepictureinpicture', (event) => {
  const video = event.target;
  if (!document.hidden || !(video instanceof HTMLVideoElement)) return;
  setTimeout(() => {
    if (video.isConnected && !video.paused) ipcRenderer.send('pip:back');
  }, 300);
}, true);
