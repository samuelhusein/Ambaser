"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJam = parseJam;
exports.jamJoin = jamJoin;
exports.jamSend = jamSend;
exports.jamLeave = jamLeave;
// One Jam room at a time for the whole app. The relay is server/jam-server.js.
const url_1 = require("../shared/url");
let socket = null;
// Anything from the network or a web page is checked here before it is used.
function parseJam(raw) {
    const m = raw;
    if (!m || typeof m !== 'object')
        return null;
    if (m.type === 'media' && typeof m.paused === 'boolean' && Number.isFinite(m.time) && Number.isFinite(m.rate)) {
        return { type: 'media', paused: m.paused, time: Math.max(0, m.time), rate: Math.min(4, Math.max(0.25, m.rate)) };
    }
    if (m.type === 'nav' && typeof m.url === 'string' && /^https?:/.test(m.url) && (0, url_1.isAllowedUrl)(m.url))
        return { type: 'nav', url: m.url };
    return null;
}
function jamJoin(server, room, onMessage, onStatus) {
    jamLeave();
    if (!/^wss?:\/\/[^\s/]+/.test(server) || !/^[\w-]{1,32}$/.test(room))
        return onStatus('Use a ws:// server and a room code of letters, numbers, - or _', false);
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
            if (m)
                onMessage(m);
        }
        catch { } // not JSON: ignore
    };
    s.onclose = () => {
        if (socket !== s)
            return; // we left on purpose
        socket = null;
        onStatus(opened ? 'Disconnected' : 'Could not connect', false);
    };
}
function jamSend(m) {
    if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(m));
}
function jamLeave() {
    const s = socket;
    socket = null;
    s?.close();
}
