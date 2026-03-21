/**
 * WebSocket client for online multiplayer.
 * Handles connection, room management, and message relay.
 */

import type { NetMessage } from './protocol';

export type ServerMessage =
  | { type: 'room_created'; code: string }
  | { type: 'joined'; role: 'guest'; guestIndex: number }
  | { type: 'player_joined'; playerCount: number; guestIndex: number }
  | { type: 'player_left'; playerCount: number }
  | { type: 'player_count'; playerCount: number }
  | { type: 'opponent_left' }
  | { type: 'relay'; data: NetMessage; guestIndex?: number }
  | { type: 'error'; message: string };

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export class NetworkClient {
  private ws: WebSocket | null = null;
  private listeners: ((msg: ServerMessage) => void)[] = [];
  connected = false;
  roomCode: string | null = null;
  role: 'host' | 'guest' | null = null;
  error: string | null = null;
  /** Guest index (0=survivor1, 1=survivor2). Set when joining a room. */
  guestIndex = 0;
  /** Current player count in the room (host included) */
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
        this.role = null;
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
        this.role = 'host';
        this.playerCount = 1;
        break;
      case 'joined':
        this.role = 'guest';
        this.guestIndex = msg.guestIndex;
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

  createRoom(): void {
    this.send({ type: 'create_room' });
  }

  joinRoom(code: string): void {
    this.send({ type: 'join_room', code });
  }

  /** Send a game message (wrapped in relay) */
  relay(data: NetMessage): void {
    this.send({ type: 'relay', data });
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
    this.role = null;
    this.error = null;
    this.listeners = [];
    this.playerCount = 1;
    this.guestIndex = 0;
  }
}
