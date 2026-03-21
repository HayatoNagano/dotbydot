/**
 * WebSocket client for online multiplayer.
 * Handles connection, room management, and message relay.
 */

import type { NetMessage, OnlineRole } from './protocol';

export type ServerMessage =
  | { type: 'room_created'; code: string; role?: OnlineRole }
  | { type: 'joined'; role: OnlineRole; playerCount: number }
  | { type: 'player_joined'; playerCount: number; role: OnlineRole }
  | { type: 'player_left'; playerCount: number; role: OnlineRole }
  | { type: 'player_count'; playerCount: number }
  | { type: 'opponent_left' }
  | { type: 'relay'; data: NetMessage; guestIndex?: number }
  | { type: 'game_start'; seed: number; survivorDef: string; survivor2Def: string; killerDef: string; survivorColor: string; survivor2Color: string; killerColor: string }
  | { type: 'char_select'; role: OnlineRole; defId: string }
  | { type: 'state'; [key: string]: unknown }
  | { type: 'sound'; name: string }
  | { type: 'error'; message: string };

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export class NetworkClient {
  private ws: WebSocket | null = null;
  private listeners: ((msg: ServerMessage) => void)[] = [];
  connected = false;
  roomCode: string | null = null;
  /** Player's assigned role in the room */
  myRole: OnlineRole | null = null;
  error: string | null = null;
  /** Current player count in the room */
  playerCount = 1;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.error = null;
      try {
        this.ws = new WebSocket(WS_URL);
      } catch {
        this.error = 'サーバーに接続できません';
        reject(new Error(this.error));
        return;
      }

      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.roomCode = null;
        this.myRole = null;
      };

      this.ws.onerror = () => {
        this.error = 'サーバーに接続できません';
        this.connected = false;
        reject(new Error(this.error));
      };

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerMessage;
          this.handleServerMessage(msg);
          for (const fn of this.listeners) fn(msg);
        } catch { /* ignore parse errors */ }
      };
    });
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'room_created':
        this.roomCode = msg.code;
        if (msg.role) this.myRole = msg.role;
        this.playerCount = 1;
        break;
      case 'joined':
        this.myRole = msg.role;
        this.playerCount = msg.playerCount;
        break;
      case 'player_joined':
        this.playerCount = msg.playerCount;
        break;
      case 'player_left':
        this.playerCount = msg.playerCount;
        break;
      case 'player_count':
        this.playerCount = msg.playerCount;
        break;
      case 'error':
        this.error = msg.message;
        break;
      case 'opponent_left':
        this.error = '相手が切断しました';
        break;
    }
  }

  onMessage(fn: (msg: ServerMessage) => void): void {
    this.listeners.push(fn);
  }

  removeListener(fn: (msg: ServerMessage) => void): void {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }

  createRoom(role: OnlineRole = 'killer'): void {
    this.send({ type: 'create_room', role });
  }

  joinRoom(code: string): void {
    this.send({ type: 'join_room', code });
  }

  /** Send a game message (wrapped in relay — legacy compat) */
  relay(data: NetMessage): void {
    this.send({ type: 'relay', data });
  }

  /** Send a message directly to the server */
  sendDirect(msg: object): void {
    this.send(msg);
  }

  private send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.send({ type: 'leave' });
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.roomCode = null;
    this.myRole = null;
    this.error = null;
    this.listeners = [];
    this.playerCount = 1;
  }
}
