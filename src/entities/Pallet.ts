import { Entity } from './Entity';
import { TILE_SIZE } from '../constants';

export class Pallet extends Entity {
  dropped = false;
  /** 'h' = horizontal passage (pallet blocks left-right), 'v' = vertical passage (pallet blocks up-down) */
  orientation: 'h' | 'v';

  constructor(x: number, y: number, orientation: 'h' | 'v' = 'v') {
    // Pallet occupies a full tile
    super(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    this.orientation = orientation;
  }

  get tileX(): number {
    return Math.floor(this.pos.x / TILE_SIZE);
  }

  get tileY(): number {
    return Math.floor(this.pos.y / TILE_SIZE);
  }

  drop(): void {
    this.dropped = true;
    // Expand to cover the full 2-tile doorway
    if (this.orientation === 'h') {
      // Door in vertical wall: 2 tiles stacked vertically
      this.height = TILE_SIZE * 2;
      // Shift up by half a tile so the pallet centers on the doorway
      this.pos.y -= TILE_SIZE * 0.5;
    } else {
      // Door in horizontal wall: 2 tiles side by side
      this.width = TILE_SIZE * 2;
      this.pos.x -= TILE_SIZE * 0.5;
    }
  }

  /** Killer can break a dropped pallet */
  breakPallet(): void {
    this.dropped = false;
    this.width = TILE_SIZE;
    this.height = TILE_SIZE;
    // Mark as destroyed - remove from game
    this.pos.x = -9999;
    this.pos.y = -9999;
  }

  get isDestroyed(): boolean {
    return this.pos.x < 0;
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    if (this.isDestroyed) return;
    const T = TILE_SIZE;
    const p = Math.floor(T / 12);

    if (this.dropped) {
      // Dropped pallet — blocks the full 2-tile doorway
      const W = this.width;
      const H = this.height;

      if (this.orientation === 'h') {
        // Horizontal plank spanning 2 tiles vertically (blocks left-right passage)
        const py = screenY + Math.floor(H * 0.35);
        const ph = Math.floor(H * 0.3);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(screenX - 2 * p, py + ph, W + 4 * p, p);
        // Main plank
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(screenX - 2 * p, py, W + 4 * p, ph);
        // Top board
        ctx.fillStyle = '#9a5420';
        ctx.fillRect(screenX - 2 * p, py, W + 4 * p, 2 * p);
        // Bottom board
        ctx.fillStyle = '#7a3a0e';
        ctx.fillRect(screenX - 2 * p, py + ph - 2 * p, W + 4 * p, 2 * p);
        // Support beams
        ctx.fillStyle = '#6B3410';
        ctx.fillRect(screenX + W / 2 - p, py, 2 * p, ph);
        ctx.fillRect(screenX + 2 * p, py, 2 * p, ph);
        ctx.fillRect(screenX + W - 4 * p, py, 2 * p, ph);
        // Wood grain
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(screenX, py + 3 * p, W, p);
        ctx.fillRect(screenX - p, py + Math.floor(ph * 0.7), W + 2 * p, p);
        // Nails
        ctx.fillStyle = '#aaa';
        ctx.fillRect(screenX + p, py + p, p, p);
        ctx.fillRect(screenX + W - 2 * p, py + p, p, p);
        ctx.fillRect(screenX + p, py + ph - 2 * p, p, p);
        ctx.fillRect(screenX + W - 2 * p, py + ph - 2 * p, p, p);
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(screenX - 2 * p, py, W + 4 * p, p);
      } else {
        // Vertical plank spanning 2 tiles horizontally (blocks up-down passage)
        const px = screenX + Math.floor(W * 0.35);
        const pw = Math.floor(W * 0.3);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px + pw, screenY - 2 * p, p, H + 4 * p);
        // Main plank
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(px, screenY - 2 * p, pw, H + 4 * p);
        // Left board
        ctx.fillStyle = '#9a5420';
        ctx.fillRect(px, screenY - 2 * p, 2 * p, H + 4 * p);
        // Right board
        ctx.fillStyle = '#7a3a0e';
        ctx.fillRect(px + pw - 2 * p, screenY - 2 * p, 2 * p, H + 4 * p);
        // Support beams
        ctx.fillStyle = '#6B3410';
        ctx.fillRect(px, screenY + H / 2 - p, pw, 2 * p);
        ctx.fillRect(px, screenY + 2 * p, pw, 2 * p);
        ctx.fillRect(px, screenY + H - 4 * p, pw, 2 * p);
        // Wood grain
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(px + 3 * p, screenY, p, H);
        // Nails
        ctx.fillStyle = '#aaa';
        ctx.fillRect(px + p, screenY + p, p, p);
        ctx.fillRect(px + p, screenY + H - 2 * p, p, p);
        ctx.fillRect(px + pw - 2 * p, screenY + p, p, p);
        ctx.fillRect(px + pw - 2 * p, screenY + H - 2 * p, p, p);
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(px, screenY - 2 * p, p, H + 4 * p);
      }
    } else {
      // Standing pallet — leaning against wall, ready to drop
      if (this.orientation === 'v') {
        // Standing upright (will fall horizontally)
        const px = screenX + Math.floor(T * 0.2);
        const pw = Math.floor(T * 0.6);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(px + p, screenY + T - p, pw, p);
        // Frame
        ctx.fillStyle = '#A0522D';
        ctx.fillRect(px, screenY + p, pw, T - 2 * p);
        // Horizontal planks
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(px + p, screenY + 2 * p, pw - 2 * p, 2 * p);
        ctx.fillRect(px + p, screenY + Math.floor(T * 0.45), pw - 2 * p, 2 * p);
        ctx.fillRect(px + p, screenY + T - 4 * p, pw - 2 * p, 2 * p);
        // Vertical supports
        ctx.fillStyle = '#6B3410';
        ctx.fillRect(px + p, screenY + p, 2 * p, T - 2 * p);
        ctx.fillRect(px + pw - 3 * p, screenY + p, 2 * p, T - 2 * p);
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(px, screenY + p, p, T - 2 * p);
      } else {
        // Standing sideways (will fall vertically)
        const py = screenY + Math.floor(T * 0.2);
        const ph = Math.floor(T * 0.6);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(screenX + T - p, py + p, p, ph);
        // Frame
        ctx.fillStyle = '#A0522D';
        ctx.fillRect(screenX + p, py, T - 2 * p, ph);
        // Planks
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(screenX + 2 * p, py + p, 2 * p, ph - 2 * p);
        ctx.fillRect(screenX + Math.floor(T * 0.45), py + p, 2 * p, ph - 2 * p);
        ctx.fillRect(screenX + T - 4 * p, py + p, 2 * p, ph - 2 * p);
        // Supports
        ctx.fillStyle = '#6B3410';
        ctx.fillRect(screenX + p, py + p, T - 2 * p, 2 * p);
        ctx.fillRect(screenX + p, py + ph - 3 * p, T - 2 * p, 2 * p);
        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(screenX + p, py, T - 2 * p, p);
      }
    }
  }
}
