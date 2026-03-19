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
    if (this.isOpen) {
      ctx.fillStyle = '#00ffaa';
      ctx.fillRect(screenX, screenY, this.width, this.height);
      ctx.fillStyle = '#000';
      ctx.font = '9px monospace';
      ctx.fillText('EXIT', screenX + 4, screenY + 11);
    } else if (this.powered) {
      ctx.fillStyle = '#888800';
      ctx.fillRect(screenX, screenY, this.width, this.height);
      ctx.fillStyle = '#fff';
      ctx.font = '8px monospace';
      ctx.fillText('GATE', screenX + 4, screenY + 11);

      // Open progress bar
      if (this.openProgress > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(screenX, screenY - 5, this.width, 4);
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(screenX, screenY - 5, this.width * this.openProgress, 4);
      }
    } else {
      // Unpowered
      ctx.fillStyle = '#333333';
      ctx.fillRect(screenX, screenY, this.width, this.height);
      ctx.fillStyle = '#666';
      ctx.font = '8px monospace';
      ctx.fillText('GATE', screenX + 4, screenY + 11);
    }
  }
}
