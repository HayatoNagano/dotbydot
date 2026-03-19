import { Vector2 } from '../types';

export class Camera {
  x = 0;
  y = 0;

  constructor(
    public viewportWidth: number,
    public viewportHeight: number,
    public worldWidth: number,
    public worldHeight: number,
  ) {}

  follow(target: Vector2): void {
    this.x = target.x - this.viewportWidth / 2;
    this.y = target.y - this.viewportHeight / 2;

    // Clamp to world bounds
    this.x = Math.max(0, Math.min(this.x, this.worldWidth - this.viewportWidth));
    this.y = Math.max(0, Math.min(this.y, this.worldHeight - this.viewportHeight));
  }
}
