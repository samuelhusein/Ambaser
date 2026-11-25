// One Jam room at a time for the whole app. The relay is server/jam-server.js.
import { isAllowedUrl } from '../shared/url';

export type JamMessage = { type: 'media'; paused: boolean; time: number; rate: number } | { type: 'nav'; url: string };

let socket: WebSocket | null = null;

// Anything from the network or a web page is checked here before it is used.
export function parseJam(raw: unknown): JamMessage | null {
  const m = raw as Record<string, unknown> | null;
  if (!m || typeof m !== 'object') return null;
  if (m.type === 'media' && typeof m.paused === 'boolean' && Number.isFinite(m.time) && Number.isFinite(m.rate)) {
    return { type: 'media', paused: m.paused, time: Math.max(0, m.time as number), rate: Math.min(4, Math.max(0.25, m.rate as number)) };
  }
  if (m.type === 'nav' && typeof m.url === 'string' && /^https?:/.test(m.url) && isAllowedUrl(m.url)) return { type: 'nav', url: m.url };
  return null;
}

export function jamJoin(server: string, room: string, onMessage: (m: JamMessage) => void, onStatus: (text: string, inRoom: boolean) => void): void {
  jamLeave();
  if (!/^wss?:\/\/[^\s/]+/.test(server) || !/^[\w-]{1,32}$/.test(room)) return onStatus('Use a ws:// server and a room code of letters, numbers, - or _', false);
  onStatus('Connecting…', false);
  const s = new WebSocket(`${server.replace(/\/+$/, '')}/${room}`);
  let opened = false;
  socket = s;
  s.onopen = () => {
    opened = true;
    onStatus(`In room ${room}`, true);
  };
  s.onmessage = (event) => {
    try {
      const m = parseJam(JSON.parse(String(event.data)));
      if (m) onMessage(m);
    } catch {} // not JSON: ignore
  };
  s.onclose = () => {
    if (socket !== s) return; // we left on purpose
    socket = null;
    onStatus(opened ? 'Disconnected' : 'Could not connect', false);
  };
}

export function jamSend(m: JamMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m));
}

export function jamLeave(): void {
  const s = socket;
  socket = null;
  s?.close();
}
