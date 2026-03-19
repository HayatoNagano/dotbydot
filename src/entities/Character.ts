import { Entity } from './Entity';
import { TileMap } from '../world/TileMap';
import { TILE_SIZE } from '../constants';
import { Direction } from '../types';

export class Character extends Entity {
  speed: number;
  walking = false;
  direction: Direction = Direction.Down;
  private prevX = 0;
  private prevY = 0;

  constructor(
    x: number,
    y: number,
    speed: number,
    public color: string,
  ) {
    super(x, y, TILE_SIZE * 0.75, TILE_SIZE * 0.75);
    this.speed = speed;
    this.prevX = x;
    this.prevY = y;
  }

  move(dx: number, dy: number, dt: number, map: TileMap): void {
    if (dx === 0 && dy === 0) return;

    // Normalize diagonal movement
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;

    // Update facing direction
    if (Math.abs(dx) > Math.abs(dy)) {
      this.direction = dx > 0 ? Direction.Right : Direction.Left;
    } else {
      this.direction = dy > 0 ? Direction.Down : Direction.Up;
    }

    const currentSpeed = this.walking ? this.speed * 0.45 : this.speed;
    const moveX = dx * currentSpeed * dt;
    const moveY = dy * currentSpeed * dt;

    this.prevX = this.pos.x;
    this.prevY = this.pos.y;

    // Try X movement
    const nextX = this.pos.x + moveX;
    if (!map.collidesRect(nextX, this.pos.y, this.width, this.height)) {
      this.pos.x = nextX;
    }

    // Try Y movement
    const nextY = this.pos.y + moveY;
    if (!map.collidesRect(this.pos.x, nextY, this.width, this.height)) {
      this.pos.y = nextY;
    }
  }

  /** Get interpolated position for smooth rendering */
  getLerpPos(alpha: number): { x: number; y: number } {
    return {
      x: this.prevX + (this.pos.x - this.prevX) * alpha,
      y: this.prevY + (this.pos.y - this.prevY) * alpha,
    };
  }
}
