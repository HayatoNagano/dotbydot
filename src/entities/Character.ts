import { Entity } from './Entity';
import { TileMap } from '../world/TileMap';
import { TILE_SIZE } from '../constants';
import { Direction } from '../types';

/** Optional extra collision check (e.g. dropped pallets blocking killer) */
export type ExtraCollisionCheck = (px: number, py: number, w: number, h: number) => boolean;

export class Character extends Entity {
  speed: number;
  walking = false;
  direction: Direction = Direction.Down;
  prevX = 0;
  prevY = 0;
  /** Accumulated time for walk animation (seconds) */
  animTime = 0;
  /** Whether the character moved this frame */
  isMoving = false;

  constructor(
    x: number,
    y: number,
    speed: number,
    public color: string,
  ) {
    super(x, y, TILE_SIZE * 0.9, TILE_SIZE * 0.9);
    this.speed = speed;
    this.prevX = x;
    this.prevY = y;
  }

  move(dx: number, dy: number, dt: number, map: TileMap, extraCollision?: ExtraCollisionCheck): void {
    this.isMoving = dx !== 0 || dy !== 0;
    if (this.isMoving) {
      const rate = this.walking ? 3 : 6;
      this.animTime += dt * rate;
    }
    if (dx === 0 && dy === 0) {
      // Sync prev position when idle to prevent interpolation jitter
      this.prevX = this.pos.x;
      this.prevY = this.pos.y;
      return;
    }

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
    if (!map.collidesRect(nextX, this.pos.y, this.width, this.height) &&
        (!extraCollision || !extraCollision(nextX, this.pos.y, this.width, this.height))) {
      this.pos.x = nextX;
    }

    // Try Y movement
    const nextY = this.pos.y + moveY;
    if (!map.collidesRect(this.pos.x, nextY, this.width, this.height) &&
        (!extraCollision || !extraCollision(this.pos.x, nextY, this.width, this.height))) {
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
