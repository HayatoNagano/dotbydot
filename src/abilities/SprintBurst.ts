import { Ability } from './Ability';
import { Character } from '../entities/Character';

export class SprintBurst extends Ability {
  private character: Character;
  private originalSpeed: number;

  constructor(character: Character) {
    super('Sprint Burst', 40, 3);
    this.character = character;
    this.originalSpeed = character.speed;
  }

  protected onActivate(): void {
    this.originalSpeed = this.character.speed;
    this.character.speed = this.originalSpeed * 2;
  }

  protected onUpdate(_dt: number): void {
    // Speed boost maintained during duration
  }

  protected onDeactivate(): void {
    this.character.speed = this.originalSpeed;
  }
}
