import { Ability } from './Ability';
import { Character } from '../entities/Character';
import { Direction } from '../types';

export class BodyBlockAbility extends Ability {
  private character: Character;
  invincible = false;
  private dashSpeed = 650;
  /** Set to true when the tackle connects with a carrying killer */
  tackleHit = false;

  constructor(character: Character) {
    super('Body Block', 60, 0.5);
    this.character = character;
  }

  protected onActivate(): void {
    this.invincible = true;
    this.tackleHit = false;
    const dashDist = this.dashSpeed * this.duration;
    let dx = 0, dy = 0;
    switch (this.character.direction) {
      case Direction.Up: dy = -dashDist; break;
      case Direction.Down: dy = dashDist; break;
      case Direction.Left: dx = -dashDist; break;
      case Direction.Right: dx = dashDist; break;
    }
    (this as any)._dashDx = dx / this.duration;
    (this as any)._dashDy = dy / this.duration;
  }

  protected onUpdate(_dt: number): void {
    // Movement + collision handled externally in Game.ts
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
    this.tackleHit = false;
  }
}
