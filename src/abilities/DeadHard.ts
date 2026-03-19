import { Ability } from './Ability';
import { Character } from '../entities/Character';
import { Direction } from '../types';
import { TileMap } from '../world/TileMap';

export class DeadHard extends Ability {
  private character: Character;
  invincible = false;
  private dashSpeed = 200;

  constructor(character: Character) {
    super('Dead Hard', 60, 0.5);
    this.character = character;
  }

  protected onActivate(): void {
    this.invincible = true;
    // Dash forward
    const dashDist = this.dashSpeed * this.duration;
    let dx = 0, dy = 0;
    switch (this.character.direction) {
      case Direction.Up: dy = -dashDist; break;
      case Direction.Down: dy = dashDist; break;
      case Direction.Left: dx = -dashDist; break;
      case Direction.Right: dx = dashDist; break;
    }
    // Store dash velocity for onUpdate
    (this as any)._dashDx = dx / this.duration;
    (this as any)._dashDy = dy / this.duration;
  }

  protected onUpdate(dt: number): void {
    // Movement is handled externally using the dash velocity
  }

  getDashVelocity(): { dx: number; dy: number } {
    if (!this._isActive) return { dx: 0, dy: 0 };
    return {
      dx: (this as any)._dashDx ?? 0,
      dy: (this as any)._dashDy ?? 0,
    };
  }

  protected onDeactivate(): void {
    this.invincible = false;
  }
}
