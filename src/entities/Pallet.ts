import { Entity } from './Entity';
import { TILE_SIZE } from '../constants';

export class Pallet extends Entity {
  dropped = false;

  constructor(x: number, y: number) {
    super(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  get tileX(): number {
    return Math.floor(this.pos.x / TILE_SIZE);
  }

  get tileY(): number {
    return Math.floor(this.pos.y / TILE_SIZE);
  }

  drop(): void {
    this.dropped = true;
  }

  /** Killer can break a dropped pallet */
  breakPallet(): void {
    this.dropped = false;
    // Mark as destroyed - remove from game
    this.pos.x = -9999;
    this.pos.y = -9999;
  }

  get isDestroyed(): boolean {
    return this.pos.x < 0;
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    if (this.isDestroyed) return;

    if (this.dropped) {
      // Dropped pallet - horizontal bar
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(screenX, screenY + TILE_SIZE * 0.3, TILE_SIZE, TILE_SIZE * 0.4);
    } else {
      // Standing pallet
      ctx.fillStyle = '#A0522D';
      ctx.fillRect(screenX + TILE_SIZE * 0.3, screenY, TILE_SIZE * 0.4, TILE_SIZE);
    }
  }
}
