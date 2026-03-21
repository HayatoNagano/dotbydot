import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 3001;
const MAX_GUESTS = 2;

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

function send(ws: WebSocket, msg: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  let myRoom: Room | null = null;
  let myRole: 'host' | 'guest' | null = null;

  ws.on('message', (raw) => {
    let msg: { type: string; [key: string]: unknown };
    try {
      msg = JSON.parse(String(raw));
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
        send(ws, { type: 'room_created', code });
        console.log(`Room ${code} created`);
        break;
      }

      case 'join_room': {
        const code = String(msg.code).toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          send(ws, { type: 'error', message: '部屋が見つかりません' });
          break;
        }
        if (room.guests.length >= MAX_GUESTS) {
          send(ws, { type: 'error', message: '部屋が満員です' });
          break;
        }
        const guestIndex = room.guests.length;
        room.guests.push(ws);
        guestIndices.set(ws, guestIndex);
        myRoom = room;
        myRole = 'guest';
        send(ws, { type: 'joined', role: 'guest', guestIndex });
        // Notify host of player count
        const playerCount = 1 + room.guests.length;
        send(room.host, { type: 'player_joined', playerCount, guestIndex });
        // Notify all existing guests of player count
        for (const g of room.guests) {
          send(g, { type: 'player_count', playerCount });
        }
        console.log(`Room ${code}: guest ${guestIndex} joined (${playerCount}/3)`);
        break;
      }

      case 'relay': {
        if (!myRoom) break;
        if (myRole === 'host') {
          // Host broadcasts to all guests
          for (const g of myRoom.guests) {
            send(g, { type: 'relay', data: msg.data });
          }
        } else {
          // Guest sends to host, tagged with guestIndex
          const gi = guestIndices.get(ws) ?? 0;
          send(myRoom.host, { type: 'relay', data: msg.data, guestIndex: gi });
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

    if (myRole === 'host') {
      // Host left: notify all guests and delete room
      for (const g of room.guests) {
        send(g, { type: 'opponent_left' });
        guestIndices.delete(g);
      }
      rooms.delete(code);
    } else if (myRole === 'guest') {
      // Guest left: remove from array, notify host
      const idx = room.guests.indexOf(ws);
      if (idx >= 0) room.guests.splice(idx, 1);
      guestIndices.delete(ws);
      const playerCount = 1 + room.guests.length;
      send(room.host, { type: 'player_left', playerCount });
      // Notify remaining guests
      for (const g of room.guests) {
        send(g, { type: 'player_count', playerCount });
      }
    }
    console.log(`Room ${code}: ${myRole} left`);
    myRole = null;
  }
});

console.log(`dot by dot relay server running on ws://localhost:${PORT}`);
