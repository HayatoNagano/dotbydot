import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 3001;
const MAX_GUESTS = 2;
const PING_INTERVAL = 25_000; // 25s — keep alive under Render's 60s timeout

interface Room {
  code: string;
  host: WebSocket;
  guests: WebSocket[];
}

const rooms = new Map<string, Room>();
/** Map from WebSocket to its guest index within the room */
const guestIndices = new Map<WebSocket, number>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function sendJSON(ws: WebSocket, msg: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** Send a pre-serialized string (avoids re-stringify) */
function sendRaw(ws: WebSocket, data: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

const wss = new WebSocketServer({
  port: PORT,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 1 }, // fast compression
    threshold: 128, // only compress messages > 128 bytes
  },
});

// ─── Ping/pong keepalive (prevents Render from closing idle connections) ───
const aliveSet = new Set<WebSocket>();

const pingTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (!aliveSet.has(ws)) {
      ws.terminate();
      continue;
    }
    aliveSet.delete(ws);
    ws.ping();
  }
}, PING_INTERVAL);

wss.on('close', () => clearInterval(pingTimer));

wss.on('connection', (ws) => {
  aliveSet.add(ws);
  ws.on('pong', () => aliveSet.add(ws));

  let myRoom: Room | null = null;
  let myRole: 'host' | 'guest' | null = null;

  ws.on('message', (raw) => {
    const str = typeof raw === 'string' ? raw : String(raw);
    let msg: { type: string; [key: string]: unknown };
    try {
      msg = JSON.parse(str);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create_room': {
        const code = generateCode();
        const room: Room = { code, host: ws, guests: [] };
        rooms.set(code, room);
        myRoom = room;
        myRole = 'host';
        sendJSON(ws, { type: 'room_created', code });
        console.log(`Room ${code} created`);
        break;
      }

      case 'join_room': {
        const code = String(msg.code).toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendJSON(ws, { type: 'error', message: '部屋が見つかりません' });
          break;
        }
        if (room.guests.length >= MAX_GUESTS) {
          sendJSON(ws, { type: 'error', message: '部屋が満員です' });
          break;
        }
        const guestIndex = room.guests.length;
        room.guests.push(ws);
        guestIndices.set(ws, guestIndex);
        myRoom = room;
        myRole = 'guest';
        sendJSON(ws, { type: 'joined', role: 'guest', guestIndex });
        // Notify host of player count
        const playerCount = 1 + room.guests.length;
        sendJSON(room.host, { type: 'player_joined', playerCount, guestIndex });
        // Notify all existing guests of player count
        for (const g of room.guests) {
          sendJSON(g, { type: 'player_count', playerCount });
        }
        console.log(`Room ${code}: guest ${guestIndex} joined (${playerCount}/3)`);
        break;
      }

      case 'relay': {
        if (!myRoom) break;
        if (myRole === 'host') {
          // Host → guests: forward the raw relay payload without re-serializing
          // Build a minimal wrapper with pre-serialized inner data
          const innerJson = JSON.stringify(msg.data);
          const wrapped = `{"type":"relay","data":${innerJson}}`;
          for (const g of myRoom.guests) {
            sendRaw(g, wrapped);
          }
        } else {
          // Guest → host: tag with guestIndex, forward efficiently
          const gi = guestIndices.get(ws) ?? 0;
          const innerJson = JSON.stringify(msg.data);
          const wrapped = `{"type":"relay","data":${innerJson},"guestIndex":${gi}}`;
          sendRaw(myRoom.host, wrapped);
        }
        break;
      }

      case 'leave': {
        cleanup();
        break;
      }
    }
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);

  function cleanup(): void {
    if (!myRoom) return;
    const room = myRoom;
    const code = room.code;
    myRoom = null;
    aliveSet.delete(ws);

    if (myRole === 'host') {
      // Host left: notify all guests and delete room
      for (const g of room.guests) {
        sendJSON(g, { type: 'opponent_left' });
        guestIndices.delete(g);
      }
      rooms.delete(code);
    } else if (myRole === 'guest') {
      // Guest left: remove from array, notify host
      const idx = room.guests.indexOf(ws);
      if (idx >= 0) room.guests.splice(idx, 1);
      guestIndices.delete(ws);
      const playerCount = 1 + room.guests.length;
      sendJSON(room.host, { type: 'player_left', playerCount });
      // Notify remaining guests
      for (const g of room.guests) {
        sendJSON(g, { type: 'player_count', playerCount });
      }
    }
    console.log(`Room ${code}: ${myRole} left`);
    myRole = null;
  }
});

console.log(`dot by dot relay server running on ws://localhost:${PORT}`);
