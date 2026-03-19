import { Entity } from './Entity';
import { Direction } from '../types';
import { TileMap } from '../world/TileMap';
import { TILE_SIZE } from '../constants';

export class Axe extends Entity {
  alive = true;
  private dx: number;
  private dy: number;
  private static readonly SPEED = 200; // px/s
  private static readonly MAX_RANGE = TILE_SIZE * 15;
  private distanceTraveled = 0;

  constructor(x: number, y: number, direction: Direction) {
    super(x, y, 6, 6);
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
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(screenX, screenY, this.width, this.height);
    // Spin effect
    ctx.fillStyle = '#888888';
    const angle = Date.now() / 50;
    ctx.fillRect(
      screenX + 3 + Math.cos(angle) * 2,
      screenY + 3 + Math.sin(angle) * 2,
      2, 2,
    );
  }
}
