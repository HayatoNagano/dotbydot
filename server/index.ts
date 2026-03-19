import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 3001;

interface Room {
  code: string;
  host: WebSocket;
  guest: WebSocket | null;
}

const rooms = new Map<string, Room>();

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
        const room: Room = { code, host: ws, guest: null };
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
        if (room.guest) {
          send(ws, { type: 'error', message: '部屋が満員です' });
          break;
        }
        room.guest = ws;
        myRoom = room;
        myRole = 'guest';
        send(ws, { type: 'joined', role: 'guest' });
        send(room.host, { type: 'opponent_joined' });
        console.log(`Room ${code}: guest joined`);
        break;
      }

      case 'relay': {
        if (!myRoom) break;
        const target = myRole === 'host' ? myRoom.guest : myRoom.host;
        if (target) {
          send(target, { type: 'relay', data: msg.data });
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
      if (room.guest) send(room.guest, { type: 'opponent_left' });
      rooms.delete(code);
    } else if (myRole === 'guest') {
      room.guest = null;
      send(room.host, { type: 'opponent_left' });
    }
    console.log(`Room ${code}: ${myRole} left`);
    myRole = null;
  }
});

console.log(`dot by dot relay server running on ws://localhost:${PORT}`);
