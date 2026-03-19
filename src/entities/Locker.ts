import { Entity } from './Entity';
import { Survivor } from './Survivor';
import { TILE_SIZE } from '../constants';

export class Locker extends Entity {
  occupant: Survivor | null = null;

  constructor(x: number, y: number) {
    super(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  get tileX(): number {
    return Math.floor(this.pos.x / TILE_SIZE);
  }

  get tileY(): number {
    return Math.floor(this.pos.y / TILE_SIZE);
  }

  get isOccupied(): boolean {
    return this.occupant !== null;
  }

  enter(survivor: Survivor): void {
    this.occupant = survivor;
  }

  exit(): Survivor | null {
    const s = this.occupant;
    if (s) {
      s.pos.x = this.pos.x;
      s.pos.y = this.pos.y;
      this.occupant = null;
    }
    return s;
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    // Locker shape
    ctx.fillStyle = this.isOccupied ? '#555577' : '#444466';
    ctx.fillRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Door lines
    ctx.strokeStyle = '#666688';
    ctx.lineWidth = 1;
    ctx.strokeRect(screenX + 2, screenY + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    // Handle
    ctx.fillStyle = '#888888';
    ctx.fillRect(screenX + TILE_SIZE - 5, screenY + TILE_SIZE / 2 - 1, 2, 2);
  }
}
