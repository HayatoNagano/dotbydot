/**
 * dot by dot — Dedicated game server
 *
 * Manages rooms, runs headless Game simulations, and broadcasts
 * state to all connected clients. All players are equal clients.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { ServerRoom } from './ServerRoom';
import { OnlineRole, NetInput, NetSkillCheckResult } from '../src/net/protocol';

const PORT = Number(process.env.PORT) || 3001;
const MAX_PLAYERS = 4; // 1 killer + 3 survivors
const PING_INTERVAL = 25_000;

interface PlayerSlot {
  ws: WebSocket;
  role: OnlineRole;
  charDefId: string | null;
  ready: boolean;
}

interface Room {
  code: string;
  hostWs: WebSocket; // The player who created the room (manages lobby)
  players: PlayerSlot[];
  serverRoom: ServerRoom | null; // null until game starts
}

const rooms = new Map<string, Room>();
/** Map from WebSocket to its room and slot */
const playerMap = new Map<WebSocket, { room: Room; slot: PlayerSlot }>();

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

function sendRaw(ws: WebSocket, data: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

const wss = new WebSocketServer({
  port: PORT,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 1 },
    threshold: 128,
  },
});

// ─── Ping/pong keepalive ───
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
        const role = (msg.role as OnlineRole) || 'killer';
        const slot: PlayerSlot = { ws, role, charDefId: null, ready: false };
        const room: Room = { code, hostWs: ws, players: [slot], serverRoom: null };
        rooms.set(code, room);
        playerMap.set(ws, { room, slot });
        sendJSON(ws, { type: 'room_created', code, role });
        console.log(`Room ${code} created (${role})`);
        break;
      }

      case 'join_room': {
        const code = String(msg.code).toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendJSON(ws, { type: 'error', message: '部屋が見つかりません' });
          break;
        }
        if (room.serverRoom) {
          sendJSON(ws, { type: 'error', message: 'ゲームは既に開始しています' });
          break;
        }
        if (room.players.length >= MAX_PLAYERS) {
          sendJSON(ws, { type: 'error', message: '部屋が満員です' });
          break;
        }

        // Assign role: first available survivor slot, then killer
        const takenRoles = new Set(room.players.map((p) => p.role));
        let role: OnlineRole;
        if (!takenRoles.has('survivor1')) role = 'survivor1';
        else if (!takenRoles.has('survivor2')) role = 'survivor2';
        else if (!takenRoles.has('survivor3')) role = 'survivor3';
        else if (!takenRoles.has('killer')) role = 'killer';
        else {
          sendJSON(ws, { type: 'error', message: '部屋が満員です' });
          break;
        }

        const slot: PlayerSlot = { ws, role, charDefId: null, ready: false };
        room.players.push(slot);
        playerMap.set(ws, { room, slot });

        const playerCount = room.players.length;
        sendJSON(ws, { type: 'joined', role, playerCount });

        // Notify all other players
        for (const p of room.players) {
          if (p.ws !== ws) {
            sendJSON(p.ws, { type: 'player_joined', playerCount, role });
          }
        }

        // Send existing players' roles and char selections to the new player
        for (const p of room.players) {
          if (p.ws !== ws) {
            sendJSON(ws, { type: 'player_joined', playerCount, role: p.role });
            if (p.charDefId) {
              sendJSON(ws, { type: 'char_select', role: p.role, defId: p.charDefId });
            }
          }
        }

        console.log(`Room ${code}: ${role} joined (${playerCount}/${MAX_PLAYERS})`);
        break;
      }

      case 'char_select': {
        const info = playerMap.get(ws);
        if (!info) break;
        info.slot.charDefId = String(msg.defId);
        // Broadcast to other players
        for (const p of info.room.players) {
          if (p.ws !== ws) {
            sendJSON(p.ws, { type: 'char_select', role: info.slot.role, defId: msg.defId });
          }
        }
        break;
      }

      case 'start_game': {
        const info = playerMap.get(ws);
        if (!info || info.room.serverRoom) break;
        // Only the host can start the game
        if (ws !== info.room.hostWs) break;

        const room = info.room;
        // Need at least 2 players (1 killer + 1 survivor)
        const hasKiller = room.players.some((p) => p.role === 'killer');
        const hasSurvivor = room.players.some((p) => p.role === 'survivor1' || p.role === 'survivor2' || p.role === 'survivor3');
        if (!hasKiller || !hasSurvivor) {
          sendJSON(ws, { type: 'error', message: 'キラーとサバイバーが必要です' });
          break;
        }

        // All players must have selected a character
        const unready = room.players.filter((p) => !p.charDefId);
        if (unready.length > 0) {
          sendJSON(ws, { type: 'error', message: '全員のキャラクター選択を待ってください' });
          break;
        }

        // Build selection from char picks (defaults if not selected)
        const killerSlot = room.players.find((p) => p.role === 'killer');
        const s1Slot = room.players.find((p) => p.role === 'survivor1');
        const s2Slot = room.players.find((p) => p.role === 'survivor2');
        const s3Slot = room.players.find((p) => p.role === 'survivor3');

        const selection = ServerRoom.buildSelection(
          s1Slot?.charDefId ?? 'runner',
          s2Slot?.charDefId ?? 'dodger',
          s3Slot?.charDefId ?? 'strong',
          killerSlot?.charDefId ?? 'trapper',
        );

        // Determine which roles are bots (no human player)
        const botRoles: OnlineRole[] = [];
        if (!s1Slot) botRoles.push('survivor1');
        if (!s2Slot) botRoles.push('survivor2');
        if (!s3Slot) botRoles.push('survivor3');
        if (!killerSlot) botRoles.push('killer');

        // Create ServerRoom with headless game
        room.serverRoom = new ServerRoom(selection, {
          sendState: (_role, state) => {
            const p = room.players.find((pl) => pl.role === _role);
            if (p) sendJSON(p.ws, state);
          },
          broadcastState: (state) => {
            const data = JSON.stringify(state);
            for (const p of room.players) {
              sendRaw(p.ws, data);
            }
          },
          broadcastSound: (name) => {
            const data = JSON.stringify({ type: 'sound', name });
            for (const p of room.players) {
              sendRaw(p.ws, data);
            }
          },
        }, botRoles);

        // Notify all clients
        const seed = room.serverRoom.game.map.seed;
        for (const p of room.players) {
          sendJSON(p.ws, {
            type: 'game_start',
            seed,
            survivorDef: selection.survivorDef.id,
            survivor2Def: selection.survivor2Def.id,
            survivor3Def: selection.survivor3Def.id,
            killerDef: selection.killerDef.id,
            survivorColor: selection.survivorDef.color,
            survivor2Color: selection.survivor2Def.color,
            survivor3Color: selection.survivor3Def.color,
            killerColor: selection.killerDef.color,
          });
        }

        console.log(`Room ${room.code}: game started`);
        break;
      }

      case 'input': {
        const info = playerMap.get(ws);
        if (!info || !info.room.serverRoom) break;
        info.room.serverRoom.setInput(info.slot.role, msg as unknown as NetInput);
        break;
      }

      case 'sc_result': {
        const info = playerMap.get(ws);
        if (!info || !info.room.serverRoom) break;
        const data = msg as unknown as NetSkillCheckResult;
        info.room.serverRoom.applySkillCheckResult(info.slot.role, data.result);
        break;
      }

      case 'ping': {
        sendJSON(ws, { type: 'pong', t: msg.t });
        break;
      }

      // ─── Legacy relay support (for backward compat during transition) ───
      case 'relay': {
        const info = playerMap.get(ws);
        if (!info) break;
        const room = info.room;
        const innerData = msg.data as { type: string; [key: string]: unknown } | undefined;
        if (!innerData) break;

        // Forward char_select and start_game via relay for menu phase
        if (innerData.type === 'char_select') {
          info.slot.charDefId = String(innerData.defId);
          for (const p of room.players) {
            if (p.ws !== ws) {
              sendJSON(p.ws, { type: 'relay', data: innerData });
            }
          }
        } else if (innerData.type === 'start_game') {
          for (const p of room.players) {
            if (p.ws !== ws) {
              sendJSON(p.ws, { type: 'relay', data: innerData });
            }
          }
        } else if (innerData.type === 'input' && room.serverRoom) {
          // Input via relay → convert to direct input
          room.serverRoom.setInput(info.slot.role, innerData as unknown as NetInput);
        } else if (innerData.type === 'sc_result' && room.serverRoom) {
          const scData = innerData as unknown as NetSkillCheckResult;
          room.serverRoom.applySkillCheckResult(info.slot.role, scData.result);
        } else {
          // Generic relay forward
          const wrapped = JSON.stringify({ type: 'relay', data: innerData });
          for (const p of room.players) {
            if (p.ws !== ws) {
              sendRaw(p.ws, wrapped);
            }
          }
        }
        break;
      }

      case 'leave': {
        cleanup(ws);
        break;
      }
    }
  });

  ws.on('close', () => cleanup(ws));
  ws.on('error', () => cleanup(ws));
});

function cleanup(ws: WebSocket): void {
  const info = playerMap.get(ws);
  if (!info) return;
  const { room, slot } = info;
  playerMap.delete(ws);
  aliveSet.delete(ws);

  const idx = room.players.indexOf(slot);
  if (idx >= 0) room.players.splice(idx, 1);

  const playerCount = room.players.length;

  if (playerCount === 0) {
    // No players left — destroy room
    if (room.serverRoom) room.serverRoom.destroy();
    rooms.delete(room.code);
    console.log(`Room ${room.code}: destroyed (empty)`);
  } else {
    // Notify remaining players
    for (const p of room.players) {
      sendJSON(p.ws, { type: 'player_left', playerCount, role: slot.role });
    }

    // If host left, promote first remaining player
    if (ws === room.hostWs && room.players.length > 0) {
      room.hostWs = room.players[0].ws;
    }

    // If game was running and too few players, stop the game
    if (room.serverRoom) {
      const hasKiller = room.players.some((p) => p.role === 'killer');
      const hasSurvivor = room.players.some((p) => p.role === 'survivor1' || p.role === 'survivor2' || p.role === 'survivor3');
      if (!hasKiller || !hasSurvivor) {
        // Notify disconnect
        for (const p of room.players) {
          sendJSON(p.ws, { type: 'opponent_left' });
        }
      }
    }

    console.log(`Room ${room.code}: ${slot.role} left (${playerCount} remaining)`);
  }
}

console.log(`dot by dot dedicated server running on ws://localhost:${PORT}`);
