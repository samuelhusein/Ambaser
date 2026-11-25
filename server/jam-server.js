// Relay for Jam rooms: forwards each message to the others in the same room.
// Run: node server/jam-server.js   (PORT=8787 by default). Clients connect to ws://host:PORT/<room>.
const { WebSocketServer } = require('ws');

const rooms = new Map(); // room -> { clients: Set, last: latest media message }
const wss = new WebSocketServer({ port: Number(process.env.PORT) || 8787, maxPayload: 2048 });

wss.on('connection', (socket, req) => {
  const code = decodeURIComponent((req.url ?? '/').slice(1));
  if (!/^[\w-]{1,32}$/.test(code)) return socket.close(1008, 'bad room');
  const room = rooms.get(code) ?? { clients: new Set(), last: null };
  rooms.set(code, room);
  room.clients.add(socket);
  if (room.last) socket.send(room.last); // late joiners catch up

  socket.on('message', (data, isBinary) => {
    if (isBinary) return;
    const text = data.toString();
    try {
      if (JSON.parse(text).type === 'media') room.last = text;
    } catch {
      return;
    }
    for (const other of room.clients) if (other !== socket && other.readyState === 1) other.send(text);
  });
  socket.on('close', () => {
    room.clients.delete(socket);
    if (!room.clients.size) rooms.delete(code);
  });
});

console.log(`Jam server on port ${wss.options.port}`);
