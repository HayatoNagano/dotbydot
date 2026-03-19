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
    const T = TILE_SIZE;
    const p = Math.floor(T / 16);

    // Locker body
    const baseColor = this.isOccupied ? '#555577' : '#444466';
    ctx.fillStyle = baseColor;
    ctx.fillRect(screenX + p, screenY + p, T - 2 * p, T - 2 * p);

    // 3D top edge
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(screenX + p, screenY + p, T - 2 * p, p);
    // Shadow bottom
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(screenX + p, screenY + T - 2 * p, T - 2 * p, p);

    // Door panel
    ctx.strokeStyle = '#666688';
    ctx.lineWidth = 1;
    ctx.strokeRect(screenX + 3 * p, screenY + 3 * p, T - 6 * p, T - 6 * p);

    // Vent slits at top
    ctx.fillStyle = '#333355';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(screenX + 5 * p, screenY + 4 * p + i * 2 * p, T - 10 * p, p);
    }

    // Handle
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(screenX + T - 5 * p, screenY + Math.floor(T / 2) - p, 2 * p, 3 * p);
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(screenX + T - 5 * p, screenY + Math.floor(T / 2) - p, 2 * p, p);

    // Occupied glow
    if (this.isOccupied) {
      ctx.fillStyle = 'rgba(100,100,200,0.15)';
      ctx.fillRect(screenX, screenY, T, T);
    }
  }
}
