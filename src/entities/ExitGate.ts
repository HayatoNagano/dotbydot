import { Entity } from './Entity';
import { TILE_SIZE } from '../constants';

export class ExitGate extends Entity {
  powered = false;
  openProgress = 0; // 0..1
  isOpen = false;
  private static readonly OPEN_TIME = 5; // seconds to open

  constructor(tileX: number, tileY: number) {
    super(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE);
  }

  get tileX(): number {
    return Math.floor(this.pos.x / TILE_SIZE);
  }

  get tileY(): number {
    return Math.floor(this.pos.y / TILE_SIZE);
  }

  powerOn(): void {
    this.powered = true;
  }

  /** Open the gate (survivor interacts) */
  tryOpen(dt: number): void {
    if (!this.powered || this.isOpen) return;
    this.openProgress += dt / ExitGate.OPEN_TIME;
    if (this.openProgress >= 1) {
      this.openProgress = 1;
      this.isOpen = true;
    }
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    const T = TILE_SIZE;
    const W = this.width; // 2 tiles
    const p = Math.floor(T / 16);

    if (this.isOpen) {
      // Open gate — bright, welcoming
      ctx.fillStyle = '#115533';
      ctx.fillRect(screenX, screenY, W, T);
      // Gate frame posts
      ctx.fillStyle = '#00ffaa';
      ctx.fillRect(screenX, screenY, 3 * p, T);
      ctx.fillRect(screenX + W - 3 * p, screenY, 3 * p, T);
      // Open space glow
      ctx.fillStyle = 'rgba(0,255,150,0.2)';
      ctx.fillRect(screenX + 3 * p, screenY, W - 6 * p, T);
      // EXIT text
      ctx.fillStyle = '#fff';
      ctx.font = `${8 * p}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', screenX + W / 2, screenY + T / 2 + 3 * p);
      ctx.textAlign = 'left';
      // Top light
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(screenX + W / 2 - 3 * p, screenY, 6 * p, 2 * p);
    } else if (this.powered) {
      // Powered, waiting to be opened
      ctx.fillStyle = '#555522';
      ctx.fillRect(screenX, screenY, W, T);
      // Frame posts
      ctx.fillStyle = '#888844';
      ctx.fillRect(screenX, screenY, 3 * p, T);
      ctx.fillRect(screenX + W - 3 * p, screenY, 3 * p, T);
      // Gate bars
      ctx.fillStyle = '#777733';
      for (let i = 1; i < 5; i++) {
        ctx.fillRect(screenX + Math.floor(W * i / 5), screenY + 2 * p, 2 * p, T - 4 * p);
      }
      // Blinking yellow light
      const blink = Math.sin(Date.now() / 300) > 0;
      ctx.fillStyle = blink ? '#ffff00' : '#887700';
      ctx.fillRect(screenX + W / 2 - 2 * p, screenY, 4 * p, 2 * p);
      // GATE text
      ctx.fillStyle = '#fff';
      ctx.font = `${7 * p}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('GATE', screenX + W / 2, screenY + T / 2 + 2 * p);
      ctx.textAlign = 'left';

      // Progress bar
      if (this.openProgress > 0) {
        const barH = 3 * p;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(screenX, screenY - barH - 2 * p, W, barH);
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(screenX, screenY - barH - 2 * p, W * this.openProgress, barH);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX, screenY - barH - 2 * p, W, barH);
      }
    } else {
      // Unpowered — dark, locked
      ctx.fillStyle = '#222222';
      ctx.fillRect(screenX, screenY, W, T);
      // Frame posts
      ctx.fillStyle = '#444444';
      ctx.fillRect(screenX, screenY, 3 * p, T);
      ctx.fillRect(screenX + W - 3 * p, screenY, 3 * p, T);
      // Gate bars
      ctx.fillStyle = '#333';
      for (let i = 1; i < 5; i++) {
        ctx.fillRect(screenX + Math.floor(W * i / 5), screenY + 2 * p, 2 * p, T - 4 * p);
      }
      // Dead light
      ctx.fillStyle = '#333';
      ctx.fillRect(screenX + W / 2 - 2 * p, screenY, 4 * p, 2 * p);
    }
  }
}
