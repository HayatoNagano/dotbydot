import { Entity } from './Entity';
import { Direction } from '../types';
import { TileMap } from '../world/TileMap';
import { TILE_SIZE } from '../constants';

export class Axe extends Entity {
  alive = true;
  private dx: number;
  private dy: number;
  private static readonly SPEED = 600; // px/s
  private static readonly MAX_RANGE = TILE_SIZE * 15;
  private distanceTraveled = 0;

  constructor(x: number, y: number, direction: Direction) {
    super(x, y, TILE_SIZE * 0.4, TILE_SIZE * 0.4);
    switch (direction) {
      case Direction.Up:    this.dx = 0; this.dy = -1; break;
      case Direction.Down:  this.dx = 0; this.dy = 1; break;
      case Direction.Left:  this.dx = -1; this.dy = 0; break;
      case Direction.Right: this.dx = 1; this.dy = 0; break;
    }
  }

  update(dt: number, map: TileMap): void {
    if (!this.alive) return;

    const move = Axe.SPEED * dt;
    this.pos.x += this.dx * move;
    this.pos.y += this.dy * move;
    this.distanceTraveled += move;

    // Wall collision
    const tileX = Math.floor(this.centerX / TILE_SIZE);
    const tileY = Math.floor(this.centerY / TILE_SIZE);
    if (!map.isWalkable(tileX, tileY)) {
      this.alive = false;
    }

    // Range limit
    if (this.distanceTraveled >= Axe.MAX_RANGE) {
      this.alive = false;
    }
  }

  render(ctx: CanvasRenderingContext2D, screenX: number, screenY: number): void {
    if (!this.alive) return;
    const W = this.width;
    const p = Math.max(1, Math.floor(W / 6));
    const cx = screenX + W / 2;
    const cy = screenY + W / 2;

    // Spinning axe
    const angle = Date.now() / 80;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // Handle
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(-p, -W / 2 + p, 2 * p, W - 2 * p);
    // Blade head
    ctx.fillStyle = '#bbb';
    ctx.fillRect(-3 * p, -W / 2 + p, 3 * p, 3 * p);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(-3 * p, -W / 2 + p, 3 * p, p);
    ctx.restore();

    // Motion trail
    ctx.fillStyle = 'rgba(200,200,200,0.15)';
    ctx.fillRect(screenX - p, screenY - p, W + 2 * p, W + 2 * p);
  }
}
